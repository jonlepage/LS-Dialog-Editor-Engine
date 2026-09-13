// LSDE Dialog Engine — a scene is never left open with nothing able to move it
// (C++ port of traversal-robustness.test.ts)
//
// Found during a Unity integration, and every one of them reproduced before a line was changed:
//
//   1. an exception on an isAsync track, or on a track a join released, escaped through the track
//      that opened it — which was left running on a block it had already left
//   2. every synchronous next() added frames to the stack; in C++ a stack overflow is not an
//      exception, it is a dead process
//   3. only the type handler sat inside the try: a throwing validation, onBeforeBlock, resolver,
//      onSceneEnter or onSceneExit froze the scene — the last one beyond engine.stop()
//   4. a deadlock was only noticed when a track ENDED, never when the last one PARKED
//   5. nothing told onSceneExit why the scene ended
//
// And one the garbage collected runtimes share with this one: next() called from a worker thread
// ran every handler after it off the game thread, with nothing to say so.
//
// The rule these tests hold is problem 11 of MIGRATION-V2.md: a fault closes the WHOLE scene —
// cleanups run, tracks cancelled, onSceneExit fired — and only then reaches whoever called start(),
// next() or resolve().

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>

#include <algorithm>
#include <functional>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using namespace lsde;

namespace {

// ─── Builders ────────────────────────────────────────────────────────────────

BlueprintBlock block(const std::string& id, const std::string& type) {
    BlueprintBlock b;
    b.id = id;
    b.key = "__blueprints__.s1." + id;
    b.type = type;
    return b;
}

BlueprintBlock dialog(const std::string& id) { return block(id, BlockType::Dialog); }

BlueprintBlock wired(BlueprintBlock b, const std::string& to, const std::string& port = Ports::Out) {
    b.next.push_back(Link{port, to, "in"});
    return b;
}

BlueprintBlock async(BlueprintBlock b) {
    b.props["isAsync"] = true;
    return b;
}

BlueprintBlock waitsFor(BlueprintBlock b, std::vector<std::string> ids) {
    b.props["waitForBlocks"] = std::move(ids);
    return b;
}

ConditionTest flag() {
    ConditionTest t;
    t.dict = "game";
    t.entry = "flag";
    t.op = ConditionOperator::Equals;
    t.value = true;
    return t;
}

ConditionCase whenCase(const std::string& port) {
    ConditionCase c;
    c.port = port;
    c.when = std::vector<ConditionTest>{flag()};
    return c;
}

BlueprintExport oneScene(std::vector<BlueprintBlock> blocks) {
    BlueprintScene scene;
    scene.scene = "s1";
    scene.id = "sc_test0001";
    if (!blocks.empty()) scene.start = blocks[0].id;
    scene.blocks = std::move(blocks);

    BlueprintExport bp;
    bp.format = "lsde-blueprints";
    bp.version = 1;
    bp.generator = Generator{"LSDE", "2.0.3"};
    bp.exportedAt = "2026-09-07T00:00:00.000Z";
    bp.project = "Test";
    bp.locales = {"en"};
    bp.referenceLocale = "en";
    bp.scenes.push_back(std::move(scene));
    return bp;
}

std::vector<BlueprintBlock> twoBlocks() {
    return {wired(dialog("D1"), "D2"), dialog("D2")};
}

// ─── Harness ─────────────────────────────────────────────────────────────────

/// A scene whose handlers advance at once, except the blocks listed in `hold`: those keep their
/// next() for the test to call — the player clicking.
struct Played {
    DialogueEngine engine;
    std::unique_ptr<ISceneHandle> handle;
    std::vector<SceneContext> exits;
    std::vector<std::string> cleaned;
    std::map<std::string, std::function<void()>> held;
    std::vector<std::string> hold;
    std::string throwAt;
};

std::unique_ptr<Played> setup(
    std::vector<BlueprintBlock> blocks,
    std::vector<std::string> hold = {},
    std::string throwAt = "",
    const std::function<void(DialogueEngine&)>& configure = {}) {
    auto p = std::make_unique<Played>();
    p->hold = std::move(hold);
    p->throwAt = std::move(throwAt);
    EXPECT_TRUE(p->engine.init({oneScene(std::move(blocks))}).errors.empty());

    Played* raw = p.get();
    auto dispatch = [raw](const BlueprintBlock* b, IBaseBlockContext* ctx, std::function<void()> next) -> CleanupFn {
        if (b->id == raw->throwAt) throw std::runtime_error("boom in " + b->id);
        if (auto* action = dynamic_cast<IActionContext*>(ctx)) action->resolve();
        if (std::find(raw->hold.begin(), raw->hold.end(), b->id) != raw->hold.end()) {
            raw->held[b->id] = next;
        } else {
            next();
        }
        std::string id = b->id;
        return [raw, id]() { raw->cleaned.push_back(id); };
    };

    p->engine.onDialog([dispatch](ISceneHandle*, const BlueprintBlock* b, IDialogContext* c, std::function<void()> next) {
        return dispatch(b, c, next);
    });
    p->engine.onChoice([dispatch](ISceneHandle*, const BlueprintBlock* b, IChoiceContext* c, std::function<void()> next) {
        return dispatch(b, c, next);
    });
    p->engine.onAction([dispatch](ISceneHandle*, const BlueprintBlock* b, IActionContext* c, std::function<void()> next) {
        return dispatch(b, c, next);
    });
    p->engine.onResolveCondition([](const ConditionTest&) { return true; });
    p->engine.onSceneExit([raw](const SceneLifecycleArgs& args) { raw->exits.push_back(args.context); });
    if (configure) configure(p->engine);

    p->handle = p->engine.scene("s1");
    return p;
}

/// The whole contract of a fault, in one place.
void expectClosedByFault(Played& p, const std::function<void()>& run, const std::string& message) {
    bool thrown = false;
    try {
        run();
    } catch (const std::exception& error) {
        thrown = true;
        EXPECT_EQ(message, std::string(error.what()));
    }
    EXPECT_TRUE(thrown) << "expected an exception: " << message;
    EXPECT_FALSE(p.handle->isRunning());
    EXPECT_FALSE(p.engine.isRunning());
    ASSERT_EQ(1u, p.exits.size());
    EXPECT_EQ(std::string(SceneEndReason::Faulted), p.exits[0].reason.value_or(""));
}

std::string reasonOf(const Played& p) {
    return p.exits.size() == 1 ? p.exits[0].reason.value_or("") : "<" + std::to_string(p.exits.size()) + " exits>";
}

const int kPasses = 10000;

} // namespace

// ─── 1. A fault on another track ─────────────────────────────────────────────

TEST(TraversalRobustness, AnIsAsyncChildThatThrowsClosesTheSceneAndTheParentLeavesItsBlock) {
    auto p = setup({wired(wired(dialog("D1"), "D2"), "BG"), dialog("D2"), async(dialog("BG"))}, {"D1"}, "BG");
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "boom in BG");
    EXPECT_NE(std::find(p->cleaned.begin(), p->cleaned.end(), "D1"), p->cleaned.end());
}

TEST(TraversalRobustness, ATrackReleasedByAJoinThatThrowsClosesTheScene) {
    auto p = setup({wired(wired(dialog("D1"), "J"), "BG"), waitsFor(dialog("J"), {"BG"}), async(dialog("BG"))},
                   {"BG"}, "J");
    p->handle->start();
    EXPECT_TRUE(p->handle->isRunning());

    expectClosedByFault(*p, [&] { p->held["BG"](); }, "boom in J");
    EXPECT_NE(std::find(p->cleaned.begin(), p->cleaned.end(), "BG"), p->cleaned.end());
}

TEST(TraversalRobustness, AParallelTrackThatThrowsWhileTheMainFlowWaitsForAClickClosesTheScene) {
    auto p = setup({wired(wired(dialog("D1"), "M"), "BG"), dialog("M"), wired(async(dialog("BG")), "BG2"), dialog("BG2")},
                   {"M", "BG"}, "BG2");
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["BG"](); }, "boom in BG2");
    // The main flow's bubble is released too: the scene is gone, not just the branch.
    EXPECT_NE(std::find(p->cleaned.begin(), p->cleaned.end(), "M"), p->cleaned.end());
}

TEST(TraversalRobustness, ACleanupThatThrowsWhileAParallelTrackIsAliveClosesTheScene) {
    auto p = setup({wired(wired(dialog("D1"), "D2"), "BG"), dialog("D2"), async(dialog("BG"))}, {"D1", "BG"});
    Played* raw = p.get();
    p->handle->onDialogId("D1", [raw](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        raw->held["D1"] = next;
        return []() { throw std::runtime_error("cleanup boom"); };
    });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "cleanup boom");
    EXPECT_NE(std::find(p->cleaned.begin(), p->cleaned.end(), "BG"), p->cleaned.end());
}

// ─── 3. Every callback of the game, not only the type handler ────────────────

TEST(TraversalRobustness, OnValidateNextBlockThatThrows) {
    auto p = setup(twoBlocks(), {"D1"}, "", [](DialogueEngine& e) {
        e.onValidateNextBlock([](const ValidateNextBlockArgs& args) {
            if (args.nextBlock->id == "D2") throw std::runtime_error("validate boom");
            return ValidationResult::ok();
        });
    });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "validate boom");
}

TEST(TraversalRobustness, OnInvalidateBlockThatThrows) {
    auto p = setup(twoBlocks(), {"D1"}, "", [](DialogueEngine& e) {
        e.onValidateNextBlock([](const ValidateNextBlockArgs& args) {
            return args.nextBlock->id == "D2" ? ValidationResult::fail("no") : ValidationResult::ok();
        });
        e.onInvalidateBlock([](const InvalidateBlockArgs&) { throw std::runtime_error("invalidate boom"); });
    });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "invalidate boom");
}

TEST(TraversalRobustness, OnBeforeBlockThatThrowsBeforeItResolves) {
    auto p = setup(twoBlocks(), {"D1"}, "", [](DialogueEngine& e) {
        e.onBeforeBlock([](const BeforeBlockArgs& args) {
            if (args.block->id == "D2") throw std::runtime_error("before boom");
            args.resolve();
        });
    });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "before boom");
}

TEST(TraversalRobustness, OnBeforeBlockThatThrowsAfterASynchronousResolve) {
    auto p = setup(twoBlocks(), {"D1"}, "", [](DialogueEngine& e) {
        e.onBeforeBlock([](const BeforeBlockArgs& args) {
            args.resolve();
            throw std::runtime_error("before boom");
        });
    });

    expectClosedByFault(*p, [&] { p->handle->start(); }, "before boom");
}

TEST(TraversalRobustness, OnResolveConditionThatThrowsOnACondition) {
    auto condition = block("C", BlockType::Condition);
    condition.cases = {whenCase("out")};
    auto p = setup({wired(dialog("D1"), "C"), wired(condition, "D2", "out"), dialog("D2")}, {"D1"}, "",
                   [](DialogueEngine& e) {
                       e.onResolveCondition([](const ConditionTest&) -> bool { throw std::runtime_error("resolver boom"); });
                   });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "resolver boom");
}

TEST(TraversalRobustness, OnResolveConditionThatThrowsOnARouter) {
    auto router = block("R", BlockType::Router);
    router.cases = {whenCase("K1")};
    auto p = setup({wired(dialog("D1"), "R"), wired(router, "D2", "K1"), dialog("D2")}, {"D1"}, "",
                   [](DialogueEngine& e) {
                       e.onResolveCondition([](const ConditionTest&) -> bool { throw std::runtime_error("resolver boom"); });
                   });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "resolver boom");
}

TEST(TraversalRobustness, OnResolveConditionThatThrowsWhileTaggingTheOptionsOfAChoice) {
    auto choice = block("CH", BlockType::Choice);
    Option option;
    option.id = "C1";
    option.key = "__blueprints__.s1.CH.C1";
    option.when = std::vector<ConditionTest>{flag()};
    choice.options.push_back(option);
    auto p = setup({wired(dialog("D1"), "CH"), wired(choice, "D2", "C1"), dialog("D2")}, {"D1"}, "",
                   [](DialogueEngine& e) {
                       e.onResolveCondition([](const ConditionTest&) -> bool { throw std::runtime_error("resolver boom"); });
                   });
    p->handle->start();

    expectClosedByFault(*p, [&] { p->held["D1"](); }, "resolver boom");
}

TEST(TraversalRobustness, OnResolveCharacterThatThrows) {
    // The resolver is asked for EVERY block, cast or not, so the first block already throws.
    auto p = setup({dialog("D1")}, {}, "", [](DialogueEngine& e) {
        e.onResolveCharacter([](const std::vector<Card>&) -> const Card* { throw std::runtime_error("character boom"); });
    });

    expectClosedByFault(*p, [&] { p->handle->start(); }, "character boom");
}

TEST(TraversalRobustness, OnSceneEnterThatThrows) {
    auto p = setup(twoBlocks(), {}, "", [](DialogueEngine& e) {
        e.onSceneEnter([](const SceneLifecycleArgs&) { throw std::runtime_error("enter boom"); });
    });

    expectClosedByFault(*p, [&] { p->handle->start(); }, "enter boom");
}

TEST(TraversalRobustness, OnSceneExitThatThrowsDoesNotKeepTheSceneForever) {
    auto p = setup({dialog("D1")}, {}, "", [](DialogueEngine& e) {
        e.onSceneExit([](const SceneLifecycleArgs&) { throw std::runtime_error("exit boom"); });
    });

    EXPECT_THROW(p->handle->start(), std::runtime_error);
    EXPECT_FALSE(p->handle->isRunning());
    EXPECT_FALSE(p->engine.isRunning());
    EXPECT_TRUE(p->engine.getActiveScenes().empty());
    EXPECT_NO_THROW(p->engine.stop());
}

// ─── Closing is not re-entrant ───────────────────────────────────────────────

TEST(TraversalRobustness, ACleanupThatCancelsTheSceneDoesNotFireOnSceneExitTwice) {
    auto p = setup({dialog("D1")}, {"D1"});
    p->handle->onDialogId("D1", [](ISceneHandle* scene, const BlueprintBlock*, IDialogContext*, std::function<void()>) -> CleanupFn {
        return [scene]() { scene->cancel(); };
    });
    p->handle->start();

    p->handle->cancel();

    EXPECT_EQ(1u, p->exits.size());
    EXPECT_FALSE(p->engine.isRunning());
}

TEST(TraversalRobustness, ACleanupThatStopsTheEngineDoesNotFireOnSceneExitTwice) {
    auto p = setup({dialog("D1")}, {"D1"});
    Played* raw = p.get();
    p->handle->onDialogId("D1", [raw](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()>) -> CleanupFn {
        return [raw]() { raw->engine.stop(); };
    });
    p->handle->start();

    p->engine.stop();

    EXPECT_EQ(1u, p->exits.size());
    EXPECT_FALSE(p->engine.isRunning());
}

// ─── 2. The stack does not grow with the graph ───────────────────────────────

namespace {

int conditionLoop(Played*& out, std::unique_ptr<Played>& keep, bool withBeforeBlock) {
    auto counter = std::make_shared<int>(0);
    auto condition = block("C", BlockType::Condition);
    condition.cases = {whenCase("out")};
    keep = setup({wired(wired(condition, "A", "out"), "END", "default"), wired(block("A", BlockType::Action), "C", "then"), dialog("END")},
                 {}, "", [counter, withBeforeBlock](DialogueEngine& e) {
                     e.onResolveCondition([counter](const ConditionTest&) { return *counter < kPasses; });
                     e.onAction([counter](ISceneHandle*, const BlueprintBlock*, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
                         (*counter)++;
                         ctx->resolve();
                         next();
                         return {};
                     });
                     if (withBeforeBlock) e.onBeforeBlock([](const BeforeBlockArgs& args) { args.resolve(); });
                 });
    keep->handle->start();
    out = keep.get();
    return *counter;
}

} // namespace

TEST(TraversalRobustness, AConditionActionLoopOfTenThousandPasses) {
    Played* p = nullptr;
    std::unique_ptr<Played> keep;
    EXPECT_EQ(kPasses, conditionLoop(p, keep, false));
    EXPECT_EQ(std::string(SceneEndReason::Completed), reasonOf(*p));
}

TEST(TraversalRobustness, TheSameLoopWithAnOnBeforeBlockThatResolvesAtOnce) {
    Played* p = nullptr;
    std::unique_ptr<Played> keep;
    EXPECT_EQ(kPasses, conditionLoop(p, keep, true));
    EXPECT_EQ(std::string(SceneEndReason::Completed), reasonOf(*p));
}

TEST(TraversalRobustness, AQueueOfTenThousandWiresWalkedInTurn) {
    std::vector<BlueprintBlock> blocks;
    auto first = dialog("A");
    for (int i = 0; i < kPasses; ++i) first = wired(std::move(first), "Q" + std::to_string(i));
    blocks.push_back(std::move(first));
    for (int i = 0; i < kPasses; ++i) blocks.push_back(dialog("Q" + std::to_string(i)));

    auto p = setup(std::move(blocks));
    p->handle->start();

    EXPECT_EQ(static_cast<size_t>(kPasses + 1), p->cleaned.size());
    EXPECT_EQ(std::string(SceneEndReason::Completed), reasonOf(*p));
}

TEST(TraversalRobustness, ARouterLoopOfTenThousandPasses) {
    auto counter = std::make_shared<int>(0);
    auto router = block("R", BlockType::Router);
    router.cases = {whenCase("K1")};
    auto p = setup({wired(wired(router, "A", "K1"), "END", "catch"), wired(block("A", BlockType::Action), "R", "then"), dialog("END")},
                   {}, "", [counter](DialogueEngine& e) {
                       e.onResolveCondition([counter](const ConditionTest&) { return *counter < kPasses; });
                       e.onAction([counter](ISceneHandle*, const BlueprintBlock*, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
                           (*counter)++;
                           ctx->resolve();
                           next();
                           return {};
                       });
                   });
    p->handle->start();

    EXPECT_EQ(kPasses, *counter);
    EXPECT_EQ(std::string(SceneEndReason::Completed), reasonOf(*p));
}

// ─── 4. A deadlock closes the scene, whichever track parks last ──────────────

TEST(TraversalRobustness, ASingleTrackParkedOnABlockNeverReachedClosesTheScene) {
    auto p = setup({wired(dialog("D1"), "D2"), waitsFor(dialog("D2"), {"NEVER"}), dialog("NEVER")});
    p->handle->start();

    EXPECT_FALSE(p->handle->isRunning());
    EXPECT_FALSE(p->engine.isRunning());
    EXPECT_EQ(std::string(SceneEndReason::Deadlocked), reasonOf(*p));
    ASSERT_EQ(1u, p->exits.size());
    EXPECT_EQ(std::vector<std::string>({"NEVER"}), p->exits[0].waitingFor);
}

TEST(TraversalRobustness, TwoTracksWaitingForEachOtherTheMainFlowParkingLastCloseTheScene) {
    auto p = setup({wired(wired(dialog("D1"), "A"), "M"), waitsFor(async(dialog("A")), {"M"}), waitsFor(dialog("M"), {"A"})});
    p->handle->start();

    EXPECT_FALSE(p->handle->isRunning());
    EXPECT_EQ(std::string(SceneEndReason::Deadlocked), reasonOf(*p));
    ASSERT_EQ(1u, p->exits.size());
    EXPECT_EQ(std::vector<std::string>({"M", "A"}), p->exits[0].waitingFor);
}

TEST(TraversalRobustness, ATrackParkedWhileAnotherStillRunsIsNotADeadlock) {
    auto p = setup({wired(wired(dialog("D1"), "J"), "BG"), waitsFor(dialog("J"), {"BG"}), async(dialog("BG"))}, {"BG"});
    p->handle->start();

    EXPECT_TRUE(p->handle->isRunning());
    EXPECT_TRUE(p->exits.empty());
}

// ─── 5. Why the scene ended ──────────────────────────────────────────────────

TEST(TraversalRobustness, OnSceneExitIsToldCompleted) {
    auto p = setup({dialog("D1")});
    p->handle->start();
    EXPECT_EQ(std::string(SceneEndReason::Completed), reasonOf(*p));
}

TEST(TraversalRobustness, OnSceneExitIsToldCancelledByTheHandle) {
    auto p = setup({dialog("D1")}, {"D1"});
    p->handle->start();
    p->handle->cancel();
    EXPECT_EQ(std::string(SceneEndReason::Cancelled), reasonOf(*p));
}

TEST(TraversalRobustness, OnSceneExitIsToldCancelledByEngineStop) {
    auto p = setup({dialog("D1")}, {"D1"});
    p->handle->start();
    p->engine.stop();
    EXPECT_EQ(std::string(SceneEndReason::Cancelled), reasonOf(*p));
}

TEST(TraversalRobustness, OnSceneExitIsToldInvalidatedWhenTheGameRefusesTheNextBlock) {
    auto p = setup(twoBlocks(), {}, "", [](DialogueEngine& e) {
        e.onValidateNextBlock([](const ValidateNextBlockArgs& args) {
            return args.nextBlock->id == "D2" ? ValidationResult::fail("no") : ValidationResult::ok();
        });
    });
    p->handle->start();
    EXPECT_EQ(std::string(SceneEndReason::Invalidated), reasonOf(*p));
}

TEST(TraversalRobustness, OnSceneEnterIsNotToldAReason) {
    auto entered = std::make_shared<std::vector<SceneContext>>();
    auto p = setup({dialog("D1")}, {"D1"}, "", [entered](DialogueEngine& e) {
        e.onSceneEnter([entered](const SceneLifecycleArgs& args) { entered->push_back(args.context); });
    });
    p->handle->start();
    ASSERT_EQ(1u, entered->size());
    EXPECT_FALSE((*entered)[0].reason.has_value());
}

// ─── resolve() inside onBeforeBlock is deferred, like next() ─────────────────

TEST(TraversalRobustness, CodeAfterASynchronousResolveRunsBeforeTheBlockIsDispatched) {
    auto order = std::make_shared<std::vector<std::string>>();
    auto p = setup({dialog("D1")}, {"D1"}, "", [order](DialogueEngine& e) {
        e.onBeforeBlock([order](const BeforeBlockArgs& args) {
            args.resolve();
            order->push_back("after resolve");
        });
        e.onDialog([order](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()>) -> CleanupFn {
            order->push_back("dispatched");
            return {};
        });
    });
    p->handle->start();

    EXPECT_EQ(std::vector<std::string>({"after resolve", "dispatched"}), *order);
}

// ─── The thread the scene was started on ─────────────────────────────────────

TEST(TraversalRobustness, NextFromAnotherThreadIsRefusedAndConsumesNothing) {
    auto p = setup(twoBlocks(), {"D1", "D2"});
    p->handle->start();

    std::string caught;
    std::thread worker([&] {
        try {
            p->held["D1"]();
        } catch (const std::logic_error& error) {
            caught = error.what();
        }
    });
    worker.join();

    EXPECT_NE(std::string::npos, caught.find("thread"));
    EXPECT_TRUE(p->handle->isRunning());
    ASSERT_NE(nullptr, p->handle->getCurrentBlock());
    EXPECT_EQ("D1", p->handle->getCurrentBlock()->id);

    // The refused call consumed nothing: the same next(), from the right thread, still advances.
    p->held["D1"]();
    ASSERT_NE(nullptr, p->handle->getCurrentBlock());
    EXPECT_EQ("D2", p->handle->getCurrentBlock()->id);
}

TEST(TraversalRobustness, CancelFromAnotherThreadIsRefused) {
    auto p = setup({dialog("D1")}, {"D1"});
    p->handle->start();

    bool refused = false;
    std::thread worker([&] {
        try {
            p->handle->cancel();
        } catch (const std::logic_error&) {
            refused = true;
        }
    });
    worker.join();

    EXPECT_TRUE(refused);
    EXPECT_TRUE(p->handle->isRunning());
    EXPECT_TRUE(p->exits.empty());
}

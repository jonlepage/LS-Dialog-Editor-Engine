// LSDE Dialog Engine — Robustness tests (C++ port of robustness.test.ts)
//
// Every case here is something a game integration does by accident: a timer that fires twice, a
// resolve() kept past the end of the scene, a NOTE block a designer wired back on itself, a
// handler that throws.
//
// The engine cannot prevent any of these. It can only refuse to make them worse — and, since the
// v2 work, refuse to hide them: an exception now reaches the game instead of vanishing.
//
// The NOTE cases matter most in C++: an unbounded recursion is not an exception here, it is a dead
// process. Before skipNotes() kept a `seen` set, a self-wired NOTE took the whole game with it.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <memory>
#include <string>
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
BlueprintBlock note(const std::string& id) { return block(id, BlockType::Note); }

/// Add one outgoing wire. The port is a NAME: out, then, C1, K1, or a card id.
BlueprintBlock& wire(BlueprintBlock& b, const std::string& to, const std::string& port = Ports::Out) {
    b.next.push_back(Link{port, to, "in"});
    return b;
}

/// One scene, starting on its first block. The header is filled so it loads on its own.
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

void registerAllHandlers(DialogueEngine& engine) {
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onChoice([](ISceneHandle*, const BlueprintBlock*, IChoiceContext* ctx, std::function<void()> next) -> CleanupFn {
        if (!ctx->options().empty()) ctx->selectChoice(ctx->options()[0].id);
        next(); return {};
    });
    engine.onCondition([](ISceneHandle*, const BlueprintBlock*, IConditionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onAction([](ISceneHandle*, const BlueprintBlock*, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
        ctx->resolve(); next(); return {};
    });
}

} // namespace

// ─── onBeforeBlock resolve() called twice ────────────────────────────────────

TEST(Robustness, SecondResolveDoesNotDispatchTheBlockTwice) {
    std::vector<std::string> dispatched;

    auto b1 = dialog("b1");
    wire(b1, "b2");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({b1, dialog("b2")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onBeforeBlock([](const BeforeBlockArgs& args) {
        args.resolve();
        args.resolve();  // a timer that fired twice — must be ignored
    });
    engine.onDialog([&dispatched](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        dispatched.push_back(b->id);
        next();
        return {};
    });

    engine.scene("s1")->start();

    EXPECT_EQ(dispatched, std::vector<std::string>({"b1", "b2"}));
}

// ─── A stale resolve() must not revive a finished scene ──────────────────────

TEST(Robustness, ResolveAfterTheSceneEndedDoesNotReviveIt) {
    std::vector<std::string> dispatched;
    std::vector<std::function<void()>> stale;
    int exits = 0;

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onSceneExit([&exits](const SceneLifecycleArgs&) { exits++; });
    engine.onBeforeBlock([&stale](const BeforeBlockArgs& args) {
        stale.push_back(args.resolve);
        args.resolve();
    });
    engine.onDialog([&dispatched](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        dispatched.push_back(b->id);
        next();
        return {};
    });

    auto handle = engine.scene("s1");
    handle->start();

    EXPECT_FALSE(handle->isRunning());
    EXPECT_EQ(dispatched.size(), 1u);

    for (auto& resolve : stale) resolve();

    EXPECT_EQ(dispatched.size(), 1u);
    EXPECT_EQ(exits, 1);
}

TEST(Robustness, ResolveAfterCancelDoesNotDispatch) {
    std::vector<std::string> dispatched;
    std::vector<std::function<void()>> stale;

    auto b1 = dialog("b1");
    wire(b1, "b2");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({b1, dialog("b2")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onBeforeBlock([&stale](const BeforeBlockArgs& args) {
        stale.push_back(args.resolve);
    });
    engine.onDialog([&dispatched](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        dispatched.push_back(b->id);
        next();
        return {};
    });

    auto handle = engine.scene("s1");
    handle->start();
    handle->cancel();

    for (auto& resolve : stale) resolve();

    EXPECT_TRUE(dispatched.empty());
}

// ─── A NOTE wired back on itself ─────────────────────────────────────────────

TEST(Robustness, NoteWiredToItselfEndsTheSceneInsteadOfKillingTheProcess) {
    auto n1 = note("n1");
    wire(n1, "n1");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({n1})}).errors.empty());
    registerAllHandlers(engine);

    auto handle = engine.scene("s1");
    handle->start();

    EXPECT_FALSE(handle->isRunning());
}

TEST(Robustness, TwoNotesWiredInALoopEndTheScene) {
    auto n1 = note("n1");
    wire(n1, "n2");
    auto n2 = note("n2");
    wire(n2, "n1");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({n1, n2})}).errors.empty());
    registerAllHandlers(engine);

    auto handle = engine.scene("s1");
    handle->start();

    EXPECT_FALSE(handle->isRunning());
}

TEST(Robustness, ANoteChainStillReachesTheRealBlockBehindIt) {
    std::vector<std::string> dispatched;

    auto n1 = note("n1");
    wire(n1, "n2");
    auto n2 = note("n2");
    wire(n2, "b1");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({n1, n2, dialog("b1")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onDialog([&dispatched](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        dispatched.push_back(b->id);
        next();
        return {};
    });

    engine.scene("s1")->start();

    EXPECT_EQ(dispatched, std::vector<std::string>({"b1"}));
}

// ─── A handler that throws ───────────────────────────────────────────────────

TEST(Robustness, AnExceptionInAHandlerReachesTheCaller) {
    // v1 swallowed this one, silently, while an exception from the cleanup that same handler
    // returned reached the caller. One fault, two opposite behaviours.
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()>) -> CleanupFn {
        throw std::runtime_error("game blew up");
    });

    auto handle = engine.scene("s1");

    EXPECT_THROW(handle->start(), std::runtime_error);
    EXPECT_FALSE(handle->isRunning());
}

TEST(Robustness, TheSceneIsClosedDownBeforeTheErrorSurfaces) {
    // The order is what makes it usable: by the time the game sees the error, the cleanups have
    // run and onSceneExit has fired. The dialogue stopped properly.
    std::vector<std::string> events;

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onSceneExit([&events](const SceneLifecycleArgs&) { events.push_back("exit"); });
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()>) -> CleanupFn {
        throw std::runtime_error("boom");
    });

    auto handle = engine.scene("s1");

    EXPECT_THROW(handle->start(), std::runtime_error);
    EXPECT_EQ(events, std::vector<std::string>({"exit"}));
    EXPECT_FALSE(handle->isRunning());
}

TEST(Robustness, AnExceptionInACleanupReachesTheCallerToo) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next();
        return []() { throw std::runtime_error("cleanup blew up"); };
    });

    auto handle = engine.scene("s1");

    EXPECT_THROW(handle->start(), std::runtime_error);
}

// ─── next() kept for later ───────────────────────────────────────────────────
//
// The normal way a game drives this engine: onDialog shows the line, returns, and next() is called
// a frame later when the player presses a key. `next` is handed over BY VALUE, so the game keeps
// its own copy of the std::function — and it must still work once executeBlockHandler's frame is
// gone.
//
// This was never covered: every other C++ test calls next() synchronously, inside the handler.

TEST(Robustness, NextKeptForLaterStillAdvancesTheFlow) {
    std::vector<std::string> dispatched;
    std::function<void()> deferred;

    DialogueEngine engine;
    auto b1 = dialog("b1");
    wire(b1, "b2");
    auto b2 = dialog("b2");
    wire(b2, "b3");
    ASSERT_TRUE(engine.init({oneScene({b1, b2, dialog("b3")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onDialog([&](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        dispatched.push_back(b->id);
        if (b->id == "b1") {
            deferred = next;  // the game waits for the player
            return {};
        }
        next();
        return {};
    });

    auto handle = engine.scene("s1");
    handle->start();
    EXPECT_EQ(dispatched, std::vector<std::string>({"b1"}));
    EXPECT_TRUE(handle->isRunning());

    deferred();

    EXPECT_EQ(dispatched, std::vector<std::string>({"b1", "b2", "b3"}));
    EXPECT_FALSE(handle->isRunning());
}

// The same, with the stack deliberately churned in between: a second scene played to its end
// reuses exactly the frame executeBlockHandler left behind. A next() that reads its guards from
// that frame is reading whatever the second scene wrote there.

TEST(Robustness, NextKeptForLaterSurvivesAnotherSceneOnTheSameStack) {
    std::vector<std::string> dispatched;
    std::function<void()> deferred;

    DialogueEngine engine;
    auto b1 = dialog("b1");
    wire(b1, "b2");
    ASSERT_TRUE(engine.init({oneScene({b1, dialog("b2")})}).errors.empty());
    registerAllHandlers(engine);

    engine.onDialog([&](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        dispatched.push_back(b->id);
        if (b->id == "b1" && !deferred) {
            deferred = next;
            return {};
        }
        next();
        return {};
    });

    auto handle = engine.scene("s1");
    handle->start();
    ASSERT_EQ(dispatched, std::vector<std::string>({"b1"}));

    // Churn: a second handle walks the same scene to the end, over the same stack region.
    auto other = engine.scene("s1");
    other->start();
    ASSERT_FALSE(other->isRunning());

    deferred();

    EXPECT_EQ(dispatched.back(), "b2");
    EXPECT_FALSE(handle->isRunning());
}

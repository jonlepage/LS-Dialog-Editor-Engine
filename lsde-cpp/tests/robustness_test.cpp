// LSDE Dialog Engine — Robustness tests (C++ port of robustness.test.ts)
//
// Every case here is something a game integration does by accident: a timer that fires
// twice, a resolve() kept past the end of the scene, a NOTE block a designer wired back
// on itself. The engine cannot prevent any of these; it can only refuse to make them
// worse than they are.
//
// The NOTE cases matter most in C++: an unbounded recursion is not an exception here, it
// is a dead process. Before skipNotes() walked iteratively, a self-wired NOTE took the
// whole game down with it.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <memory>
#include <string>
#include <vector>

// ─── Helpers ─────────────────────────────────────────────────────────────────

static lsde::BlueprintExport makeExport(std::vector<lsde::BlueprintScene> scenes) {
    lsde::BlueprintExport bp;
    bp.version = "1.0.0";
    bp.exportDate = "2025-01-01";
    bp.locales = {"en"};
    bp.scenes = std::move(scenes);
    return bp;
}

static void registerAllHandlers(lsde::DialogueEngine& engine) {
    engine.onDialog([](lsde::ISceneHandle*, const lsde::DialogBlock*, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext* ctx, auto next) -> lsde::CleanupFn {
        if (!ctx->choices().empty()) ctx->selectChoice(ctx->choices()[0].uuid);
        next(); return nullptr;
    });
    engine.onCondition([](lsde::ISceneHandle*, const lsde::ConditionBlock*, lsde::IConditionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(true); next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
}

static std::shared_ptr<lsde::DialogBlock> dialogBlock(const std::string& uuid, bool start = false) {
    auto b = std::make_shared<lsde::DialogBlock>();
    b->uuid = uuid;
    b->type = lsde::BlockType::Dialog;
    b->isStartBlock = start;
    return b;
}

static std::shared_ptr<lsde::NoteBlock> noteBlock(const std::string& uuid, bool start = false) {
    auto b = std::make_shared<lsde::NoteBlock>();
    b->uuid = uuid;
    b->type = lsde::BlockType::Note;
    b->isStartBlock = start;
    return b;
}

static lsde::BlueprintConnection conn(const std::string& from, const std::string& to,
                                      const std::string& port = "out") {
    lsde::BlueprintConnection c;
    c.id = from + "-" + to;
    c.fromId = from;
    c.toId = to;
    c.fromPort = port;
    c.toPort = "in";
    return c;
}

static lsde::BlueprintScene makeScene(std::vector<std::shared_ptr<lsde::BlueprintBlock>> blocks,
                                      std::vector<lsde::BlueprintConnection> connections) {
    lsde::BlueprintScene scene;
    scene.uuid = "s1";
    scene.label = "S1";
    scene.date = "2025-01-01";
    scene.blocks = std::move(blocks);
    scene.connections = std::move(connections);
    return scene;
}

// ─── onBeforeBlock resolve() called twice ────────────────────────────────────

TEST(Robustness, SecondResolveDoesNotDispatchTheBlockTwice) {
    std::vector<std::string> dispatched;

    lsde::DialogueEngine engine;
    engine.init({makeExport({makeScene({dialogBlock("b1", true), dialogBlock("b2")},
                                       {conn("b1", "b2")})}), std::nullopt});
    registerAllHandlers(engine);

    engine.onBeforeBlock([](const lsde::BeforeBlockArgs& args) {
        args.resolve();
        args.resolve();  // a timer that fired twice — must be ignored
    });
    engine.onDialog([&dispatched](lsde::ISceneHandle*, const lsde::DialogBlock* block,
                                  lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        dispatched.push_back(block->uuid);
        next();
        return nullptr;
    });

    engine.scene("s1")->start();

    EXPECT_EQ(dispatched, std::vector<std::string>({"b1", "b2"}));
}

// ─── A stale resolve() must not revive a finished scene ──────────────────────

TEST(Robustness, ResolveAfterTheSceneEndedDoesNotReviveIt) {
    std::vector<std::string> dispatched;
    std::vector<std::function<void()>> stale;
    int exits = 0;

    lsde::DialogueEngine engine;
    engine.init({makeExport({makeScene({dialogBlock("b1", true)}, {})}), std::nullopt});
    registerAllHandlers(engine);

    engine.onSceneExit([&exits](const lsde::SceneLifecycleArgs&) { exits++; });
    engine.onBeforeBlock([&stale](const lsde::BeforeBlockArgs& args) {
        stale.push_back(args.resolve);
        args.resolve();
    });
    engine.onDialog([&dispatched](lsde::ISceneHandle*, const lsde::DialogBlock* block,
                                  lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        dispatched.push_back(block->uuid);
        next();
        return nullptr;
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

    lsde::DialogueEngine engine;
    engine.init({makeExport({makeScene({dialogBlock("b1", true), dialogBlock("b2")},
                                       {conn("b1", "b2")})}), std::nullopt});
    registerAllHandlers(engine);

    engine.onBeforeBlock([&stale](const lsde::BeforeBlockArgs& args) {
        stale.push_back(args.resolve);
    });
    engine.onDialog([&dispatched](lsde::ISceneHandle*, const lsde::DialogBlock* block,
                                  lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        dispatched.push_back(block->uuid);
        next();
        return nullptr;
    });

    auto handle = engine.scene("s1");
    handle->start();
    handle->cancel();

    for (auto& resolve : stale) resolve();

    EXPECT_TRUE(dispatched.empty());
}

// ─── A NOTE wired back on itself ─────────────────────────────────────────────

TEST(Robustness, NoteWiredToItselfEndsTheSceneInsteadOfBlowingTheStack) {
    lsde::DialogueEngine engine;
    engine.init({makeExport({makeScene({noteBlock("n1", true)}, {conn("n1", "n1")})}), std::nullopt});
    registerAllHandlers(engine);

    auto handle = engine.scene("s1");
    handle->start();

    EXPECT_FALSE(handle->isRunning());
}

TEST(Robustness, TwoNotesWiredInALoopEndTheScene) {
    lsde::DialogueEngine engine;
    engine.init({makeExport({makeScene({noteBlock("n1", true), noteBlock("n2")},
                                       {conn("n1", "n2"), conn("n2", "n1")})}), std::nullopt});
    registerAllHandlers(engine);

    auto handle = engine.scene("s1");
    handle->start();

    EXPECT_FALSE(handle->isRunning());
}

TEST(Robustness, ANoteChainStillReachesTheRealBlockBehindIt) {
    std::vector<std::string> dispatched;

    lsde::DialogueEngine engine;
    engine.init({makeExport({makeScene({noteBlock("n1", true), noteBlock("n2"), dialogBlock("b1")},
                                       {conn("n1", "n2"), conn("n2", "b1")})}), std::nullopt});
    registerAllHandlers(engine);

    engine.onDialog([&dispatched](lsde::ISceneHandle*, const lsde::DialogBlock* block,
                                  lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        dispatched.push_back(block->uuid);
        next();
        return nullptr;
    });

    engine.scene("s1")->start();

    EXPECT_EQ(dispatched, std::vector<std::string>({"b1"}));
}

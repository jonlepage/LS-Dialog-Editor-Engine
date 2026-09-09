// LSDE Dialog Engine — the three tiers of handlers (C++ port of the "handler tiers" and
// "handlers" suites of scene-handle.test.ts and engine.test.ts)
//
//   handle->onBlock(id) / onDialogId(id) …       most specific
//     ↓ unless context->preventGlobalHandler()
//   handle->onDialog / onChoice / …              Tier 2 — this scene
//     ↓ unless context->preventGlobalHandler()
//   engine.onDialog / onChoice / …               Tier 1 — global
//
// Without preventGlobalHandler() both fire in sequence: scene first, then global. These rules were
// implemented in every runtime and pinned by the reference alone.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <functional>
#include <string>
#include <vector>

using namespace lsde;

namespace {

BlueprintBlock dialog(const std::string& id) {
    BlueprintBlock b;
    b.id = id;
    b.key = "__blueprints__.s1." + id;
    b.type = BlockType::Dialog;
    return b;
}

BlueprintBlock& wire(BlueprintBlock& b, const std::string& to) {
    b.next.push_back(Link{Ports::Out, to, "in"});
    return b;
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

BlueprintExport twoLines() {
    auto b1 = dialog("b1");
    wire(b1, "b2");
    return oneScene({b1, dialog("b2")});
}

void registerRest(DialogueEngine& engine) {
    engine.onChoice([](ISceneHandle*, const BlueprintBlock*, IChoiceContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onCondition([](ISceneHandle*, const BlueprintBlock*, IConditionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onAction([](ISceneHandle*, const BlueprintBlock*, IActionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
}

using Log = std::vector<std::string>;

} // namespace

TEST(HandlerTiers, RunsTheSceneHandlerThenTheGlobalOne) {
    Log order;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerRest(engine);
    engine.onDialog([&order](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("global"); next(); return {};
    });

    auto handle = engine.scene("s1");
    handle->onDialog([&order](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("scene"); next(); return {};
    });
    handle->start();

    EXPECT_EQ(order, Log({"scene", "global"}));
}

TEST(HandlerTiers, PreventGlobalHandlerStopsTheGlobalOne) {
    Log order;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerRest(engine);
    engine.onDialog([&order](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("global"); next(); return {};
    });

    auto handle = engine.scene("s1");
    handle->onDialog([&order](ISceneHandle*, const BlueprintBlock*, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        order.push_back("scene");
        ctx->preventGlobalHandler();
        next();
        return {};
    });
    handle->start();

    EXPECT_EQ(order, Log({"scene"}));
}

TEST(HandlerTiers, OnBlockBeatsTheSceneTypeHandler) {
    Log order;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({twoLines()}).errors.empty());
    registerRest(engine);
    engine.onDialog([&order](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("global:" + b->id); next(); return {};
    });

    auto handle = engine.scene("s1");
    handle->onDialog([&order](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("scene:" + b->id); next(); return {};
    });
    handle->onBlock("b1", [&order](ISceneHandle*, const BlueprintBlock* b, IBaseBlockContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("block:" + b->id); next(); return {};
    });
    handle->start();

    // On b1 the block override IS the scene tier; the scene type handler does not run.
    EXPECT_EQ(order, Log({"block:b1", "global:b1", "scene:b2", "global:b2"}));
}

TEST(HandlerTiers, OnDialogIdTargetsOneBlockByIdWithATypedContext) {
    Log hits;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({twoLines()}).errors.empty());
    registerRest(engine);
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });

    auto handle = engine.scene("s1");
    handle->onDialogId("b2", [&hits](ISceneHandle*, const BlueprintBlock* b, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        // Typed: an IDialogContext, with resolveCharacterPort on it.
        EXPECT_NE(ctx, nullptr);
        hits.push_back(b->id);
        next();
        return {};
    });
    handle->start();

    EXPECT_EQ(hits, Log({"b2"}));
}

TEST(HandlerTiers, TheLastRegistrationWins) {
    Log order;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerRest(engine);
    engine.onDialog([&order](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("first"); next(); return {};
    });
    engine.onDialog([&order](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        order.push_back("second"); next(); return {};
    });

    engine.scene("s1")->start();

    EXPECT_EQ(order, Log({"second"}));
}

TEST(HandlerTiers, Tier2OnEnterAndOnExitOverrideTheGlobalOnes) {
    Log fired;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerRest(engine);
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onSceneEnter([&fired](const SceneLifecycleArgs&) { fired.push_back("global-enter"); });
    engine.onSceneExit([&fired](const SceneLifecycleArgs&) { fired.push_back("global-exit"); });

    auto handle = engine.scene("s1");
    handle->onEnter([&fired](const SceneLifecycleArgs&) { fired.push_back("scene-enter"); });
    handle->onExit([&fired](const SceneLifecycleArgs&) { fired.push_back("scene-exit"); });
    handle->start();

    // An override, not a cascade: the global lifecycle hooks do not fire for this scene.
    EXPECT_EQ(fired, Log({"scene-enter", "scene-exit"}));
}

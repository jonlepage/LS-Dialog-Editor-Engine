// LSDE Dialog Engine — Integration tests for onResolveCondition (C++ port of engine.test.ts §onResolveCondition)

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/condition_evaluator.h>
#include <algorithm>
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

static lsde::ExportCondition makeCond(const std::string& key) {
    return {"c1", key, std::nullopt, "=", "true"};
}

/// Registers the 4 mandatory handlers with minimal pass-through behavior.
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

// ─── Shared Blueprint Factories ──────────────────────────────────────────────

/// Single-group condition scene: COND → yes (portIndex 0) / no (portIndex 1).
static lsde::BlueprintScene condScene() {
    lsde::BlueprintScene scene;
    scene.uuid = "scene-rc";
    scene.label = "ResolveCondition";
    scene.date = "2025-01-01";

    auto cond = std::make_shared<lsde::ConditionBlock>();
    cond->uuid = "cond1"; cond->type = lsde::BlockType::Condition; cond->isStartBlock = true;
    cond->conditions = {{makeCond("flag")}};

    auto yes = std::make_shared<lsde::DialogBlock>();
    yes->uuid = "yes"; yes->type = lsde::BlockType::Dialog;

    auto no = std::make_shared<lsde::DialogBlock>();
    no->uuid = "no"; no->type = lsde::BlockType::Dialog;

    scene.blocks = {cond, yes, no};
    scene.connections = {
        {"ct", "cond1", "yes", "true", "in", 0},
        {"cf", "cond1", "no", "false", "in", 1},
    };
    return scene;
}

/// Multi-group switch scene: COND(2 groups) → case0 / case1 / default.
static lsde::BlueprintScene switchScene(const std::string& uuid = "scene-sw") {
    lsde::BlueprintScene scene;
    scene.uuid = uuid;
    scene.label = "Switch";
    scene.date = "2025-01-01";

    auto cond = std::make_shared<lsde::ConditionBlock>();
    cond->uuid = "cond"; cond->type = lsde::BlockType::Condition; cond->isStartBlock = true;
    cond->conditions = {
        {{"c1", "x", std::nullopt, "=", "1"}},
        {{"c2", "y", std::nullopt, "=", "2"}},
    };

    auto case0 = std::make_shared<lsde::DialogBlock>();
    case0->uuid = "case0"; case0->type = lsde::BlockType::Dialog;
    auto case1 = std::make_shared<lsde::DialogBlock>();
    case1->uuid = "case1"; case1->type = lsde::BlockType::Dialog;
    auto def = std::make_shared<lsde::DialogBlock>();
    def->uuid = "default"; def->type = lsde::BlockType::Dialog;

    scene.blocks = {cond, case0, case1, def};
    scene.connections = {
        {"s0", "cond", "case0", "case_0", "in", 0},
        {"s1", "cond", "case1", "case_1", "in", 1},
        {"sd", "cond", "default", "default", "in", 2},
    };
    return scene;
}

/// Dispatcher scene: enableDispatcher=true, targets isAsync=true.
static lsde::BlueprintScene dispatchScene() {
    lsde::BlueprintScene scene;
    scene.uuid = "scene-disp";
    scene.label = "Dispatch";
    scene.date = "2025-01-01";

    auto cond = std::make_shared<lsde::ConditionBlock>();
    cond->uuid = "cond"; cond->type = lsde::BlockType::Condition; cond->isStartBlock = true;
    lsde::NativeProperties np; np.enableDispatcher = true;
    cond->nativeProperties = np;
    cond->conditions = {
        {{"c1", "a", std::nullopt, "=", "1"}},
        {{"c2", "b", std::nullopt, "=", "2"}},
    };

    auto async0 = std::make_shared<lsde::DialogBlock>();
    async0->uuid = "async0"; async0->type = lsde::BlockType::Dialog;
    lsde::NativeProperties npAsync; npAsync.isAsync = true;
    async0->nativeProperties = npAsync;

    auto async1 = std::make_shared<lsde::DialogBlock>();
    async1->uuid = "async1"; async1->type = lsde::BlockType::Dialog;
    async1->nativeProperties = npAsync;

    auto main = std::make_shared<lsde::DialogBlock>();
    main->uuid = "main"; main->type = lsde::BlockType::Dialog;

    scene.blocks = {cond, async0, async1, main};
    scene.connections = {
        {"d0", "cond", "async0", "case_0", "in", 0},
        {"d1", "cond", "async1", "case_1", "in", 1},
        {"dd", "cond", "main", "default", "in", 2},
    };
    return scene;
}

// ─── P0: onCondition optionnel quand resolver installe ──────────────────────

TEST(OnResolveConditionTest, Start_DoesNotThrow_WhenOnConditionOmittedButResolverInstalled) {
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return true; });
    engine.onDialog([](lsde::ISceneHandle*, const lsde::DialogBlock*, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    // NO engine.onCondition()
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    ASSERT_NO_THROW(engine.scene("scene-rc")->start());
}

TEST(OnResolveConditionTest, Start_Throws_WhenNeitherOnConditionNorResolverInstalled) {
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onDialog([](lsde::ISceneHandle*, const lsde::DialogBlock*, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    ASSERT_THROW(engine.scene("scene-rc")->start(), std::runtime_error);
}

// ─── P0: Auto-resolve sans resolve() ────────────────────────────────────────

TEST(OnResolveConditionTest, AutoResolves_WhenHandlerDoesNotCallResolve) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return true; });
    engine.onCondition([](lsde::ISceneHandle*, const lsde::ConditionBlock*, lsde::IConditionContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr; // no resolve() call
    });
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-rc")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"yes"});
}

TEST(OnResolveConditionTest, AutoResolves_ToDefaultWhenNoGroupMatches) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return false; });
    engine.onCondition([](lsde::ISceneHandle*, const lsde::ConditionBlock*, lsde::IConditionContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-rc")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"no"});
}

TEST(OnResolveConditionTest, AutoResolves_WithoutOnConditionHandlerAtAll) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return true; });
    // No onCondition registered — engine routes automatically
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-rc")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"yes"});
}

// ─── P0: Handler can override auto-resolve ──────────────────────────────────

TEST(OnResolveConditionTest, Handler_CanOverrideAutoResolveWithExplicitResolve) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return true; }); // would auto-route to 'yes'
    engine.onCondition([](lsde::ISceneHandle*, const lsde::ConditionBlock*, lsde::IConditionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(false); // override → route to 'no' instead
        next(); return nullptr;
    });
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-rc")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"no"});
}

// ─── P1: Switch mode integration ────────────────────────────────────────────

TEST(OnResolveConditionTest, SwitchMode_RoutesToMatchingCasePort) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({switchScene()})});
    // x != 1 (false), y == 2 (true) → case_1 matches
    engine.onResolveCondition([](const lsde::ExportCondition& c) { return c.key == "y"; });
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-sw")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"case1"});
}

TEST(OnResolveConditionTest, SwitchMode_RoutesToDefaultWhenNoCaseMatches) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({switchScene("scene-sw2")})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return false; });
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-sw2")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"default"});
}

// ─── P1: Dispatcher mode integration ────────────────────────────────────────

TEST(OnResolveConditionTest, DispatcherMode_SpawnsAsyncTracksForMatchedCases) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({dispatchScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition&) { return true; }); // both match
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-disp")->start();
    std::sort(visited.begin(), visited.end());
    ASSERT_EQ(visited, (std::vector<std::string>{"async0", "async1", "main"}));
}

// ─── P1: evaluateCondition() uses resolver ──────────────────────────────────

TEST(OnResolveConditionTest, EvaluateCondition_UsesResolverForNonChoiceConditions) {
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.onResolveCondition([](const lsde::ExportCondition& c) { return c.key == "flag"; });
    registerAllHandlers(engine);

    auto handle = engine.scene("scene-rc");
    bool evalResult = false;
    handle->onCondition([&evalResult](lsde::ISceneHandle* scene, const lsde::ConditionBlock*, lsde::IConditionContext*, auto next) -> lsde::CleanupFn {
        evalResult = scene->evaluateCondition({"t", "flag", std::nullopt, "=", ""});
        next();
        return nullptr;
    });
    handle->start();
    ASSERT_TRUE(evalResult);
}

TEST(OnResolveConditionTest, EvaluateCondition_ReturnsFalseWithoutResolver) {
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    registerAllHandlers(engine);

    auto handle = engine.scene("scene-rc");
    bool evalResult = true; // init to true, expect false
    handle->onCondition([&evalResult](lsde::ISceneHandle* scene, const lsde::ConditionBlock*, lsde::IConditionContext* ctx, auto next) -> lsde::CleanupFn {
        evalResult = scene->evaluateCondition({"t", "flag", std::nullopt, "=", ""});
        ctx->resolve(true);
        next();
        return nullptr;
    });
    handle->start();
    ASSERT_FALSE(evalResult);
}

// ─── P1: setChoiceFilter backward compat alias ──────────────────────────────

TEST(OnResolveConditionTest, SetChoiceFilter_StillWorksAsAliasForOnResolveCondition) {
    std::vector<std::string> visited;
    lsde::DialogueEngine engine;
    engine.init({makeExport({condScene()})});
    engine.setChoiceFilter([](const lsde::ExportCondition&) { return true; }); // alias
    engine.onDialog([&visited](lsde::ISceneHandle*, const lsde::DialogBlock* block, lsde::IDialogContext*, auto next) -> lsde::CleanupFn {
        visited.push_back(block->uuid); next(); return nullptr;
    });
    engine.onChoice([](lsde::ISceneHandle*, const lsde::ChoiceBlock*, lsde::IChoiceContext*, auto next) -> lsde::CleanupFn {
        next(); return nullptr;
    });
    // No onCondition — should auto-resolve via setChoiceFilter alias
    engine.onAction([](lsde::ISceneHandle*, const lsde::ActionBlock*, lsde::IActionContext* ctx, auto next) -> lsde::CleanupFn {
        ctx->resolve(); next(); return nullptr;
    });
    engine.scene("scene-rc")->start();
    ASSERT_EQ(visited, std::vector<std::string>{"yes"});
}

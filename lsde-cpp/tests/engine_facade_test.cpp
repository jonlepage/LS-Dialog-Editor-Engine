// LSDE Dialog Engine — the facade (C++ port of the "init", "setLocale", "getSceneConnections" and
// "cleanups" suites of engine.test.ts and scene-handle.test.ts)

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <lsde/utils.h>
#include <functional>
#include <stdexcept>
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

BlueprintScene scene(const std::string& path, std::vector<BlueprintBlock> blocks) {
    BlueprintScene s;
    s.scene = path;
    s.id = "sc_" + path;
    if (!blocks.empty()) s.start = blocks[0].id;
    s.blocks = std::move(blocks);
    return s;
}

BlueprintExport blueprint(std::vector<BlueprintScene> scenes) {
    BlueprintExport bp;
    bp.format = "lsde-blueprints";
    bp.version = 1;
    bp.generator = Generator{"LSDE", "2.0.3"};
    bp.exportedAt = "2026-09-07T00:00:00.000Z";
    bp.project = "Test";
    bp.locales = {"en"};
    bp.referenceLocale = "en";
    bp.scenes = std::move(scenes);
    return bp;
}

BlueprintExport oneScene(std::vector<BlueprintBlock> blocks) {
    return blueprint({scene("s1", std::move(blocks))});
}

void registerAll(DialogueEngine& engine) {
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
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

} // namespace

// ─── getSceneConnections ─────────────────────────────────────────────────────

TEST(EngineFacade, GetSceneConnectionsReturnsTheWiresInsideASceneEachWithTheBlockItLeaves) {
    auto b1 = dialog("b1");
    wire(b1, "b2");
    wire(b1, "b3");
    auto b2 = dialog("b2");
    wire(b2, "b3");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({b1, b2, dialog("b3")})}).errors.empty());

    auto wires = engine.getSceneConnections("s1");

    ASSERT_EQ(wires.size(), 3u);
    EXPECT_EQ(wires[0].from, "b1");
    EXPECT_EQ(wires[0].to, "b2");
    EXPECT_EQ(wires[0].port, Ports::Out);
    EXPECT_EQ(wires[0].toPort, Ports::In);
    EXPECT_EQ(wires[2].from, "b2");
}

TEST(EngineFacade, GetSceneConnectionsReturnsNothingForASceneThatIsNotThere) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    EXPECT_TRUE(engine.getSceneConnections("nowhere").empty());
}

TEST(EngineFacade, GetSceneConnectionsReturnsNothingBeforeInit) {
    DialogueEngine engine;
    EXPECT_TRUE(engine.getSceneConnections("s1").empty());
}

// ─── setLocale ───────────────────────────────────────────────────────────────

TEST(EngineFacade, SetLocaleAcceptsALocaleTheProjectDeclares) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    EXPECT_NO_THROW(engine.setLocale("en"));
    EXPECT_EQ(LsdeUtils::locale, "en");
}

TEST(EngineFacade, SetLocaleRefusesOneItDoesNotAndListsTheRealOnes) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    try {
        engine.setLocale("xx");
        FAIL() << "an unknown locale must be refused";
    } catch (const std::runtime_error& err) {
        std::string message = err.what();
        EXPECT_NE(message.find("xx"), std::string::npos);
        EXPECT_NE(message.find("en"), std::string::npos);
    }
}

// ─── init ────────────────────────────────────────────────────────────────────

TEST(EngineFacade, ASecondInitReplacesTheDataCleanly) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({blueprint({scene("sA", {dialog("A")})})}).errors.empty());
    ASSERT_TRUE(engine.init({blueprint({scene("sB", {dialog("B")})})}).errors.empty());
    registerAll(engine);

    EXPECT_THROW(engine.scene("sA"), std::runtime_error);
    EXPECT_NE(engine.scene("sB"), nullptr);
}

TEST(EngineFacade, RecoversFromAFailedInit) {
    DialogueEngine engine;
    BlueprintExport bad;
    bad.format = "nope";
    EXPECT_FALSE(engine.init({bad}).errors.empty());
    EXPECT_THROW(engine.scene("s1"), std::runtime_error);

    ASSERT_TRUE(engine.init({oneScene({dialog("b1")})}).errors.empty());
    registerAll(engine);
    EXPECT_NE(engine.scene("s1"), nullptr);
}

// ─── Cleanups ────────────────────────────────────────────────────────────────

TEST(EngineFacade, RunsTheCleanupWhenLeavingABlockBeforeTheNextOneIsDispatched) {
    std::vector<std::string> log;
    auto a = dialog("A");
    wire(a, "B");
    wire(a, "C");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({a, dialog("B"), dialog("C")})}).errors.empty());
    registerAll(engine);
    engine.onDialog([&log](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        std::string id = b->id;
        log.push_back("dispatch " + id);
        next();
        return [id, &log]() { log.push_back("cleanup " + id); };
    });

    engine.scene("s1")->start();

    // Each block is released as the track walks off it — B and C are walked in turn from the
    // queue, and A's cleanup runs before B is dispatched, not when the queue empties.
    EXPECT_EQ(log, std::vector<std::string>({
        "dispatch A", "cleanup A", "dispatch B", "cleanup B", "dispatch C", "cleanup C",
    }));
}

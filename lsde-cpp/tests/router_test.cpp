// LSDE Dialog Engine — the ROUTER block (C++ port of the ROUTER section of branch-queue.test.ts)
//
// A router launches every route whose case holds, then continues by "then" when all of them held
// or by "catch" when one did not. It has NO handler: by the time one could speak, every true case
// has launched and the exit is picked, so the engine dispatches nothing and advances on its own.
// "R" never appears in the played list, and that is the contract. A game that wants to watch one
// router still can, through onBlock(id) — the last test here.
//
// The K* routes are walked like any other port: an isAsync target opens its own track, the others
// are this track's, in turn, and the continuation comes LAST — which is what lets then/catch stay
// the main flow when the case routes are async.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <algorithm>
#include <functional>
#include <optional>
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

/// A dialog whose target-side isAsync is what the wires pointing AT it will read.
BlueprintBlock beside(const std::string& id) {
    auto b = dialog(id);
    b.props["isAsync"] = true;
    return b;
}

ConditionTest test(const std::string& entry) {
    ConditionTest t;
    t.dict = "party";
    t.entry = entry;
    t.op = ConditionOperator::Equals;
    t.value = true;
    return t;
}

ConditionCase whenCase(const std::string& port, std::vector<ConditionTest> tests = {}) {
    ConditionCase c;
    c.port = port;
    if (!tests.empty()) c.when = std::move(tests);
    return c;
}

/// A ROUTER: the same cases as a condition, read the opposite way. Exits by then / catch.
BlueprintBlock router(const std::string& id, std::vector<ConditionCase> cases) {
    auto b = block(id, BlockType::Router);
    b.cases = std::move(cases);
    return b;
}

BlueprintBlock& wire(BlueprintBlock& b, const std::string& to, const std::string& port = Ports::Out) {
    b.next.push_back(Link{port, to, "in"});
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

// ─── Harness ─────────────────────────────────────────────────────────────────

struct PlayResult {
    /// Every block dispatched, in order.
    std::vector<std::string> played;
    bool running = false;
    std::vector<std::string> visited;
};

/// Play a scene to the end, advancing every block as soon as its handler is called. Nothing is
/// deferred, so the order in `played` is the order the engine chose.
PlayResult play(
    const BlueprintExport& data,
    std::function<bool(const std::string&)> resolve = {},
    std::function<void(ISceneHandle*)> before = {}) {
    PlayResult result;
    DialogueEngine engine;
    EXPECT_TRUE(engine.init({data}).errors.empty());
    engine.onResolveCondition([resolve](const ConditionTest& t) { return !resolve || resolve(t.entry); });

    engine.onDialog([&result](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        result.played.push_back(b->id); next(); return {};
    });
    engine.onChoice([&result](ISceneHandle*, const BlueprintBlock* b, IChoiceContext*, std::function<void()> next) -> CleanupFn {
        result.played.push_back(b->id); next(); return {};
    });
    engine.onAction([&result](ISceneHandle*, const BlueprintBlock* b, IActionContext*, std::function<void()> next) -> CleanupFn {
        result.played.push_back(b->id); next(); return {};
    });
    engine.onCondition([&result](ISceneHandle*, const BlueprintBlock* b, IConditionContext*, std::function<void()> next) -> CleanupFn {
        result.played.push_back(b->id); next(); return {};
    });

    auto handle = engine.scene("s1");
    if (before) before(handle.get());
    handle->start();
    result.running = handle->isRunning();
    result.visited = handle->getVisitedBlocks();
    return result;
}

/// A three-case router. The continuation ports are wired FIRST on purpose: the flow follows the
/// order of the ports the router resolved, never the order of the file.
BlueprintExport routerScene(bool routesBeside) {
    auto target = [routesBeside](const std::string& id) { return routesBeside ? beside(id) : dialog(id); };

    auto r = router("R", {whenCase("K1", {test("a")}), whenCase("K2", {test("b")}), whenCase("K3", {test("c")})});
    wire(r, "THEN", Ports::Then);
    wire(r, "CATCH", Ports::Catch);
    wire(r, "R1", "K1");
    wire(r, "R2", "K2");
    wire(r, "R3", "K3");

    return oneScene({r, target("R1"), target("R2"), target("R3"), dialog("THEN"), dialog("CATCH")});
}

using Ids = std::vector<std::string>;

} // namespace

TEST(Router, EveryCaseTrueTargetsNotAsyncK1K2K3ThenThen) {
    auto r = play(routerScene(false));
    EXPECT_EQ(r.played, Ids({"R1", "R2", "R3", "THEN"}));
}

TEST(Router, EveryCaseTrueTargetsAsyncTheRoutesRunBesideThenContinues) {
    auto r = play(routerScene(true));
    EXPECT_EQ(r.played, Ids({"R1", "R2", "R3", "THEN"}));
}

TEST(Router, OneCaseFalseTheTrueRoutesStillRunAndTheExitIsCatch) {
    auto r = play(routerScene(false), [](const std::string& entry) { return entry != "b"; });
    EXPECT_EQ(r.played, Ids({"R1", "R3", "CATCH"}));
}

TEST(Router, NoCaseTrueCatchAloneNothingQueued) {
    auto r = play(routerScene(false), [](const std::string&) { return false; });
    EXPECT_EQ(r.played, Ids({"CATCH"}));
}

TEST(Router, NoCaseDeclaredThenLikePromiseAllOfNothing) {
    auto r0 = router("R", {});
    wire(r0, "THEN", Ports::Then);
    wire(r0, "CATCH", Ports::Catch);
    auto r = play(oneScene({r0, dialog("THEN"), dialog("CATCH")}));
    EXPECT_EQ(r.played, Ids({"THEN"}));
}

TEST(Router, TheContinuationPortHasNoWireTheQueueIsStillWalkedThenTheTrackEnds) {
    auto r0 = router("R", {whenCase("K1", {test("a")}), whenCase("K2", {test("b")})});
    wire(r0, "R1", "K1");
    wire(r0, "R2", "K2");
    auto r = play(oneScene({r0, dialog("R1"), dialog("R2")}));
    EXPECT_EQ(r.played, Ids({"R1", "R2"}));
    EXPECT_FALSE(r.running);
}

TEST(Router, ACaseRouteWithItsOwnBranchFinishesItBeforeTheNextCase) {
    auto r0 = router("R", {whenCase("K1", {test("a")}), whenCase("K2", {test("b")})});
    wire(r0, "R1", "K1");
    wire(r0, "R2", "K2");
    wire(r0, "THEN", Ports::Then);
    auto r1 = dialog("R1");
    wire(r1, "R1b");
    auto r = play(oneScene({r0, r1, dialog("R1b"), dialog("R2"), dialog("THEN")}));
    EXPECT_EQ(r.played, Ids({"R1", "R1b", "R2", "THEN"}));
}

TEST(Router, ARouterIsVisitedThoughNeverDispatched) {
    // The traversal marks a block reached before it looks for a handler, so the router is in the
    // visited list — and absent from `played`, which only the handlers fill.
    auto r = play(routerScene(false));
    EXPECT_NE(std::find(r.visited.begin(), r.visited.end(), "R"), r.visited.end());
    EXPECT_EQ(std::find(r.played.begin(), r.played.end(), "R"), r.played.end());
}

TEST(Router, ARouterIsObservableThroughOnBlockAndItsContextHasNoResolve) {
    // IRouterContext declares cases() and nothing to answer with — no resolve() — which the
    // compiler enforces. What a test can check is that the observation point gets the same
    // pre-evaluated cases a condition would, ALL of them, and that the flow still goes on.
    bool sawRouterContext = false;
    std::vector<std::optional<bool>> results;

    auto r = play(routerScene(false), [](const std::string& entry) { return entry != "b"; }, [&](ISceneHandle* handle) {
        handle->onBlock("R", [&](ISceneHandle*, const BlueprintBlock*, IBaseBlockContext* ctx, std::function<void()> next) -> CleanupFn {
            auto* rc = dynamic_cast<IRouterContext*>(ctx);
            sawRouterContext = rc != nullptr;
            if (rc) for (const auto& c : rc->cases()) results.push_back(c.result);
            next();
            return {};
        });
    });

    EXPECT_TRUE(sawRouterContext);
    EXPECT_EQ(results, std::vector<std::optional<bool>>({true, false, true}));
    EXPECT_EQ(r.played, Ids({"R1", "R3", "CATCH"}));
}

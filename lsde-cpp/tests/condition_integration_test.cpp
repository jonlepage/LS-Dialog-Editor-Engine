// LSDE Dialog Engine — the condition resolver end to end, plus the chain algorithm (C++ port).
//
// onResolveCondition is the SINGLE game-state evaluator: it answers option visibility and it
// pre-evaluates the cases of a condition block. Once it is installed the engine already knows
// which port a condition leaves by, which is what makes onCondition optional.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <lsde/condition_evaluator.h>
#include <lsde/utils.h>
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

BlueprintBlock& wire(BlueprintBlock& b, const std::string& to, const std::string& port = Ports::Out) {
    b.next.push_back(Link{port, to, "in"});
    return b;
}

ConditionTest test(const std::string& entry, const std::string& join = "") {
    ConditionTest t;
    t.dict = "switches";
    t.entry = entry;
    t.op = ConditionOperator::Equals;
    t.value = true;
    if (!join.empty()) t.join = join;
    return t;
}

ConditionCase whenCase(const std::string& port, std::vector<ConditionTest> tests = {}) {
    ConditionCase c;
    c.port = port;
    if (!tests.empty()) c.when = std::move(tests);
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

/// Answers by what the test asks for, so the chain logic is what is under test.
bool answer(const ConditionTest& t) { return !t.entry.empty() && t.entry[0] == 'T'; }

/// A condition in if mode: out when it holds, default when it does not.
BlueprintExport branching() {
    auto cond = block("k1", BlockType::Condition);
    cond.cases.push_back(whenCase(Ports::Out, {test("flag")}));
    wire(cond, "yes", Ports::Out);
    wire(cond, "no", Ports::Default);
    return oneScene({cond, dialog("yes"), dialog("no")});
}

void registerBase(DialogueEngine& engine, bool withCondition = true) {
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onChoice([](ISceneHandle*, const BlueprintBlock*, IChoiceContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onAction([](ISceneHandle*, const BlueprintBlock*, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
        ctx->resolve(); next(); return {};
    });
    if (withCondition) {
        engine.onCondition([](ISceneHandle*, const BlueprintBlock*, IConditionContext*, std::function<void()> next) -> CleanupFn {
            next(); return {};
        });
    }
}

std::vector<std::string> play(DialogueEngine& engine, std::vector<std::string>& visited) {
    engine.onDialog([&visited](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        visited.push_back(b->id);
        next();
        return {};
    });
    engine.scene("s1")->start();
    return visited;
}

} // namespace

// ─── Chaining tests inside a case ────────────────────────────────────────────

TEST(ConditionChain, NoTestsAtAllIsTrue) {
    // This is how "always" is written in v2 — by the ABSENCE of `when`.
    EXPECT_TRUE(evaluateConditionChain(std::optional<std::vector<ConditionTest>>{}, answer));
    EXPECT_TRUE(evaluateConditionChain(std::vector<ConditionTest>{}, answer));
}

TEST(ConditionChain, ASingleTestStandsOnItsOwn) {
    EXPECT_TRUE(evaluateConditionChain(std::vector<ConditionTest>{test("T1")}, answer));
    EXPECT_FALSE(evaluateConditionChain(std::vector<ConditionTest>{test("F1")}, answer));
}

TEST(ConditionChain, JoinsWithAndByDefault) {
    EXPECT_TRUE(evaluateConditionChain(std::vector<ConditionTest>{test("T1"), test("T2")}, answer));
    EXPECT_FALSE(evaluateConditionChain(std::vector<ConditionTest>{test("T1"), test("F1")}, answer));
}

TEST(ConditionChain, JoinsWithOrWhenTheJoinSaysSo) {
    EXPECT_TRUE(evaluateConditionChain(
        std::vector<ConditionTest>{test("F1"), test("T1", ConditionJoin::Or)}, answer));
    EXPECT_FALSE(evaluateConditionChain(
        std::vector<ConditionTest>{test("F1"), test("F2", ConditionJoin::Or)}, answer));
}

TEST(ConditionChain, ReadsLeftToRightWithNoPrecedence) {
    // F AND T OR T → (F AND T) OR T = true.
    // With AND binding tighter it would be F AND (T OR T) = false. It does not.
    EXPECT_TRUE(evaluateConditionChain(std::vector<ConditionTest>{
        test("F1"), test("T1", ConditionJoin::And), test("T2", ConditionJoin::Or)}, answer));

    // T OR F AND F → (T OR F) AND F = false.
    EXPECT_FALSE(evaluateConditionChain(std::vector<ConditionTest>{
        test("T1"), test("F1", ConditionJoin::Or), test("F2", ConditionJoin::And)}, answer));
}

TEST(ConditionChain, EvaluatesEveryTestEvenOnceTheAnswerIsSettled) {
    // No short-circuit: the game's evaluator is also where a project logs and counts.
    int calls = 0;
    auto counting = [&calls](const ConditionTest& t) { calls++; return answer(t); };

    evaluateConditionChain(std::vector<ConditionTest>{
        test("F1"), test("T1", ConditionJoin::And), test("T2", ConditionJoin::And)}, counting);

    EXPECT_EQ(calls, 3);
}

// ─── Picking a port ──────────────────────────────────────────────────────────

TEST(ConditionCases, IfModeRequiresEveryCaseToHold) {
    std::vector<ConditionCase> all{whenCase(Ports::Out, {test("T1")}), whenCase(Ports::Out, {test("T2")})};
    EXPECT_EQ(evaluateConditionCases(all, false, answer), Ports::Out);

    std::vector<ConditionCase> one{whenCase(Ports::Out, {test("T1")}), whenCase(Ports::Out, {test("F1")})};
    EXPECT_EQ(evaluateConditionCases(one, false, answer), Ports::Default);
}

TEST(ConditionCases, NoCasesAtAllLeavesByOut) {
    EXPECT_EQ(evaluateConditionCases({}, false, answer), Ports::Out);
    EXPECT_EQ(evaluateConditionCases({}, true, answer), Ports::Out);
}

TEST(ConditionCases, SwitchModeTakesTheFirstCaseThatHolds) {
    std::vector<ConditionCase> cases{
        whenCase("K1", {test("F1")}),
        whenCase("K2", {test("T1")}),
        whenCase("K3", {test("T2")}),
    };
    EXPECT_EQ(evaluateConditionCases(cases, true, answer), "K2");
}

TEST(ConditionCases, SwitchModeTakesDefaultWhenNoneHolds) {
    std::vector<ConditionCase> cases{whenCase("K1", {test("F1")}), whenCase("K2", {test("F2")})};
    EXPECT_EQ(evaluateConditionCases(cases, true, answer), Ports::Default);
}

TEST(ConditionCases, ACatchAllShadowsEverythingBelowIt) {
    // The reference export does exactly this: COND-001 K3 has no comparison at all.
    std::vector<ConditionCase> cases{
        whenCase("K1", {test("F1")}),
        whenCase("K2"),
        whenCase("K3", {test("T1")}),
    };
    EXPECT_EQ(evaluateConditionCases(cases, true, answer), "K2");
}

TEST(ConditionCases, SwitchModeStopsAskingOnceACaseHolds) {
    // Unlike the chain inside a case, cases DO short-circuit.
    int calls = 0;
    auto counting = [&calls](const ConditionTest& t) { calls++; return answer(t); };

    std::vector<ConditionCase> cases{
        whenCase("K1", {test("F1")}),
        whenCase("K2", {test("T1")}),
        whenCase("K3", {test("T2")}),
    };
    evaluateConditionCases(cases, true, counting);

    EXPECT_EQ(calls, 2);
}

TEST(ConditionCases, TheDispatcherIsGone) {
    // v1 had a third mode firing EVERY matching case at once. Nothing here can produce it.
    std::vector<ConditionCase> allTrue{
        whenCase("K1", {test("T1")}), whenCase("K2", {test("T2")}), whenCase("K3", {test("T3")})};
    EXPECT_EQ(evaluateConditionCases(allTrue, true, answer), "K1");

    // The need it served is covered: read the results, then use isAsync where it shows.
    std::vector<ConditionCase> cases{
        whenCase("K1", {test("T1")}), whenCase("K2", {test("F1")}), whenCase("K3")};
    EXPECT_EQ(evaluateEachCase(cases, answer), std::vector<bool>({true, false, true}));
}

// ─── Tagging options ─────────────────────────────────────────────────────────

TEST(OptionVisibility, HandsBackEveryOptionTagged) {
    Option always;
    always.id = "C1";
    always.key = "k1";
    Option gated;
    gated.id = "C2";
    gated.key = "k2";
    gated.when = std::vector<ConditionTest>{test("F1")};

    ConditionEvaluatorFn evaluator = answer;
    auto tagged = tagOptionVisibility({always, gated}, &evaluator);

    ASSERT_EQ(tagged.size(), 2u);
    EXPECT_TRUE(tagged[0].visible.value_or(false));
    EXPECT_FALSE(tagged[1].visible.value_or(true));
}

TEST(OptionVisibility, LeavesVisibleUnsetWithNoEvaluator) {
    // Unknown, not hidden. Saying false about a question nobody could answer would HIDE an answer.
    Option gated;
    gated.id = "C1";
    gated.key = "k1";
    gated.when = std::vector<ConditionTest>{test("T1")};

    auto tagged = tagOptionVisibility({gated}, nullptr);

    ASSERT_EQ(tagged.size(), 1u);
    EXPECT_FALSE(tagged[0].visible.has_value());
}

// ─── The reserved choice dictionary ──────────────────────────────────────────

TEST(ChoiceDictionary, RecognisesATestThatReadsAPastAnswer) {
    ConditionTest choiceTest;
    choiceTest.dict = Ports::Choice;
    choiceTest.entry = "CHOICE-001";
    choiceTest.op = ConditionOperator::Equals;
    choiceTest.value = std::string("C1");

    EXPECT_TRUE(isChoiceTest(choiceTest));
    EXPECT_FALSE(isChoiceTest(test("T1")));
}

// ─── onResolveCondition, end to end ──────────────────────────────────────────

TEST(OnResolveCondition, StartDoesNotThrowWhenOnConditionOmittedButResolverInstalled) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine, false);
    engine.onResolveCondition([](const ConditionTest&) { return true; });

    auto handle = engine.scene("s1");
    EXPECT_NO_THROW(handle->start());
}

TEST(OnResolveCondition, StartThrowsWhenNeitherIsInstalled) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine, false);

    auto handle = engine.scene("s1");
    EXPECT_THROW(handle->start(), std::runtime_error);
}

TEST(OnResolveCondition, RoutesOnItsOwnWhenTheHandlerOnlyCallsNext) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine);
    engine.onResolveCondition([](const ConditionTest&) { return true; });

    std::vector<std::string> visited;
    EXPECT_EQ(play(engine, visited), std::vector<std::string>({"yes"}));
}

TEST(OnResolveCondition, RoutesToDefaultWhenTheCaseDoesNotHold) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine);
    engine.onResolveCondition([](const ConditionTest&) { return false; });

    std::vector<std::string> visited;
    EXPECT_EQ(play(engine, visited), std::vector<std::string>({"no"}));
}

TEST(OnResolveCondition, RoutesWithNoOnConditionHandlerAtAll) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine, false);
    engine.onResolveCondition([](const ConditionTest&) { return true; });

    std::vector<std::string> visited;
    EXPECT_EQ(play(engine, visited), std::vector<std::string>({"yes"}));
}

TEST(OnResolveCondition, HandsTheHandlerEachCaseWithItsPortAndResult) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine);
    engine.onResolveCondition([](const ConditionTest&) { return true; });

    std::vector<std::pair<std::string, bool>> seen;
    engine.onCondition([&seen](ISceneHandle*, const BlueprintBlock*, IConditionContext* ctx, std::function<void()> next) -> CleanupFn {
        for (const auto& c : ctx->cases()) seen.emplace_back(c.port, c.result.value_or(false));
        next();
        return {};
    });

    std::vector<std::string> visited;
    play(engine, visited);

    ASSERT_EQ(seen.size(), 1u);
    EXPECT_EQ(seen[0].first, Ports::Out);
    EXPECT_TRUE(seen[0].second);
}

TEST(OnResolveCondition, TheHandlerCanOverrideThePortItPicked) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine);
    engine.onResolveCondition([](const ConditionTest&) { return true; });
    engine.onCondition([](ISceneHandle*, const BlueprintBlock*, IConditionContext* ctx, std::function<void()> next) -> CleanupFn {
        ctx->resolve(Ports::Default);
        next();
        return {};
    });

    std::vector<std::string> visited;
    EXPECT_EQ(play(engine, visited), std::vector<std::string>({"no"}));
}

TEST(OnResolveCondition, RoutesToTheCasePortWithPortPerCase) {
    auto cond = block("k1", BlockType::Condition);
    cond.cases.push_back(whenCase("K1", {test("a")}));
    cond.cases.push_back(whenCase("K2", {test("b")}));
    cond.props["portPerCase"] = true;
    wire(cond, "first", "K1");
    wire(cond, "second", "K2");
    wire(cond, "none", Ports::Default);

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({cond, dialog("first"), dialog("second"), dialog("none")})}).errors.empty());
    registerBase(engine);
    engine.onResolveCondition([](const ConditionTest& t) { return t.entry == "b"; });

    std::vector<std::string> visited;
    EXPECT_EQ(play(engine, visited), std::vector<std::string>({"second"}));
}

TEST(OnResolveCondition, EvaluateConditionAnswersThroughTheSceneHandle) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine);
    engine.onResolveCondition([](const ConditionTest& t) { return t.entry == "flag"; });

    auto handle = engine.scene("s1");
    EXPECT_TRUE(handle->evaluateCondition(test("flag")));
    EXPECT_FALSE(handle->evaluateCondition(test("other")));
}

TEST(OnResolveCondition, EvaluateConditionIsFalseWithNoResolver) {
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({branching()}).errors.empty());
    registerBase(engine);

    EXPECT_FALSE(engine.scene("s1")->evaluateCondition(test("flag")));
}

// LSDE Dialog Engine — LsdeUtils (C++ port of lsde-utils.test.ts and utils.test.ts)
//
// Static helpers a game calls, never hooks the engine calls: naming a block, reading a line out of
// an inline text map or out of a separate locale file, and sorting a props bag into what the engine
// acts on and what belongs to the game.

#include <gtest/gtest.h>
#include <lsde/utils.h>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

using namespace lsde;

namespace {

BlueprintBlock block(const std::string& id, const std::string& type) {
    BlueprintBlock b;
    b.id = id;
    b.key = "__blueprints__.s1." + id;
    b.type = type;
    return b;
}

BlueprintBlock dialog(const std::string& id) { return block(id, BlockType::Dialog); }

ConditionCase whenCase(const std::string& port) {
    ConditionCase c;
    c.port = port;
    return c;
}

ConditionTest choiceTest(const std::string& blockId, const std::string& optionId) {
    ConditionTest t;
    t.dict = Ports::Choice;
    t.entry = blockId;
    t.op = ConditionOperator::Equals;
    t.value = optionId;
    return t;
}

ConditionTest gameTest(const std::string& dict, const std::string& entry) {
    ConditionTest t;
    t.dict = dict;
    t.entry = entry;
    t.op = ConditionOperator::Equals;
    t.value = true;
    return t;
}

const TextByLocale kLine = {{"en", "Hello"}, {"fr", "Bonjour"}};

LocaleTable table() {
    LocaleTable t;
    t["reactor_breach"]["DIALOG-001"] = std::string("Sealed.");
    t["reactor_breach"]["CHOICE-001"] = std::map<std::string, std::string>{{"C1", "Open it"}, {"C2", "Leave"}};
    return t;
}

struct LocaleReset {
    LocaleReset() { LsdeUtils::locale = ""; }
};

} // namespace

// ─── Naming a block ──────────────────────────────────────────────────────────

TEST(LsdeUtilsTest, UsesTheLabelWhenAnExportCarriesOne) {
    auto b = dialog("DIALOG-007");
    b.label = "Vesk speaks";
    b.note = "a note too";
    EXPECT_EQ(LsdeUtils::GetBlockLabel(b), "Vesk speaks");
}

TEST(LsdeUtilsTest, FallsBackToTheDesignerNoteWhichSaysMoreThanANameWould) {
    auto b = dialog("DIALOG-007");
    b.note = "Vesk se cache derrière le réservoir.";
    EXPECT_EQ(LsdeUtils::GetBlockLabel(b), "Vesk se cache derrière le réservoir.");
}

TEST(LsdeUtilsTest, FallsBackToTheIdWhichIsAlreadyReadable) {
    EXPECT_EQ(LsdeUtils::GetBlockLabel(dialog("DIALOG-007")), "DIALOG-007");
}

// ─── Inline texts ────────────────────────────────────────────────────────────

TEST(LsdeUtilsTest, PicksTheLocaleTheEngineWasSetTo) {
    LocaleReset reset;
    LsdeUtils::locale = "fr";
    EXPECT_EQ(LsdeUtils::GetLocalizedText(kLine), std::optional<std::string>("Bonjour"));
}

TEST(LsdeUtilsTest, TakesALocaleOverride) {
    LocaleReset reset;
    LsdeUtils::locale = "fr";
    EXPECT_EQ(LsdeUtils::GetLocalizedText(kLine, "en"), std::optional<std::string>("Hello"));
}

TEST(LsdeUtilsTest, ReturnsNothingForALocaleTheTextDoesNotCarry) {
    EXPECT_FALSE(LsdeUtils::GetLocalizedText(kLine, "de").has_value());
}

TEST(LsdeUtilsTest, ReturnsNothingWhenTheBlockCarriesNoTextAtAll) {
    EXPECT_FALSE(LsdeUtils::GetLocalizedText(TextByLocale{}, "en").has_value());
}

TEST(LsdeUtilsTest, ThrowsWhenNoLocaleWasEverSet) {
    LocaleReset reset;
    EXPECT_THROW(LsdeUtils::GetLocalizedText(kLine), std::runtime_error);
}

TEST(LsdeUtilsTest, HandsTheStringOverUntouchedMarkersAndAll) {
    // {{@a1}}, {:a2}, {{#ui.hud.label}} are the GAME's markers, in the game's own keys. The engine
    // reads structure, never the content of a text.
    TextByLocale raw = {{"en", "{{@a1}} says {:a2} — {{#ui.hud.label}}"}};
    EXPECT_EQ(LsdeUtils::GetLocalizedText(raw, "en"), std::optional<std::string>("{{@a1}} says {:a2} — {{#ui.hud.label}}"));
}

// ─── Texts kept in a separate locale file ────────────────────────────────────

TEST(LsdeUtilsTest, ReadsALineBySceneAndBlock) {
    EXPECT_EQ(LsdeUtils::GetTextFromTable(table(), "reactor_breach", "DIALOG-001"), std::optional<std::string>("Sealed."));
}

TEST(LsdeUtilsTest, ReadsOneOptionOfAChoice) {
    EXPECT_EQ(LsdeUtils::GetTextFromTable(table(), "reactor_breach", "CHOICE-001", "C2"), std::optional<std::string>("Leave"));
}

TEST(LsdeUtilsTest, ReturnsNothingForASceneBlockOrOptionThatIsNotThere) {
    EXPECT_FALSE(LsdeUtils::GetTextFromTable(table(), "nowhere", "DIALOG-001").has_value());
    EXPECT_FALSE(LsdeUtils::GetTextFromTable(table(), "reactor_breach", "DIALOG-999").has_value());
    EXPECT_FALSE(LsdeUtils::GetTextFromTable(table(), "reactor_breach", "CHOICE-001", "C9").has_value());
}

TEST(LsdeUtilsTest, DoesNotHandBackTheBlockLineWhenAnOptionWasAskedFor) {
    EXPECT_FALSE(LsdeUtils::GetTextFromTable(table(), "reactor_breach", "DIALOG-001", "C1").has_value());
}

TEST(LsdeUtilsTest, DoesNotHandBackAnOptionMapWhenTheLineWasAskedFor) {
    EXPECT_FALSE(LsdeUtils::GetTextFromTable(table(), "reactor_breach", "CHOICE-001").has_value());
}

TEST(LsdeUtilsTest, SurvivesATableThatWasNeverLoaded) {
    EXPECT_FALSE(LsdeUtils::GetTextFromTable(LocaleTable{}, "reactor_breach", "DIALOG-001").has_value());
}

TEST(LsdeUtilsTest, BuildsTheKeyOfABlockAndOfOneOfItsOptions) {
    auto b = block("CHOICE-001", BlockType::Choice);
    EXPECT_EQ(LsdeUtils::GetTextKey(b), "__blueprints__.s1.CHOICE-001");
    EXPECT_EQ(LsdeUtils::GetTextKey(b, "C1"), "__blueprints__.s1.CHOICE-001.C1");
}

// ─── Sorting the props bag ───────────────────────────────────────────────────

namespace {
BlueprintBlock mixed() {
    auto b = dialog("DIALOG-001");
    b.props["isAsync"] = true;
    b.props["delay"] = 1000.0;
    b.props["timeout"] = 5000.0;
    b.props["debug"] = true;
    b.props["portraitSide"] = std::string("left");
    b.props["typewriterSpeed"] = 60.0;
    b.props["journalEntry"] = std::string("note de scène");
    return b;
}
} // namespace

TEST(LsdeUtilsTest, PullsOutWhatTheEngineActsOn) {
    auto natives = LsdeUtils::GetNativeProperties(mixed());
    EXPECT_EQ(natives.isAsync, true);
    EXPECT_EQ(natives.delay, 1000.0);
    EXPECT_EQ(natives.timeout, 5000.0);
    EXPECT_EQ(natives.debug, true);
    EXPECT_FALSE(natives.waitInput.has_value());
    EXPECT_TRUE(natives.waitForBlocks.empty());
}

TEST(LsdeUtilsTest, LeavesTheDesignerTheirOwnProperties) {
    auto custom = LsdeUtils::GetCustomProperties(mixed());
    EXPECT_EQ(custom.size(), 3u);
    EXPECT_EQ(std::get<std::string>(custom.at("portraitSide")), "left");
    EXPECT_EQ(std::get<double>(custom.at("typewriterSpeed")), 60.0);
    EXPECT_EQ(std::get<std::string>(custom.at("journalEntry")), "note de scène");
}

TEST(LsdeUtilsTest, HandlesABlockWithNoPropsAtAll) {
    EXPECT_FALSE(LsdeUtils::GetNativeProperties(dialog("DIALOG-002")).isAsync.has_value());
    EXPECT_TRUE(LsdeUtils::GetCustomProperties(dialog("DIALOG-002")).empty());
}

TEST(LsdeUtilsTest, KnowsWaitForBlocksIsANativeEvenThoughItHoldsAList) {
    auto waiting = dialog("DIALOG-003");
    waiting.props["waitForBlocks"] = std::vector<std::string>{"DIALOG-012"};
    EXPECT_EQ(LsdeUtils::GetNativeProperties(waiting).waitForBlocks, std::vector<std::string>({"DIALOG-012"}));
    EXPECT_TRUE(LsdeUtils::GetCustomProperties(waiting).empty());
}

TEST(LsdeUtilsTest, KnowsTheTenNativesAndNothingElse) {
    auto all = dialog("DIALOG-004");
    all.props["isAsync"] = true;
    all.props["delay"] = 1.0;
    all.props["timeout"] = 2.0;
    all.props["waitInput"] = true;
    all.props["debug"] = true;
    all.props["portPerCharacter"] = true;
    all.props["inPortPerCharacter"] = true;
    all.props["skipIfMissingActor"] = true;
    all.props["portPerCase"] = true;
    all.props["waitForBlocks"] = std::vector<std::string>{"X"};
    all.props["somethingElse"] = std::string("mine");

    auto natives = LsdeUtils::GetNativeProperties(all);
    EXPECT_EQ(natives.isAsync, true);
    EXPECT_EQ(natives.delay, 1.0);
    EXPECT_EQ(natives.timeout, 2.0);
    EXPECT_EQ(natives.waitInput, true);
    EXPECT_EQ(natives.debug, true);
    EXPECT_EQ(natives.portPerCharacter, true);
    EXPECT_EQ(natives.inPortPerCharacter, true);
    EXPECT_EQ(natives.skipIfMissingActor, true);
    EXPECT_EQ(natives.portPerCase, true);
    EXPECT_EQ(natives.waitForBlocks, std::vector<std::string>({"X"}));

    EXPECT_EQ(nativePropertyIds().size(), 10u);
    auto custom = LsdeUtils::GetCustomProperties(all);
    ASSERT_EQ(custom.size(), 1u);
    EXPECT_EQ(std::get<std::string>(custom.at("somethingElse")), "mine");
}

// ─── Condition helpers ───────────────────────────────────────────────────────

TEST(LsdeUtilsTest, RecognisesATestThatReadsAPastAnswer) {
    EXPECT_TRUE(LsdeUtils::IsChoiceCondition(choiceTest("CHOICE-001", "C1")));
    EXPECT_FALSE(LsdeUtils::IsChoiceCondition(gameTest("switches", "door_unlocked")));
}

TEST(LsdeUtilsTest, NamesTheChoiceBlockAChoiceTestReads) {
    EXPECT_EQ(LsdeUtils::GetChoiceConditionBlockId(choiceTest("CHOICE-001", "C1")), std::optional<std::string>("CHOICE-001"));
    EXPECT_FALSE(LsdeUtils::GetChoiceConditionBlockId(gameTest("switches", "x")).has_value());
}

TEST(LsdeUtilsTest, ReExposesTheEvaluationHelpers) {
    ConditionEvaluatorFn always = [](const ConditionTest&) { return true; };
    std::vector<ConditionCase> cases = {whenCase("K1")};
    Option c1;
    c1.id = "C1";
    c1.key = "__blueprints__.s1.CHOICE-001.C1";

    EXPECT_TRUE(LsdeUtils::EvaluateConditionChain({}, always));
    EXPECT_EQ(LsdeUtils::EvaluateConditionCases(cases, true, always), "K1");
    EXPECT_EQ(LsdeUtils::EvaluateEachCase(cases, always), std::vector<bool>({true}));
    EXPECT_EQ(LsdeUtils::TagOptionVisibility({c1}, &always)[0].visible, true);
}

TEST(LsdeUtilsTest, ReExposesTheRouterReadingOfTheSameCases) {
    // Every true case, then the continuation LAST: then when they all held, catch otherwise.
    std::vector<ConditionCase> cases = {whenCase("K1"), whenCase("K2")};
    EXPECT_EQ(LsdeUtils::PickRouterPorts(cases, {true, true}), std::vector<std::string>({"K1", "K2", Ports::Then}));
    EXPECT_EQ(LsdeUtils::PickRouterPorts(cases, {true, false}), std::vector<std::string>({"K1", Ports::Catch}));
    EXPECT_EQ(LsdeUtils::PickRouterPorts({}, {}), std::vector<std::string>({Ports::Then}));
}

// ─── Type guards ─────────────────────────────────────────────────────────────

TEST(LsdeUtilsTest, TheGuardsNarrowByTheLowercaseTypeName) {
    EXPECT_TRUE(LsdeUtils::IsDialogBlock(dialog("DIALOG-001")));
    EXPECT_TRUE(LsdeUtils::IsChoiceBlock(block("CHOICE-001", BlockType::Choice)));
    EXPECT_TRUE(LsdeUtils::IsConditionBlock(block("COND-001", BlockType::Condition)));
    EXPECT_TRUE(LsdeUtils::IsRouterBlock(block("ROUTER-001", BlockType::Router)));
    EXPECT_TRUE(LsdeUtils::IsActionBlock(block("ACTION-001", BlockType::Action)));
    EXPECT_TRUE(LsdeUtils::IsNoteBlock(block("NOTE-001", BlockType::Note)));

    // A router carries the same cases as a condition and is NOT one.
    EXPECT_FALSE(LsdeUtils::IsConditionBlock(block("ROUTER-001", BlockType::Router)));
    EXPECT_FALSE(LsdeUtils::IsRouterBlock(block("COND-001", BlockType::Condition)));
    EXPECT_FALSE(LsdeUtils::IsDialogBlock(block("CHOICE-001", BlockType::Choice)));
}

TEST(LsdeUtilsTest, MatchesNoGuardForAV1UppercaseType) {
    auto v1 = block("DIALOG-001", "DIALOG");
    EXPECT_FALSE(LsdeUtils::IsDialogBlock(v1));
    EXPECT_FALSE(LsdeUtils::IsNoteBlock(v1));
}

// LSDE Dialog Engine — the JSON loader, against the real v2 export.
//
// Reads the files LSDE actually wrote, never a payload built to match a theory. The polymorphic
// block reader is gone: v2 has ONE Block whose optional fields depend on its `type`, so there is
// nothing left to dispatch on while reading.

#include <gtest/gtest.h>
#include <lsde/json_loader.h>
#include <lsde/engine.h>
#include <lsde/utils.h>
#include <algorithm>
#include <fstream>

using namespace lsde;

namespace {

/// The reference export, written by LSDE 2.0.3 on 2026-09-07.
std::string blueprintPath() {
    return std::string(TEST_DATA_DIR)
        + "/../mock/blueprints/Engine-Conformance-Scene.blueprints.json";
}

BlueprintExport load() { return LsdeJson::parseFile(blueprintPath()); }

const BlueprintBlock* find(const BlueprintScene& scene, const std::string& id) {
    for (const auto& block : scene.blocks) {
        if (block.id == id) return &block;
    }
    return nullptr;
}

} // namespace

TEST(LsdeJson, ParsesTheHeader) {
    auto bp = load();

    EXPECT_EQ(bp.format, "lsde-blueprints");
    EXPECT_EQ(bp.version, 1);
    EXPECT_EQ(bp.generator.app, "LSDE");
    EXPECT_EQ(bp.referenceLocale, "en");
    EXPECT_EQ(bp.locales, std::vector<std::string>({"en", "fr", "es"}));
}

TEST(LsdeJson, ParsesTheHeaderTables) {
    auto bp = load();

    EXPECT_EQ(bp.dictionaries.size(), 4u);
    EXPECT_EQ(bp.functions.size(), 8u);
    EXPECT_EQ(bp.cards.size(), 14u);
    EXPECT_EQ(bp.cards[0].name, "kael");
    EXPECT_EQ(bp.cards[0].role, CardRole::Characters);
}

TEST(LsdeJson, ParsesTheScenes) {
    auto bp = load();

    ASSERT_EQ(bp.scenes.size(), 2u);
    EXPECT_EQ(bp.scenes[0].scene, "reactor_breach");
    EXPECT_EQ(bp.scenes[0].id.substr(0, 3), "sc_");
    ASSERT_TRUE(bp.scenes[0].start.has_value());
    EXPECT_EQ(*bp.scenes[0].start, "ACTION-001");
    EXPECT_EQ(bp.scenes[0].blocks.size(), 18u);
}

TEST(LsdeJson, ParsesWiresOffTheBlocksThatCarryThem) {
    // There is no connection table in v2: a block lists its own outgoing links.
    auto bp = load();
    const auto* action = find(bp.scenes[0], "ACTION-001");

    ASSERT_NE(action, nullptr);
    ASSERT_EQ(action->next.size(), 2u);
    EXPECT_EQ(action->next[0].port, Ports::Then);
    EXPECT_EQ(action->next[1].port, Ports::Catch);
    EXPECT_EQ(action->next[0].toPort, Ports::In);
}

TEST(LsdeJson, ParsesBlockTypesAsLowercaseStrings) {
    auto bp = load();
    std::vector<std::string> types;
    for (const auto& block : bp.scenes[0].blocks) types.push_back(block.type);

    auto has = [&types](const std::string& t) {
        return std::find(types.begin(), types.end(), t) != types.end();
    };

    EXPECT_TRUE(has(BlockType::Dialog));
    EXPECT_TRUE(has(BlockType::Choice));
    EXPECT_TRUE(has(BlockType::Condition));
    EXPECT_TRUE(has(BlockType::Action));
    EXPECT_TRUE(has(BlockType::Note));
}

TEST(LsdeJson, ParsesActorsAndEmotionAsCardIds) {
    auto bp = load();
    const auto* dialog = find(bp.scenes[0], "DIALOG-001");

    ASSERT_NE(dialog, nullptr);
    EXPECT_EQ(dialog->actors, std::vector<std::string>({"var2"}));
    ASSERT_TRUE(dialog->emotion.has_value());
    EXPECT_EQ(*dialog->emotion, "var9");
    ASSERT_TRUE(dialog->intensity.has_value());
    EXPECT_DOUBLE_EQ(*dialog->intensity, 45.0);
}

TEST(LsdeJson, ParsesTheInlineTextWithoutTouchingIt) {
    // The engine hands the RAW string over. Markers inside it belong to the game.
    auto bp = load();
    const auto* dialog = find(bp.scenes[0], "DIALOG-001");

    ASSERT_NE(dialog, nullptr);
    auto en = dialog->text.find("en");
    ASSERT_NE(en, dialog->text.end());
    EXPECT_NE(en->second.find("No sound"), std::string::npos);
}

TEST(LsdeJson, ParsesThePropsBagWithItsMixedValueTypes) {
    auto bp = load();
    const auto* choice = find(bp.scenes[0], "CHOICE-001");

    ASSERT_NE(choice, nullptr);
    EXPECT_NE(choice->props.find("typewriterSpeed"), choice->props.end());
    EXPECT_NE(choice->props.find("boxShake"), choice->props.end());

    // Reading a native out of the bag is a lookup against the nine ids, not a guess.
    auto natives = getNativeProperties(*choice);
    EXPECT_FALSE(natives.isAsync.has_value());
}

TEST(LsdeJson, ParsesTheOptionsOfAChoice) {
    auto bp = load();
    const auto* choice = find(bp.scenes[0], "CHOICE-001");

    ASSERT_NE(choice, nullptr);
    ASSERT_EQ(choice->options.size(), 4u);
    EXPECT_EQ(choice->options[0].id, "C1");
    EXPECT_FALSE(choice->options[0].when.has_value());
    EXPECT_TRUE(choice->options[2].when.has_value());
}

TEST(LsdeJson, ParsesTheCasesOfACondition) {
    auto bp = load();
    const auto* condition = find(bp.scenes[0], "COND-001");

    ASSERT_NE(condition, nullptr);
    ASSERT_EQ(condition->cases.size(), 3u);
    EXPECT_EQ(condition->cases[0].port, "K1");
    // The last case has no `when` at all: always true, and it shadows everything below it.
    EXPECT_FALSE(condition->cases[2].when.has_value());
}

TEST(LsdeJson, ParsesTheCallsOfAnAction) {
    auto bp = load();
    const auto* action = find(bp.scenes[0], "ACTION-001");

    ASSERT_NE(action, nullptr);
    ASSERT_FALSE(action->calls.empty());
    EXPECT_EQ(action->calls[0].fn, "play_music");
    EXPECT_NE(action->calls[0].args.find("track"), action->calls[0].args.end());
}

TEST(LsdeJson, TheBlockIdsRepeatBetweenScenes) {
    // The counter restarts at 1 in every scene, so DIALOG-001 exists in both. That is the normal
    // case, and it is exactly what the v1 engine refused.
    auto bp = load();

    ASSERT_EQ(bp.scenes.size(), 2u);
    EXPECT_NE(find(bp.scenes[0], "DIALOG-001"), nullptr);
    EXPECT_NE(find(bp.scenes[1], "DIALOG-001"), nullptr);
}

TEST(LsdeJson, ThePayloadItParsesLoadsWithNoError) {
    DialogueEngine engine;
    auto report = engine.init({load()});

    EXPECT_TRUE(report.errors.empty());
    EXPECT_TRUE(report.warnings.empty());
    EXPECT_EQ(report.stats.sceneCount, 2);
    EXPECT_EQ(report.stats.blockCount, 22);
}

TEST(LsdeJson, ParseFileThrowsOnAMissingFile) {
    EXPECT_THROW(LsdeJson::parseFile("no-such-file.json"), std::runtime_error);
}

// ─── waitForBlocks is the one native holding a LIST ──────────────────────────
//
// Every other native is a scalar, so the array branch of parsePropertyValue is exercised by
// nothing else. A PropertyValue that came back holding the wrong alternative would make the
// property silently inert: no error, no warning, and a block that never waits.
//
// DIALOG-008 of the reference export carries it.

TEST(LsdeJson, ParsesWaitForBlocksAsARealListOfIds) {
    auto bp = load();
    const auto* block = find(bp.scenes[0], "DIALOG-008");
    ASSERT_NE(block, nullptr);

    auto natives = getNativeProperties(*block);

    EXPECT_EQ(natives.waitForBlocks, std::vector<std::string>({"DIALOG-012", "DIALOG-007"}));
}

// Smoke tests for lsde::LsdeJson::parse() and parseFile()

#include <gtest/gtest.h>
#include <lsde/json_loader.h>
#include <lsde/engine.h>
#include <fstream>
#include <sstream>

static std::string getBlueprintPath() {
    // Blueprint is at repo root: blueprints/blueprint.json
    return std::string(TEST_DATA_DIR) + "/../blueprints/blueprint.json";
}

static std::string readFile(const std::string& path) {
    std::ifstream f(path);
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

TEST(LsdeJsonTest, ParseString_ReturnsValidBlueprint) {
    auto json = readFile(getBlueprintPath());
    auto bp = lsde::LsdeJson::parse(json);
    ASSERT_FALSE(bp.scenes.empty());
}

TEST(LsdeJsonTest, ParseFile_ReturnsValidBlueprint) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    ASSERT_FALSE(bp.scenes.empty());
}

TEST(LsdeJsonTest, Parse_HasBlocks) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    ASSERT_FALSE(bp.scenes[0].blocks.empty());
}

TEST(LsdeJsonTest, Parse_HasConnections) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    ASSERT_FALSE(bp.scenes[0].connections.empty());
}

TEST(LsdeJsonTest, Parse_PolymorphicBlocks_Dialog) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    bool found = false;
    for (const auto& block : bp.scenes[0].blocks) {
        if (block->type == lsde::BlockType::Dialog) {
            auto* dialog = dynamic_cast<lsde::DialogBlock*>(block.get());
            ASSERT_NE(dialog, nullptr);
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "No DialogBlock found";
}

TEST(LsdeJsonTest, Parse_PolymorphicBlocks_Choice) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    bool found = false;
    for (const auto& block : bp.scenes[0].blocks) {
        if (block->type == lsde::BlockType::Choice) {
            auto* choice = dynamic_cast<lsde::ChoiceBlock*>(block.get());
            ASSERT_NE(choice, nullptr);
            ASSERT_FALSE(choice->choices.empty()) << "ChoiceBlock should have choices";
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "No ChoiceBlock found";
}

TEST(LsdeJsonTest, Parse_PolymorphicBlocks_Action) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    bool found = false;
    for (const auto& block : bp.scenes[0].blocks) {
        if (block->type == lsde::BlockType::Action) {
            auto* action = dynamic_cast<lsde::ActionBlock*>(block.get());
            ASSERT_NE(action, nullptr);
            ASSERT_FALSE(action->actions.empty()) << "ActionBlock should have actions";
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "No ActionBlock found";
}

TEST(LsdeJsonTest, Parse_PolymorphicBlocks_Condition) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    bool found = false;
    for (const auto& block : bp.scenes[0].blocks) {
        if (block->type == lsde::BlockType::Condition) {
            auto* cond = dynamic_cast<lsde::ConditionBlock*>(block.get());
            ASSERT_NE(cond, nullptr);
            found = true;
            break;
        }
    }
    ASSERT_TRUE(found) << "No ConditionBlock found";
}

TEST(LsdeJsonTest, Parse_InitEngine_NoErrors) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    lsde::DialogueEngine engine;
    auto report = engine.init({bp});
    ASSERT_TRUE(report.errors.empty());
}

// Smoke tests for lsde::LsdeJson::parse() and parseFile()

#include <gtest/gtest.h>
#include <lsde/json_loader.h>
#include <lsde/engine.h>
#include <lsde/condition_evaluator.h>
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

TEST(LsdeJsonTest, Parse_ConditionBlock_Has2DConditions) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    for (const auto& block : bp.scenes[0].blocks) {
        if (block->type == lsde::BlockType::Condition) {
            auto* cond = dynamic_cast<lsde::ConditionBlock*>(block.get());
            ASSERT_NE(cond, nullptr);
            // conditions is 2D: vector<vector<ExportCondition>>
            ASSERT_FALSE(cond->conditions.empty()) << "ConditionBlock should have condition groups";
            ASSERT_FALSE(cond->conditions[0].empty()) << "First group should have conditions";
            ASSERT_FALSE(cond->conditions[0][0].key.empty()) << "Condition should have a key";
            break;
        }
    }
}

TEST(LsdeJsonTest, Parse_InitEngine_NoErrors) {
    auto bp = lsde::LsdeJson::parseFile(getBlueprintPath());
    lsde::DialogueEngine engine;
    auto report = engine.init({bp});
    ASSERT_TRUE(report.errors.empty());
}

// ─── evaluateConditionGroups tests ──────────────────────────────────────────

static lsde::ExportCondition makeCond(const std::string& key, const std::string& value) {
    return {"uuid", key, std::nullopt, "==", value};
}

TEST(ConditionEvaluatorTest, SwitchMode_ReturnsFirstMatchIndex) {
    std::vector<std::vector<lsde::ExportCondition>> groups = {
        {makeCond("a", "1")},  // group 0 — false
        {makeCond("b", "2")},  // group 1 — true
        {makeCond("c", "3")},  // group 2 — true (not reached in switch)
    };
    auto evaluator = [](const lsde::ExportCondition& c) { return c.key != "a"; };
    auto result = lsde::evaluateConditionGroups(groups, evaluator, false);
    ASSERT_TRUE(std::holds_alternative<int>(result));
    ASSERT_EQ(std::get<int>(result), 1);
}

TEST(ConditionEvaluatorTest, SwitchMode_ReturnsMinusOneOnNoMatch) {
    std::vector<std::vector<lsde::ExportCondition>> groups = {
        {makeCond("a", "1")},
    };
    auto evaluator = [](const lsde::ExportCondition&) { return false; };
    auto result = lsde::evaluateConditionGroups(groups, evaluator, false);
    ASSERT_TRUE(std::holds_alternative<int>(result));
    ASSERT_EQ(std::get<int>(result), -1);
}

TEST(ConditionEvaluatorTest, DispatcherMode_ReturnsAllMatchingIndices) {
    std::vector<std::vector<lsde::ExportCondition>> groups = {
        {makeCond("a", "1")},  // group 0 — false
        {makeCond("b", "2")},  // group 1 — true
        {makeCond("c", "3")},  // group 2 — true
    };
    auto evaluator = [](const lsde::ExportCondition& c) { return c.key != "a"; };
    auto result = lsde::evaluateConditionGroups(groups, evaluator, true);
    ASSERT_TRUE(std::holds_alternative<std::vector<int>>(result));
    auto& indices = std::get<std::vector<int>>(result);
    ASSERT_EQ(indices.size(), 2u);
    ASSERT_EQ(indices[0], 1);
    ASSERT_EQ(indices[1], 2);
}

TEST(ConditionEvaluatorTest, EmptyGroups_SwitchReturnsMinusOne) {
    std::vector<std::vector<lsde::ExportCondition>> groups;
    auto evaluator = [](const lsde::ExportCondition&) { return true; };
    auto result = lsde::evaluateConditionGroups(groups, evaluator, false);
    ASSERT_TRUE(std::holds_alternative<int>(result));
    ASSERT_EQ(std::get<int>(result), -1);
}

TEST(ConditionEvaluatorTest, EmptyGroups_DispatcherReturnsEmptyVector) {
    std::vector<std::vector<lsde::ExportCondition>> groups;
    auto evaluator = [](const lsde::ExportCondition&) { return true; };
    auto result = lsde::evaluateConditionGroups(groups, evaluator, true);
    ASSERT_TRUE(std::holds_alternative<std::vector<int>>(result));
    ASSERT_TRUE(std::get<std::vector<int>>(result).empty());
}

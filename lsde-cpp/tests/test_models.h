// Cross-language test JSON deserialization models

#pragma once

#include <lsde/types.h>
#include <string>
#include <vector>
#include <optional>
#include <unordered_map>

namespace lsde::tests {

struct StateBridgeConfig {
    std::unordered_map<std::string, bool> conditions;
    std::unordered_map<std::string, std::string> dictionaries;
    std::unordered_map<std::string, std::string> actions;
};

struct StepExpect {
    std::string type;
    std::optional<std::string> blockUuid;
    std::optional<std::string> dialogueText;
    std::optional<int> visibleChoiceCount;
};

struct StepAction {
    std::string type;
    std::optional<std::string> choiceUuid;
    std::optional<bool> value;
    std::optional<std::string> error;
    std::optional<std::string> name;
    std::optional<std::string> characterName;
};

struct TestStep {
    StepExpect expect;
    std::optional<StepAction> action;
};

struct ExpectedStats {
    int sceneCount = 0;
    int blockCount = 0;
    int connectionCount = 0;
};

struct TestCase {
    std::string id;
    std::optional<std::string> description;
    std::vector<TestStep> steps;
    std::vector<std::string> expectedVisited;
    std::optional<int> expectedCleanupCalls;
    std::optional<bool> orderIndependent;
    std::vector<std::string> expectedErrors;
    std::vector<std::string> expectedWarnings;
    std::optional<ExpectedStats> expectedStats;
};

struct TestSuite {
    std::string id;
    std::string description;
    BlueprintExport blueprint;
    std::optional<std::string> sceneId;
    std::optional<std::string> locale;
    std::optional<StateBridgeConfig> stateBridge;
    std::vector<TestCase> cases;
};

struct TestFile {
    std::string version;
    std::vector<TestSuite> suites;
};

} // namespace lsde::tests

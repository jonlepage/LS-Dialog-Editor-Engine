// JSON deserialization for test-only types.
// Engine types are now in the public header: <lsde/json_loader.h>

#include "json_deserializer.h"

namespace lsde::tests {

void from_json(const nlohmann::json& j, StateBridgeConfig& v) {
    if (j.contains("conditions")) {
        for (auto& [k, val] : j["conditions"].items()) v.conditions[k] = val.get<bool>();
    }
    if (j.contains("dictionaries")) {
        for (auto& [k, val] : j["dictionaries"].items()) v.dictionaries[k] = val.get<std::string>();
    }
    if (j.contains("actions")) {
        for (auto& [k, val] : j["actions"].items()) v.actions[k] = val.get<std::string>();
    }
}

void from_json(const nlohmann::json& j, StepExpect& v) {
    j.at("type").get_to(v.type);
    if (j.contains("blockUuid") && !j["blockUuid"].is_null()) v.blockUuid = j["blockUuid"].get<std::string>();
    if (j.contains("dialogueText") && !j["dialogueText"].is_null()) v.dialogueText = j["dialogueText"].get<std::string>();
    if (j.contains("visibleChoiceCount") && !j["visibleChoiceCount"].is_null()) v.visibleChoiceCount = j["visibleChoiceCount"].get<int>();
}

void from_json(const nlohmann::json& j, StepAction& v) {
    j.at("type").get_to(v.type);
    if (j.contains("choiceUuid") && !j["choiceUuid"].is_null()) v.choiceUuid = j["choiceUuid"].get<std::string>();
    if (j.contains("value") && !j["value"].is_null()) v.value = j["value"].get<bool>();
    if (j.contains("error") && !j["error"].is_null()) v.error = j["error"].get<std::string>();
    if (j.contains("name") && !j["name"].is_null()) v.name = j["name"].get<std::string>();
    if (j.contains("characterName") && !j["characterName"].is_null()) v.characterName = j["characterName"].get<std::string>();
}

void from_json(const nlohmann::json& j, TestStep& v) {
    v.expect = j.at("expect").get<StepExpect>();
    if (j.contains("action") && !j["action"].is_null()) v.action = j["action"].get<StepAction>();
}

void from_json(const nlohmann::json& j, ExpectedStats& v) {
    j.at("sceneCount").get_to(v.sceneCount);
    j.at("blockCount").get_to(v.blockCount);
    j.at("connectionCount").get_to(v.connectionCount);
}

void from_json(const nlohmann::json& j, TestCase& v) {
    j.at("id").get_to(v.id);
    if (j.contains("description") && !j["description"].is_null()) v.description = j["description"].get<std::string>();
    if (j.contains("steps")) v.steps = j["steps"].get<std::vector<TestStep>>();
    if (j.contains("expectedVisited")) v.expectedVisited = j["expectedVisited"].get<std::vector<std::string>>();
    if (j.contains("expectedCleanupCalls") && !j["expectedCleanupCalls"].is_null()) v.expectedCleanupCalls = j["expectedCleanupCalls"].get<int>();
    if (j.contains("orderIndependent") && !j["orderIndependent"].is_null()) v.orderIndependent = j["orderIndependent"].get<bool>();
    if (j.contains("expectedErrors")) v.expectedErrors = j["expectedErrors"].get<std::vector<std::string>>();
    if (j.contains("expectedWarnings")) v.expectedWarnings = j["expectedWarnings"].get<std::vector<std::string>>();
    if (j.contains("expectedStats") && !j["expectedStats"].is_null()) v.expectedStats = j["expectedStats"].get<ExpectedStats>();
}

void from_json(const nlohmann::json& j, TestSuite& v) {
    j.at("id").get_to(v.id);
    if (j.contains("description")) j.at("description").get_to(v.description);
    v.blueprint = j.at("blueprint").get<lsde::BlueprintExport>();
    if (j.contains("sceneId") && !j["sceneId"].is_null()) v.sceneId = j["sceneId"].get<std::string>();
    if (j.contains("locale") && !j["locale"].is_null()) v.locale = j["locale"].get<std::string>();
    if (j.contains("stateBridge") && !j["stateBridge"].is_null()) v.stateBridge = j["stateBridge"].get<StateBridgeConfig>();
    v.cases = j.at("cases").get<std::vector<TestCase>>();
}

void from_json(const nlohmann::json& j, TestFile& v) {
    if (j.contains("version")) j.at("version").get_to(v.version);
    v.suites = j.at("suites").get<std::vector<TestSuite>>();
}

} // namespace lsde::tests

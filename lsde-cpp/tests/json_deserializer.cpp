// JSON deserialization for test-only types.
// Engine types come from the public header: <lsde/json_loader.h>

#include "json_deserializer.h"

namespace lsde::tests {

namespace {

std::optional<std::string> optString(const nlohmann::json& j, const char* key) {
    auto it = j.find(key);
    if (it == j.end() || it->is_null()) return std::nullopt;
    return it->get<std::string>();
}

} // namespace

void from_json(const nlohmann::json& j, StateBridgeConfig& v) {
    auto conditions = j.find("conditions");
    if (conditions != j.end() && conditions->is_object()) {
        for (auto entry = conditions->begin(); entry != conditions->end(); ++entry) {
            v.conditions[entry.key()] = entry.value().get<bool>();
        }
    }
    auto trueTimes = j.find("trueTimes");
    if (trueTimes != j.end() && trueTimes->is_object()) {
        for (auto entry = trueTimes->begin(); entry != trueTimes->end(); ++entry) {
            v.trueTimes[entry.key()] = entry.value().get<int>();
        }
    }
}

void from_json(const nlohmann::json& j, StepExpect& v) {
    j.at("type").get_to(v.type);
    v.blockId = optString(j, "blockId");
    v.text = optString(j, "text");
    v.characterId = optString(j, "characterId");
    auto count = j.find("visibleOptionCount");
    if (count != j.end() && !count->is_null()) v.visibleOptionCount = count->get<int>();
}

void from_json(const nlohmann::json& j, StepAction& v) {
    j.at("type").get_to(v.type);
    v.optionId = optString(j, "optionId");
    v.port = optString(j, "port");
    v.cardId = optString(j, "cardId");
    v.error = optString(j, "error");
}

void from_json(const nlohmann::json& j, TestStep& v) {
    v.expect = j.at("expect").get<StepExpect>();
    auto action = j.find("action");
    if (action != j.end() && !action->is_null()) v.action = action->get<StepAction>();
}

void from_json(const nlohmann::json& j, ExpectedStats& v) {
    j.at("sceneCount").get_to(v.sceneCount);
    j.at("blockCount").get_to(v.blockCount);
    j.at("connectionCount").get_to(v.connectionCount);
}

void from_json(const nlohmann::json& j, TestCase& v) {
    j.at("id").get_to(v.id);
    v.description = optString(j, "description");

    auto steps = j.find("steps");
    if (steps != j.end() && steps->is_array()) v.steps = steps->get<std::vector<TestStep>>();

    // Absent and empty mean different things here: nullopt = the spec says nothing about it,
    // an empty vector = expect none at all.
    auto visited = j.find("expectedVisited");
    if (visited != j.end() && visited->is_array()) {
        v.expectedVisited = visited->get<std::vector<std::string>>();
    }

    auto cleanups = j.find("expectedCleanupCalls");
    if (cleanups != j.end() && !cleanups->is_null()) v.expectedCleanupCalls = cleanups->get<int>();

    auto running = j.find("expectedRunning");
    if (running != j.end() && !running->is_null()) v.expectedRunning = running->get<bool>();

    auto orderIndependent = j.find("orderIndependent");
    if (orderIndependent != j.end() && !orderIndependent->is_null()) {
        v.orderIndependent = orderIndependent->get<bool>();
    }

    v.expectedExitReason = optString(j, "expectedExitReason");

    auto waitingFor = j.find("expectedWaitingFor");
    if (waitingFor != j.end() && waitingFor->is_array()) {
        v.expectedWaitingFor = waitingFor->get<std::vector<std::string>>();
    }

    auto thrown = j.find("expectedThrow");
    if (thrown != j.end() && !thrown->is_null()) v.expectedThrow = thrown->get<bool>();

    auto errors = j.find("expectedErrors");
    if (errors != j.end() && errors->is_array()) {
        v.expectedErrors = errors->get<std::vector<std::string>>();
    }

    auto warnings = j.find("expectedWarnings");
    if (warnings != j.end() && warnings->is_array()) {
        v.expectedWarnings = warnings->get<std::vector<std::string>>();
    }

    auto stats = j.find("expectedStats");
    if (stats != j.end() && !stats->is_null()) v.expectedStats = stats->get<ExpectedStats>();
}

void from_json(const nlohmann::json& j, TestSuite& v) {
    j.at("id").get_to(v.id);
    auto description = j.find("description");
    if (description != j.end() && description->is_string()) description->get_to(v.description);

    auto blueprint = j.find("blueprint");
    if (blueprint != j.end() && !blueprint->is_null()) v.blueprint = blueprint->get<lsde::BlueprintExport>();
    auto files = j.find("blueprintFiles");
    if (files != j.end() && files->is_array()) v.blueprintFiles = files->get<std::vector<lsde::BlueprintExport>>();
    v.sceneId = optString(j, "sceneId");
    v.locale = optString(j, "locale");

    auto stateBridge = j.find("stateBridge");
    if (stateBridge != j.end() && !stateBridge->is_null()) {
        v.stateBridge = stateBridge->get<StateBridgeConfig>();
    }

    auto requiresExceptions = j.find("requiresExceptions");
    if (requiresExceptions != j.end() && !requiresExceptions->is_null()) {
        v.requiresExceptions = requiresExceptions->get<bool>();
    }

    v.cases = j.at("cases").get<std::vector<TestCase>>();
}

void from_json(const nlohmann::json& j, TestFile& v) {
    auto version = j.find("version");
    if (version != j.end() && version->is_string()) version->get_to(v.version);

    auto description = j.find("description");
    if (description != j.end() && description->is_string()) description->get_to(v.description);

    v.suites = j.at("suites").get<std::vector<TestSuite>>();
}

} // namespace lsde::tests

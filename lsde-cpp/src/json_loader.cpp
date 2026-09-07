// LSDE Dialog Engine — Optional JSON loader (nlohmann/json)
//
// The core library is stdlib-only; this file is the one place nlohmann/json appears, and a game
// that already has a parser fills the structs itself and never links it.

#include "lsde/json_loader.h"

#include <fstream>
#include <sstream>

namespace lsde {

namespace {

/// Read an optional string field, treating an explicit null as absent.
std::optional<std::string> optString(const nlohmann::json& j, const char* key) {
    auto it = j.find(key);
    if (it == j.end() || it->is_null()) return std::nullopt;
    return it->get<std::string>();
}

std::optional<double> optNumber(const nlohmann::json& j, const char* key) {
    auto it = j.find(key);
    if (it == j.end() || it->is_null()) return std::nullopt;
    return it->get<double>();
}

std::string str(const nlohmann::json& j, const char* key, const std::string& fallback = "") {
    auto it = j.find(key);
    if (it == j.end() || it->is_null()) return fallback;
    return it->get<std::string>();
}

TextByLocale readText(const nlohmann::json& j, const char* key) {
    TextByLocale text;
    auto it = j.find(key);
    if (it == j.end() || !it->is_object()) return text;
    for (auto entry = it->begin(); entry != it->end(); ++entry) {
        if (entry.value().is_string()) text[entry.key()] = entry.value().get<std::string>();
    }
    return text;
}

PropertyBag readBag(const nlohmann::json& j, const char* key) {
    PropertyBag bag;
    auto it = j.find(key);
    if (it == j.end() || !it->is_object()) return bag;
    for (auto entry = it->begin(); entry != it->end(); ++entry) {
        bag[entry.key()] = parsePropertyValue(entry.value());
    }
    return bag;
}

template <typename T>
std::vector<T> readList(const nlohmann::json& j, const char* key) {
    std::vector<T> list;
    auto it = j.find(key);
    if (it == j.end() || !it->is_array()) return list;
    for (const auto& item : *it) list.push_back(item.get<T>());
    return list;
}

} // namespace

PropertyValue parsePropertyValue(const nlohmann::json& j) {
    if (j.is_boolean()) return j.get<bool>();
    if (j.is_number()) return j.get<double>();
    if (j.is_array()) {
        // waitForBlocks is the one native holding a LIST rather than a scalar.
        std::vector<std::string> items;
        for (const auto& item : j) {
            if (item.is_string()) items.push_back(item.get<std::string>());
        }
        return items;
    }
    if (j.is_string()) return j.get<std::string>();
    return std::string{};
}

// ─── Header tables ───────────────────────────────────────────────────────────

void from_json(const nlohmann::json& j, Generator& v) {
    v.app = str(j, "app");
    v.version = str(j, "version");
}

void from_json(const nlohmann::json& j, DictionaryDefinition& v) {
    v.id = str(j, "id");
    v.valueType = str(j, "valueType");
    v.entries = readList<std::string>(j, "entries");
}

void from_json(const nlohmann::json& j, FunctionParameter& v) {
    v.name = str(j, "name");
    v.type = str(j, "type");
    v.dictionary = optString(j, "dictionary");
}

void from_json(const nlohmann::json& j, FunctionDefinition& v) {
    v.id = str(j, "id");
    auto params = j.find("params");
    if (params != j.end() && params->is_array()) {
        for (const auto& item : *params) v.params.push_back(item.get<FunctionParameter>());
    }
}

void from_json(const nlohmann::json& j, Card& v) {
    v.id = str(j, "id");
    v.name = str(j, "name");
    v.role = str(j, "role");
}

// ─── Block parts ─────────────────────────────────────────────────────────────

void from_json(const nlohmann::json& j, Link& v) {
    v.port = str(j, "port");
    v.to = str(j, "to");
    v.toPort = str(j, "toPort", "in");
}

void from_json(const nlohmann::json& j, ActionCall& v) {
    v.fn = str(j, "fn");
    v.args = readBag(j, "args");
}

void from_json(const nlohmann::json& j, ConditionTest& v) {
    v.dict = str(j, "dict");
    v.entry = str(j, "entry");
    v.op = str(j, "op");
    auto value = j.find("value");
    if (value != j.end()) v.value = parsePropertyValue(*value);
    v.join = optString(j, "join");
}

void from_json(const nlohmann::json& j, ConditionCase& v) {
    v.port = str(j, "port");
    // Absent `when` means always true — that is how "always" is written in v2, never by an empty
    // list, so the difference between absent and empty is kept here.
    auto when = j.find("when");
    if (when != j.end() && when->is_array()) {
        std::vector<ConditionTest> tests;
        for (const auto& item : *when) tests.push_back(item.get<ConditionTest>());
        v.when = std::move(tests);
    }
}

void from_json(const nlohmann::json& j, Option& v) {
    v.id = str(j, "id");
    v.key = str(j, "key");
    v.text = readText(j, "text");
    auto when = j.find("when");
    if (when != j.end() && when->is_array()) {
        std::vector<ConditionTest> tests;
        for (const auto& item : *when) tests.push_back(item.get<ConditionTest>());
        v.when = std::move(tests);
    }
}

void from_json(const nlohmann::json& j, BlueprintBlock& v) {
    v.id = str(j, "id");
    v.key = str(j, "key");
    v.label = optString(j, "label");
    v.parentLabels = readList<std::string>(j, "parentLabels");
    v.type = str(j, "type");
    v.actors = readList<std::string>(j, "actors");
    v.emotion = optString(j, "emotion");
    v.intensity = optNumber(j, "intensity");
    v.text = readText(j, "text");
    v.body = optString(j, "body");
    v.note = optString(j, "note");
    v.props = readBag(j, "props");

    auto calls = j.find("calls");
    if (calls != j.end() && calls->is_array()) {
        for (const auto& item : *calls) v.calls.push_back(item.get<ActionCall>());
    }

    auto cases = j.find("cases");
    if (cases != j.end() && cases->is_array()) {
        for (const auto& item : *cases) v.cases.push_back(item.get<ConditionCase>());
    }

    auto options = j.find("options");
    if (options != j.end() && options->is_array()) {
        for (const auto& item : *options) v.options.push_back(item.get<Option>());
    }

    auto next = j.find("next");
    if (next != j.end() && next->is_array()) {
        for (const auto& item : *next) v.next.push_back(item.get<Link>());
    }
}

// ─── Scene and export ────────────────────────────────────────────────────────

void from_json(const nlohmann::json& j, BlueprintScene& v) {
    v.scene = str(j, "scene");
    v.id = str(j, "id");
    v.label = optString(j, "label");
    v.start = optString(j, "start");

    auto blocks = j.find("blocks");
    if (blocks != j.end() && blocks->is_array()) {
        for (const auto& item : *blocks) v.blocks.push_back(item.get<BlueprintBlock>());
    }
}

void from_json(const nlohmann::json& j, BlueprintExport& v) {
    v.format = str(j, "format");

    // A v1 payload wrote "version": "1.0.0", a string. Reading it as 0 rather than throwing keeps
    // the parse alive long enough for the validator to refuse the file BY NAME — refusing a
    // payload is the loader's job, not the parser's.
    auto version = j.find("version");
    if (version != j.end()) {
        if (version->is_number()) v.version = version->get<int>();
        else v.version = 0;
    }

    auto generator = j.find("generator");
    if (generator != j.end() && generator->is_object()) v.generator = generator->get<Generator>();

    v.exportedAt = str(j, "exportedAt");
    v.project = str(j, "project");
    v.locales = readList<std::string>(j, "locales");
    v.referenceLocale = str(j, "referenceLocale");

    auto dictionaries = j.find("dictionaries");
    if (dictionaries != j.end() && dictionaries->is_array()) {
        for (const auto& item : *dictionaries) v.dictionaries.push_back(item.get<DictionaryDefinition>());
    }

    auto functions = j.find("functions");
    if (functions != j.end() && functions->is_array()) {
        for (const auto& item : *functions) v.functions.push_back(item.get<FunctionDefinition>());
    }

    auto cards = j.find("cards");
    if (cards != j.end() && cards->is_array()) {
        for (const auto& item : *cards) v.cards.push_back(item.get<Card>());
    }

    auto scenes = j.find("scenes");
    if (scenes != j.end() && scenes->is_array()) {
        for (const auto& item : *scenes) v.scenes.push_back(item.get<BlueprintScene>());
    }
}

// ─── LsdeJson ────────────────────────────────────────────────────────────────

BlueprintExport LsdeJson::parse(const std::string& json) {
    return nlohmann::json::parse(json).get<BlueprintExport>();
}

BlueprintExport LsdeJson::parseFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open blueprint file: " + path);
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    return parse(buffer.str());
}

} // namespace lsde

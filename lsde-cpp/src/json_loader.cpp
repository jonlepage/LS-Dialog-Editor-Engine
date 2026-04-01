// JSON loader implementation for LSDE blueprints using nlohmann/json.
// Optional — only compiled when LSDE_JSON_LOADER is enabled.

#include <lsde/json_loader.h>
#include <fstream>
#include <memory>

namespace lsde {

// ─── Internal helpers ───────────────────────────────────────────────────────

static PropertyValue parsePropertyValue(const nlohmann::json& j) {
    if (j.is_boolean()) return j.get<bool>();
    if (j.is_number()) return j.get<double>();
    if (j.is_string()) return j.get<std::string>();
    return std::string{};
}

static BlockType parseBlockType(const std::string& s) {
    if (s == "DIALOG") return BlockType::Dialog;
    if (s == "CHOICE") return BlockType::Choice;
    if (s == "CONDITION") return BlockType::Condition;
    if (s == "ACTION") return BlockType::Action;
    return BlockType::Note;
}

static void parseBaseFields(const nlohmann::json& j, BlueprintBlock& v) {
    j.at("uuid").get_to(v.uuid);
    v.type = parseBlockType(j.at("type").get<std::string>());
    if (j.contains("label") && !j["label"].is_null()) v.label = j["label"].get<std::string>();
    if (j.contains("parentLabels")) v.parentLabels = j["parentLabels"].get<std::vector<std::string>>();
    if (j.contains("properties")) v.properties = j["properties"].get<std::vector<BlockProperty>>();
    if (j.contains("nativeProperties") && !j["nativeProperties"].is_null())
        v.nativeProperties = j["nativeProperties"].get<NativeProperties>();
    if (j.contains("metadata") && !j["metadata"].is_null())
        v.metadata = j["metadata"].get<BlockMetadata>();
    if (j.contains("isStartBlock") && !j["isStartBlock"].is_null())
        v.isStartBlock = j["isStartBlock"].get<bool>();
}

static std::shared_ptr<BlueprintBlock> parseBlock(const nlohmann::json& j) {
    auto typeStr = j.at("type").get<std::string>();
    auto blockType = parseBlockType(typeStr);

    switch (blockType) {
        case BlockType::Dialog: {
            auto b = std::make_shared<DialogBlock>();
            parseBaseFields(j, *b);
            if (j.contains("structureKey") && !j["structureKey"].is_null()) b->structureKey = j["structureKey"].get<std::string>();
            if (j.contains("content") && !j["content"].is_null()) b->content = j["content"].get<std::string>();
            if (j.contains("dialogueText") && j["dialogueText"].is_object()) {
                for (auto& [k, val] : j["dialogueText"].items()) b->dialogueText[k] = val.get<std::string>();
            }
            return b;
        }
        case BlockType::Choice: {
            auto b = std::make_shared<ChoiceBlock>();
            parseBaseFields(j, *b);
            if (j.contains("choices")) b->choices = j["choices"].get<std::vector<ChoiceItem>>();
            if (j.contains("note") && !j["note"].is_null()) b->note = j["note"].get<std::string>();
            return b;
        }
        case BlockType::Condition: {
            auto b = std::make_shared<ConditionBlock>();
            parseBaseFields(j, *b);
            if (j.contains("conditions")) b->conditions = j["conditions"].get<std::vector<ExportCondition>>();
            if (j.contains("note") && !j["note"].is_null()) b->note = j["note"].get<std::string>();
            return b;
        }
        case BlockType::Action: {
            auto b = std::make_shared<ActionBlock>();
            parseBaseFields(j, *b);
            if (j.contains("actions")) b->actions = j["actions"].get<std::vector<ExportAction>>();
            if (j.contains("note") && !j["note"].is_null()) b->note = j["note"].get<std::string>();
            return b;
        }
        default: {
            auto b = std::make_shared<NoteBlock>();
            parseBaseFields(j, *b);
            return b;
        }
    }
}

// ─── from_json implementations ──────────────────────────────────────────────

void from_json(const nlohmann::json& j, BlueprintConnection& v) {
    j.at("id").get_to(v.id);
    j.at("fromId").get_to(v.fromId);
    j.at("toId").get_to(v.toId);
    j.at("fromPort").get_to(v.fromPort);
    j.at("toPort").get_to(v.toPort);
    if (j.contains("fromPortIndex") && !j["fromPortIndex"].is_null())
        v.fromPortIndex = j["fromPortIndex"].get<int>();
}

void from_json(const nlohmann::json& j, BlockProperty& v) {
    j.at("key").get_to(v.key);
    v.value = parsePropertyValue(j.at("value"));
}

void from_json(const nlohmann::json& j, ExportCondition& v) {
    j.at("uuid").get_to(v.uuid);
    j.at("key").get_to(v.key);
    if (j.contains("chain") && !j["chain"].is_null()) v.chain = j["chain"].get<std::string>();
    if (j.contains("operator")) j.at("operator").get_to(v.op);
    if (j.contains("value")) j.at("value").get_to(v.value);
}

void from_json(const nlohmann::json& j, ExportAction& v) {
    j.at("uuid").get_to(v.uuid);
    if (j.contains("signatureUuid") && !j["signatureUuid"].is_null()) v.signatureUuid = j["signatureUuid"].get<std::string>();
    j.at("actionId").get_to(v.actionId);
    if (j.contains("params") && j["params"].is_array()) {
        for (const auto& p : j["params"]) v.params.push_back(parsePropertyValue(p));
    }
}

void from_json(const nlohmann::json& j, ChoiceItem& v) {
    j.at("uuid").get_to(v.uuid);
    if (j.contains("structureKey")) j.at("structureKey").get_to(v.structureKey);
    if (j.contains("label") && !j["label"].is_null()) v.label = j["label"].get<std::string>();
    if (j.contains("dialogueText") && j["dialogueText"].is_object()) {
        for (auto& [k, val] : j["dialogueText"].items()) v.dialogueText[k] = val.get<std::string>();
    }
    if (j.contains("visibilityConditions") && j["visibilityConditions"].is_array()) {
        v.visibilityConditions = j["visibilityConditions"].get<std::vector<ExportCondition>>();
    }
}

void from_json(const nlohmann::json& j, NativeProperties& v) {
    if (j.contains("isAsync") && !j["isAsync"].is_null()) v.isAsync = j["isAsync"].get<bool>();
    if (j.contains("delay") && !j["delay"].is_null()) v.delay = j["delay"].get<double>();
    if (j.contains("timeout") && !j["timeout"].is_null()) v.timeout = j["timeout"].get<double>();
    if (j.contains("debug") && !j["debug"].is_null()) v.debug = j["debug"].get<bool>();
    if (j.contains("portPerCharacter") && !j["portPerCharacter"].is_null()) v.portPerCharacter = j["portPerCharacter"].get<bool>();
    if (j.contains("skipIfMissingActor") && !j["skipIfMissingActor"].is_null()) v.skipIfMissingActor = j["skipIfMissingActor"].get<bool>();
    if (j.contains("waitForBlocks") && !j["waitForBlocks"].is_null()) v.waitForBlocks = j["waitForBlocks"].get<std::vector<std::string>>();
    if (j.contains("waitInput") && !j["waitInput"].is_null()) v.waitInput = j["waitInput"].get<bool>();
}

void from_json(const nlohmann::json& j, BlockCharacter& v) {
    if (j.contains("uuid") && !j["uuid"].is_null()) j["uuid"].get_to(v.uuid);
    if (j.contains("id") && !j["id"].is_null()) j["id"].get_to(v.id);
    if (j.contains("name") && !j["name"].is_null()) j["name"].get_to(v.name);
    if (j.contains("emotion") && !j["emotion"].is_null()) v.emotion = j["emotion"].get<std::string>();
    if (j.contains("emotionIntensity") && !j["emotionIntensity"].is_null()) v.emotionIntensity = j["emotionIntensity"].get<double>();
}

void from_json(const nlohmann::json& j, BlockScreenshot& v) {
    j.at("src").get_to(v.src);
    if (j.contains("note") && !j["note"].is_null()) v.note = j["note"].get<std::string>();
}

void from_json(const nlohmann::json& j, BlockMetadata& v) {
    if (j.contains("color") && !j["color"].is_null()) v.color = j["color"].get<std::string>();
    if (j.contains("comments") && !j["comments"].is_null()) v.comments = j["comments"].get<std::string>();
    if (j.contains("tags")) v.tags = j["tags"].get<std::vector<std::string>>();
    if (j.contains("screenShots")) v.screenShots = j["screenShots"].get<std::vector<BlockScreenshot>>();
    if (j.contains("characters")) v.characters = j["characters"].get<std::vector<BlockCharacter>>();
}

void from_json(const nlohmann::json& j, BlueprintScene& v) {
    j.at("uuid").get_to(v.uuid);
    j.at("label").get_to(v.label);
    if (j.contains("note") && !j["note"].is_null()) v.note = j["note"].get<std::string>();
    if (j.contains("entryBlockId") && !j["entryBlockId"].is_null()) v.entryBlockId = j["entryBlockId"].get<std::string>();
    if (j.contains("date")) j.at("date").get_to(v.date);
    for (const auto& blockJson : j.at("blocks")) {
        v.blocks.push_back(parseBlock(blockJson));
    }
    v.connections = j.at("connections").get<std::vector<BlueprintConnection>>();
}

void from_json(const nlohmann::json& j, DictionaryRow& v) {
    j.at("key").get_to(v.key);
}

void from_json(const nlohmann::json& j, LsdeDictionary& v) {
    j.at("uuid").get_to(v.uuid);
    j.at("id").get_to(v.id);
    if (j.contains("rows")) v.rows = j["rows"].get<std::vector<DictionaryRow>>();
}

void from_json(const nlohmann::json& j, EnumOption& v) {
    j.at("id").get_to(v.id);
    if (j.contains("label") && !j["label"].is_null()) v.label = j["label"].get<std::string>();
}

void from_json(const nlohmann::json& j, SignatureParam& v) {
    if (j.contains("label") && !j["label"].is_null()) v.label = j["label"].get<std::string>();
    if (j.contains("type")) j.at("type").get_to(v.type);
    if (j.contains("dictionaryGroupUuid") && !j["dictionaryGroupUuid"].is_null())
        v.dictionaryGroupUuid = j["dictionaryGroupUuid"].get<std::string>();
    if (j.contains("enumOptions")) v.enumOptions = j["enumOptions"].get<std::vector<EnumOption>>();
}

void from_json(const nlohmann::json& j, ActionSignature& v) {
    j.at("uuid").get_to(v.uuid);
    j.at("id").get_to(v.id);
    if (j.contains("params")) v.params = j["params"].get<std::vector<SignatureParam>>();
}

void from_json(const nlohmann::json& j, BlueprintExport& v) {
    if (j.contains("version")) j.at("version").get_to(v.version);
    if (j.contains("exportDate")) j.at("exportDate").get_to(v.exportDate);
    if (j.contains("projectName") && !j["projectName"].is_null()) v.projectName = j["projectName"].get<std::string>();
    if (j.contains("primaryLanguage") && !j["primaryLanguage"].is_null()) v.primaryLanguage = j["primaryLanguage"].get<std::string>();
    if (j.contains("locales")) v.locales = j["locales"].get<std::vector<std::string>>();
    if (j.contains("dictionaries")) v.dictionaries = j["dictionaries"].get<std::vector<LsdeDictionary>>();
    if (j.contains("signatures")) v.signatures = j["signatures"].get<std::vector<ActionSignature>>();
    v.scenes = j.at("scenes").get<std::vector<BlueprintScene>>();
}

// ─── LsdeJson public API ────────────────────────────────────────────────────

BlueprintExport LsdeJson::parse(const std::string& json) {
    return nlohmann::json::parse(json).get<BlueprintExport>();
}

BlueprintExport LsdeJson::parseFile(const std::string& path) {
    std::ifstream f(path);
    return nlohmann::json::parse(f).get<BlueprintExport>();
}

} // namespace lsde

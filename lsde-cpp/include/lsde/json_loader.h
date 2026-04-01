/// @file json_loader.h
/// @brief Optional JSON loader for LSDE blueprints using nlohmann/json.
///
/// Requires nlohmann/json (header-only): https://github.com/nlohmann/json
/// This header is optional — the core lsde library has zero dependencies.
///
/// Usage:
/// @code
///   #include <lsde/json_loader.h>
///   auto blueprint = lsde::LsdeJson::parse(jsonString);
///   engine.init({blueprint});
/// @endcode

#pragma once

#include <lsde/types.h>
#include <nlohmann/json.hpp>
#include <string>

namespace lsde {

// ─── nlohmann/json ADL from_json declarations ───────────────────────────────

void from_json(const nlohmann::json& j, BlueprintConnection& v);
void from_json(const nlohmann::json& j, BlockProperty& v);
void from_json(const nlohmann::json& j, ExportCondition& v);
void from_json(const nlohmann::json& j, ExportAction& v);
void from_json(const nlohmann::json& j, ChoiceItem& v);
void from_json(const nlohmann::json& j, NativeProperties& v);
void from_json(const nlohmann::json& j, BlockCharacter& v);
void from_json(const nlohmann::json& j, BlockScreenshot& v);
void from_json(const nlohmann::json& j, BlockMetadata& v);
void from_json(const nlohmann::json& j, BlueprintScene& v);
void from_json(const nlohmann::json& j, DictionaryRow& v);
void from_json(const nlohmann::json& j, LsdeDictionary& v);
void from_json(const nlohmann::json& j, EnumOption& v);
void from_json(const nlohmann::json& j, SignatureParam& v);
void from_json(const nlohmann::json& j, ActionSignature& v);
void from_json(const nlohmann::json& j, BlueprintExport& v);

// ─── Public API ─────────────────────────────────────────────────────────────

/// JSON loader — parses a JSON string into a BlueprintExport.
class LsdeJson {
public:
    /// Parse a JSON string into a BlueprintExport.
    static BlueprintExport parse(const std::string& json);

    /// Parse a JSON file into a BlueprintExport.
    static BlueprintExport parseFile(const std::string& path);
};

} // namespace lsde

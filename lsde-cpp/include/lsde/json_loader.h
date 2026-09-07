/// @file json_loader.h
/// @brief Optional JSON loader for LSDE blueprints using nlohmann/json.
///
/// Requires nlohmann/json (header-only): https://github.com/nlohmann/json
/// This header is optional — the core lsde library has zero dependencies. A game that already has
/// a parser fills the structs itself and never includes this.
///
/// The polymorphic block reader is gone: v2 has ONE Block whose optional fields depend on its
/// `type`, so there is nothing left to dispatch on while reading.
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

void from_json(const nlohmann::json& j, Generator& v);
void from_json(const nlohmann::json& j, DictionaryDefinition& v);
void from_json(const nlohmann::json& j, FunctionParameter& v);
void from_json(const nlohmann::json& j, FunctionDefinition& v);
void from_json(const nlohmann::json& j, Card& v);
void from_json(const nlohmann::json& j, Link& v);
void from_json(const nlohmann::json& j, ActionCall& v);
void from_json(const nlohmann::json& j, ConditionTest& v);
void from_json(const nlohmann::json& j, ConditionCase& v);
void from_json(const nlohmann::json& j, Option& v);
void from_json(const nlohmann::json& j, BlueprintBlock& v);
void from_json(const nlohmann::json& j, BlueprintScene& v);
void from_json(const nlohmann::json& j, BlueprintExport& v);

/// Read one untyped value out of the payload's open bags — props, args, a condition's value.
///
/// Their KEYS and their types belong to the project, so the engine reads them and passes them on
/// without interpreting either. waitForBlocks is the one native holding a LIST rather than a
/// scalar, which is why an array is a value here too.
PropertyValue parsePropertyValue(const nlohmann::json& j);

/// JSON loader for LSDE blueprints.
class LsdeJson {
public:
    /// Parse a JSON string into a BlueprintExport.
    static BlueprintExport parse(const std::string& json);

    /// Parse a JSON file into a BlueprintExport.
    /// @throws std::runtime_error when the file cannot be opened.
    static BlueprintExport parseFile(const std::string& path);
};

} // namespace lsde

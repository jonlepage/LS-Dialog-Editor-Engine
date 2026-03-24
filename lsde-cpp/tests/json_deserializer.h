// JSON deserialization for all LSDE engine + test types using nlohmann/json

#pragma once

#include <lsde/types.h>
#include "test_models.h"
#include <nlohmann/json.hpp>

namespace lsde {

// Engine types
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

} // namespace lsde

namespace lsde::tests {

void from_json(const nlohmann::json& j, StateBridgeConfig& v);
void from_json(const nlohmann::json& j, StepExpect& v);
void from_json(const nlohmann::json& j, StepAction& v);
void from_json(const nlohmann::json& j, TestStep& v);
void from_json(const nlohmann::json& j, ExpectedStats& v);
void from_json(const nlohmann::json& j, TestCase& v);
void from_json(const nlohmann::json& j, TestSuite& v);
void from_json(const nlohmann::json& j, TestFile& v);

} // namespace lsde::tests

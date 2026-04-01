// JSON deserialization for all LSDE engine + test types using nlohmann/json

#pragma once

#include <lsde/json_loader.h>  // Engine types — public header
#include "test_models.h"

namespace lsde::tests {

// Test-only types
void from_json(const nlohmann::json& j, StateBridgeConfig& v);
void from_json(const nlohmann::json& j, StepExpect& v);
void from_json(const nlohmann::json& j, StepAction& v);
void from_json(const nlohmann::json& j, TestStep& v);
void from_json(const nlohmann::json& j, ExpectedStats& v);
void from_json(const nlohmann::json& j, TestCase& v);
void from_json(const nlohmann::json& j, TestSuite& v);
void from_json(const nlohmann::json& j, TestFile& v);

} // namespace lsde::tests

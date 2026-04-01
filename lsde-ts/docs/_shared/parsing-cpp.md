::: code-group
```cpp [JSON — lsde/json_loader.h]
// Include the optional JSON loader (requires nlohmann/json)
#include <lsde/json_loader.h>

auto blueprint = lsde::LsdeJson::parseFile("blueprint.json");
// or from string:
// auto blueprint = lsde::LsdeJson::parse(jsonString);
engine.init({blueprint});
```
```cpp [JSON — manual nlohmann/json]
// Without json_loader.h — manual polymorphic dispatch
#include <nlohmann/json.hpp>
#include <lsde/engine.h>

std::ifstream f("blueprint.json");
auto j = nlohmann::json::parse(f);
auto blueprint = j.get<lsde::BlueprintExport>();
// Requires custom from_json — see polymorphic dispatch below.
```
```cpp [XML — tinyxml2]
#include <tinyxml2.h>
tinyxml2::XMLDocument doc;
doc.LoadFile("blueprint.xml");
// Walk XML elements → map to BlueprintExport.
```
```cpp [YAML — yaml-cpp]
// Install: apt install libyaml-cpp-dev (or include source)
#include <yaml-cpp/yaml.h>
auto node = YAML::LoadFile("blueprint.yaml");
// Requires custom YAML::convert specializations.
```
:::

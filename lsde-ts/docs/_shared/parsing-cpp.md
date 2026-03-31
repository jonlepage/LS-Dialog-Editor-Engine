::: code-group
```cpp [JSON — nlohmann/json]
// Header-only: #include <nlohmann/json.hpp>
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

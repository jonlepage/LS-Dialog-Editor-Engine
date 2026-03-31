::: code-group
```cpp [JSON — FJsonSerializer (native)]
#include "Json.h"
#include <lsde/engine.h>

FString JsonStr;
FFileHelper::LoadFileToString(JsonStr, TEXT("blueprint.json"));

TSharedPtr<FJsonObject> JsonObject;
auto Reader = TJsonReaderFactory<>::Create(JsonStr);
FJsonSerializer::Deserialize(Reader, JsonObject);

// Map FJsonObject → BlueprintExport manually.
// Dispatch on block "type" field for polymorphism.
```
```cpp [XML — XmlParser (native)]
#include "XmlParser.h"

FXmlFile XmlFile(TEXT("blueprint.xml"));
auto* Root = XmlFile.GetRootNode();
// Walk XML nodes → map to BlueprintExport.
```
:::

::: code-group
```csharp [JSON — System.Text.Json (.NET 5+)]
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

var json = File.ReadAllText("blueprint.json");
var options = new JsonSerializerOptions {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = {
        new JsonStringEnumConverter(),
        new BlueprintBlockConverter(),       // see below
        new BlockPropertyValueConverter(),   // see below
    },
};
var blueprint = JsonSerializer.Deserialize<BlueprintExport>(json, options);
engine.Init(new InitOptions { Data = blueprint });
```
```csharp [XML — System.Xml (native)]
// System.Xml is included in .NET — nothing to install.
using System.Xml.Linq;
using LsdeDialogEngine;

var doc = XDocument.Load("blueprint.xml");
// Manual mapping from XElement → BlueprintExport required.
```
```csharp [YAML — YamlDotNet]
// dotnet add package YamlDotNet
using YamlDotNet.Serialization;
using LsdeDialogEngine;

var yaml = File.ReadAllText("blueprint.yaml");
var deserializer = new DeserializerBuilder().Build();
// YamlDotNet requires custom type converters for polymorphic blocks.
```
:::

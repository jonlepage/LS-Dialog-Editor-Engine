::: code-group
```csharp [JSON — LsdeDialogEngine.SystemTextJson]
// Install: dotnet add package LsdeDialogEngine.SystemTextJson
using LsdeDialogEngine;
using LsdeDialogEngine.Json;

var json = File.ReadAllText("blueprint.json");
var blueprint = LsdeJson.Parse(json);
engine.Init(new InitOptions { Data = blueprint });
```
```csharp [JSON — manual System.Text.Json]
// Without companion package — manual converter setup
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

var json = File.ReadAllText("blueprint.json");
var options = new JsonSerializerOptions {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = {
        new JsonStringEnumConverter(),
        new BlueprintBlockConverter(),       // see Polymorphic Dispatch
        new BlockPropertyValueConverter(),
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

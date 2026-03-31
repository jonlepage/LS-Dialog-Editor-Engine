::: code-group
```csharp [JSON — Newtonsoft]
// Install via Unity Package Manager: com.unity.nuget.newtonsoft-json
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using LsdeDialogEngine;

var json = File.ReadAllText("blueprint.json");
var settings = new JsonSerializerSettings();
settings.Converters.Add(new BlueprintBlockNewtonsoftConverter());
var blueprint = JsonConvert.DeserializeObject<BlueprintExport>(json, settings);

engine.Init(new InitOptions { Data = blueprint });
```
```csharp [XML — System.Xml]
// System.Xml is native — nothing to install
using System.Xml.Linq;
using LsdeDialogEngine;

var doc = XDocument.Load("blueprint.xml");
// Manual mapping from XElement → BlueprintExport required.
// See polymorphic dispatch section below for BlueprintBlock handling.
```
:::

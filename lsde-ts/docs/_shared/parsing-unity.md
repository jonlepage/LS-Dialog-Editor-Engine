::: code-group
```csharp [JSON — LsdeDialogEngine.Newtonsoft]
// Install: dotnet add package LsdeDialogEngine.Newtonsoft
// Unity Package Manager: com.unity.nuget.newtonsoft-json (auto-pulled)
using LsdeDialogEngine;
using LsdeDialogEngine.Newtonsoft;

var json = File.ReadAllText("blueprint.json");
var blueprint = LsdeJson.Parse(json);
engine.Init(new InitOptions { Data = blueprint });
```
```csharp [JSON — manual Newtonsoft]
// Without companion package — manual converter setup
using Newtonsoft.Json;
using LsdeDialogEngine;

var json = File.ReadAllText("blueprint.json");
var settings = new JsonSerializerSettings();
settings.Converters.Add(new BlueprintBlockNewtonsoftConverter()); // see Polymorphic Dispatch
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

| Platform | JSON | XML | YAML |
|---|---|---|---|
| **Unity** | [Newtonsoft.Json](https://docs.unity3d.com/Packages/com.unity.nuget.newtonsoft-json@3.0/) (`com.unity.nuget.newtonsoft-json`) | `System.Xml` (native) | not recommended |
| **Unreal Engine** | `FJsonSerializer` (native module `Json`) | `XmlParser` (native) | [UnrealYAML](https://github.com/jwindgassen/UnrealYAML) (marketplace) |
| **Godot** | `JSON.parse_string()` (native) | `XMLParser` (native) | [godot-yaml](https://github.com/fimbul-works/godot-yaml) (GDExtension) |
| **TypeScript** | `JSON.parse()` (native) | [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser) | [yaml](https://www.npmjs.com/package/yaml) |
| **CSharp** | `System.Text.Json` (.NET 5+) / `Newtonsoft.Json` | `System.Xml` (native) | [YamlDotNet](https://github.com/aaubry/YamlDotNet) |
| **CPP** | [nlohmann/json](https://github.com/nlohmann/json) (header-only) | [tinyxml2](https://github.com/leethomason/tinyxml2) / [pugixml](https://github.com/zeux/pugixml) | [yaml-cpp](https://github.com/jbeder/yaml-cpp) |

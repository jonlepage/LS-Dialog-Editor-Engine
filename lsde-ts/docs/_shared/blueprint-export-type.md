::: code-group
```ts [TypeScript]
interface BlueprintExport {
  version: string;
  exportDate: string;
  projectName?: string;
  primaryLanguage?: string;
  locales: string[];
  dictionaries?: Dictionary[];
  signatures?: ActionSignature[];
  scenes: BlueprintScene[];
}
```
```csharp [C#]
public class BlueprintExport {
    public string Version { get; set; }
    public string ExportDate { get; set; }
    public string? ProjectName { get; set; }
    public string? PrimaryLanguage { get; set; }
    public List<string> Locales { get; set; }
    public List<Dictionary>? Dictionaries { get; set; }
    public List<ActionSignature>? Signatures { get; set; }
    public List<BlueprintScene> Scenes { get; set; }
}
```
```cpp [C++]
struct BlueprintExport {
    std::string version;
    std::string exportDate;
    std::optional<std::string> projectName;
    std::optional<std::string> primaryLanguage;
    std::vector<std::string> locales;
    std::vector<LsdeDictionary> dictionaries;
    std::vector<ActionSignature> signatures;
    std::vector<BlueprintScene> scenes;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "version": String
# "exportDate": String
# "projectName": String (optional)
# "primaryLanguage": String (optional)
# "locales": Array[String]
# "dictionaries": Array[Dictionary] (optional)
# "signatures": Array[Dictionary] (optional)
# "scenes": Array[Dictionary]
```
:::

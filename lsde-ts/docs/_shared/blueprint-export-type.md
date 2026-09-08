::: code-group
```ts [TypeScript]
interface BlueprintExport {
  format: "lsde-blueprints";       // anything else is refused outright
  version: 1;                      // the FORMAT version, not the editor's
  generator: Generator;            // which software wrote the file
  exportedAt: string;              // ISO 8601
  project: string;
  locales: string[];
  referenceLocale: string;         // the locale written first
  dictionaries: DictionaryDefinition[];
  functions: FunctionDefinition[];
  cards: Card[];                   // what a block's `actors` and `emotion` cite
  scenes: BlueprintScene[];
}
```
```csharp [C#]
public class BlueprintExport {
    public string Format { get; set; }              // "lsde-blueprints"
    public int Version { get; set; }                // 1
    public Generator? Generator { get; set; }
    public string ExportedAt { get; set; }
    public string Project { get; set; }
    public List<string> Locales { get; set; }
    public string ReferenceLocale { get; set; }
    public List<DictionaryDefinition> Dictionaries { get; set; }
    public List<FunctionDefinition> Functions { get; set; }
    public List<Card> Cards { get; set; }
    public List<BlueprintScene> Scenes { get; set; }
}
```
```cpp [C++]
struct BlueprintExport {
    std::string format;                          // "lsde-blueprints"
    int version = 0;                             // 1
    Generator generator;
    std::string exportedAt;
    std::string project;
    std::vector<std::string> locales;
    std::string referenceLocale;
    std::vector<DictionaryDefinition> dictionaries;
    std::vector<FunctionDefinition> functions;
    std::vector<Card> cards;
    std::vector<BlueprintScene> scenes;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "format":          String  — always "lsde-blueprints"
# "version":         int     — the FORMAT version, 1
# "generator":       Dictionary
# "exportedAt":      String  — ISO 8601
# "project":         String
# "locales":         Array[String]
# "referenceLocale": String
# "dictionaries":    Array[Dictionary]
# "functions":       Array[Dictionary]
# "cards":           Array[Dictionary]
# "scenes":          Array[Dictionary]
```
:::

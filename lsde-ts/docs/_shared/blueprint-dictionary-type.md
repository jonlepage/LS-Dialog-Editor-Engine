::: code-group
```ts [TypeScript]
interface DictionaryDefinition {
  id: string;                                  // what a ConditionTest.dict cites
  valueType: 'boolean' | 'number' | 'string';  // what its entries hold
  entries: string[];                           // the entry names, flat
}
```
```csharp [C#]
public class DictionaryDefinition {
    public string Id { get; set; }
    public string ValueType { get; set; }      // "boolean" | "number" | "string"
    public List<string> Entries { get; set; }
}
```
```cpp [C++]
struct DictionaryDefinition {
    std::string id;
    std::string valueType;                     // "boolean" | "number" | "string"
    std::vector<std::string> entries;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "id": String
# "valueType": "boolean" | "number" | "string"
# "entries": Array[String]
```
:::

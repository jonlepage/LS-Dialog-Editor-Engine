::: code-group
```ts [TypeScript]
interface Dictionary {
  uuid: string;
  id: string;
  rows: DictionaryRow[];
}

interface DictionaryRow {
  key: string;
}
```
```csharp [C#]
public class LsdeDictionary {
    public string Uuid { get; set; }
    public string Id { get; set; }
    public List<DictionaryRow> Rows { get; set; }
}

public class DictionaryRow {
    public string Key { get; set; }
}
```
```cpp [C++]
struct LsdeDictionary {
    std::string uuid;
    std::string id;
    std::vector<DictionaryRow> rows;
};

struct DictionaryRow {
    std::string key;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "uuid": String
# "id": String
# "rows": Array[{"key": String}]
```
:::

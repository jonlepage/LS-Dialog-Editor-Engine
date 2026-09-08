::: code-group
```ts [TypeScript]
interface FunctionDefinition {
  id: string;                  // what an ActionCall.fn names
  params: FunctionParameter[];
}

interface FunctionParameter {
  name: string;                // ActionCall.args is keyed BY NAME, never by position
  type: ValueType;             // 'boolean' | 'number' | 'string' | 'dictionary'
  dictionary?: string;         // for type 'dictionary': the DictionaryDefinition.id it draws from
}
```
```csharp [C#]
public class FunctionDefinition {
    public string Id { get; set; }
    public List<FunctionParameter> Params { get; set; }
}

public class FunctionParameter {
    public string Name { get; set; }
    public string Type { get; set; }
    public string? Dictionary { get; set; }
}
```
```cpp [C++]
struct FunctionDefinition {
    std::string id;
    std::vector<FunctionParameter> params;
};

struct FunctionParameter {
    std::string name;
    std::string type;
    std::optional<std::string> dictionary;
};
```
```gdscript [GDScript]
# FunctionDefinition Dictionary:
# "id": String
# "params": Array[FunctionParameter]
#
# FunctionParameter Dictionary:
# "name": String   — args are keyed BY NAME, never by position
# "type": "boolean" | "number" | "string" | "dictionary"
# "dictionary": String (optional) — for type "dictionary", the DictionaryDefinition id
```
:::

::: code-group
```ts [TypeScript]
interface ActionSignature {
  uuid: string;
  id: string;
  params: SignatureParam[];
}

interface SignatureParam {
  label?: string;
  type: 'boolean' | 'string' | 'number' | 'enum' | 'dictionary';
  dictionaryGroupUuid?: string;
  enumOptions?: { id: string; label?: string }[];
}
```
```csharp [C#]
public class ActionSignature {
    public string Uuid { get; set; }
    public string Id { get; set; }
    public List<SignatureParam> Params { get; set; }
}

public class SignatureParam {
    public string? Label { get; set; }
    public string Type { get; set; }
    public string? DictionaryGroupUuid { get; set; }
    public List<EnumOption>? EnumOptions { get; set; }
}
```
```cpp [C++]
struct ActionSignature {
    std::string uuid;
    std::string id;
    std::vector<SignatureParam> params;
};

struct SignatureParam {
    std::optional<std::string> label;
    std::string type;
    std::optional<std::string> dictionaryGroupUuid;
    std::vector<EnumOption> enumOptions;
};
```
```gdscript [GDScript]
# ActionSignature Dictionary:
# "uuid": String
# "id": String
# "params": Array[SignatureParam]
#
# SignatureParam Dictionary:
# "label": String (optional)
# "type": "boolean" | "string" | "number" | "enum" | "dictionary"
# "dictionaryGroupUuid": String (optional)
# "enumOptions": Array[{"id": String, "label": String?}] (optional)
```
:::

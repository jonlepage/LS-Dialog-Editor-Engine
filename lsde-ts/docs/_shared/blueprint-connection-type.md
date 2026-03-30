::: code-group
```ts [TypeScript]
interface BlueprintConnection {
  id: string;
  fromId: string;
  toId: string;
  fromPort: string;
  toPort: string;
  fromPortIndex?: number;
}
```
```csharp [C#]
public class BlueprintConnection {
    public string Id { get; set; }
    public string FromId { get; set; }
    public string ToId { get; set; }
    public string FromPort { get; set; }
    public string ToPort { get; set; }
    public int? FromPortIndex { get; set; }
}
```
```cpp [C++]
struct BlueprintConnection {
    std::string id;
    std::string fromId;
    std::string toId;
    std::string fromPort;
    std::string toPort;
    std::optional<int> fromPortIndex;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "id": String
# "fromId": String
# "toId": String
# "fromPort": String
# "toPort": String
# "fromPortIndex": int (optional)
```
:::

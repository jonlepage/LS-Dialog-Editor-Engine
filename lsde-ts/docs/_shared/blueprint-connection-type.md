::: code-group
```ts [TypeScript]
interface BlueprintConnection {
  id: string;
  from: string;
  to: string;
  port: string;
  toPort: string;
  port?: number;
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
    std::string from;
    std::string to;
    std::string port;
    std::string toPort;
    std::optional<int> port;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "id": String
# "from": String
# "to": String
# "port": String
# "toPort": String
# "port": int (optional)
```
:::

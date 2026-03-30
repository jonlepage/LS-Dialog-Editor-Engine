::: code-group
```ts [TypeScript]
interface BlueprintScene {
  uuid: string;
  label: string;
  note?: string;
  entryBlockId?: string;
  date: string;
  blocks: BlueprintBlock[];
  connections: BlueprintConnection[];
}
```
```csharp [C#]
public class BlueprintScene {
    public string Uuid { get; set; }
    public string Label { get; set; }
    public string? Note { get; set; }
    public string? EntryBlockId { get; set; }
    public string Date { get; set; }
    public List<BlueprintBlock> Blocks { get; set; }
    public List<BlueprintConnection> Connections { get; set; }
}
```
```cpp [C++]
struct BlueprintScene {
    std::string uuid;
    std::string label;
    std::optional<std::string> note;
    std::optional<std::string> entryBlockId;
    std::string date;
    std::vector<BlueprintBlock> blocks;
    std::vector<BlueprintConnection> connections;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "uuid": String
# "label": String
# "note": String (optional)
# "entryBlockId": String (optional)
# "date": String
# "blocks": Array[Dictionary]
# "connections": Array[Dictionary]
```
:::

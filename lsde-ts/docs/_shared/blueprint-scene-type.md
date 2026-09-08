::: code-group
```ts [TypeScript]
interface Scene {
  scene: string;        // the path — reactor_breach. Builds the i18n keys; changes on a rename.
  id: string;           // the stable id — sc_u0vqg2g8. Store THIS outside the payload.
  label?: string;
  start?: string;       // the id of the entry block. The scene names it; blocks carry no flag.
  blocks: Block[];      // wires live on each block, in block.next. There is no connection table.
}
```
```csharp [C#]
public class BlueprintScene {
    public string Scene { get; set; }        // the path — reactor_breach
    public string Id { get; set; }           // the stable id — sc_u0vqg2g8
    public string? Label { get; set; }
    public string? Start { get; set; }       // the id of the entry block
    public List<BlueprintBlock> Blocks { get; set; }
}
```
```cpp [C++]
struct BlueprintScene {
    std::string scene;                       // the path — reactor_breach
    std::string id;                          // the stable id — sc_u0vqg2g8
    std::optional<std::string> label;
    std::optional<std::string> start;        // the id of the entry block
    std::vector<BlueprintBlock> blocks;
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "scene": String        — the path, reactor_breach
# "id": String           — the stable id, sc_u0vqg2g8
# "label": String (optional)
# "start": String (optional) — the id of the entry block
# "blocks": Array[Dictionary] — wires live on each block, in block["next"]
```
:::

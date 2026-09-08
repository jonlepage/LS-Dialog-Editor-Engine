::: code-group
```ts [TypeScript]
// A Link, plus the block it leaves. `Link` is what the payload carries, on block.next.
type BlueprintConnection = Link & { from: string };

interface Link {
  port: string;    // the exit port NAME: out, then, catch, default, C1, K1, or a card id
  to: string;      // the id of the target block, IN THE SAME SCENE
  toPort: string;  // always "in"
}
```
```csharp [C#]
public class BlueprintConnection {
    public string From { get; set; }    // the id of the block this wire leaves
    public string Port { get; set; }    // the exit port NAME
    public string To { get; set; }      // the id of the target block, in the same scene
    public string ToPort { get; set; }  // always "in"
}
```
```cpp [C++]
struct BlueprintConnection {
    std::string from;             // the id of the block this wire leaves
    std::string port;             // the exit port NAME
    std::string to;               // the id of the target block, in the same scene
    std::string toPort = "in";
};
```
```gdscript [GDScript]
# Dictionary with keys:
# "from": String    — the id of the block this wire leaves
# "port": String    — the exit port NAME: out, then, catch, default, C1, K1, or a card id
# "to": String      — the id of the target block, in the same scene
# "toPort": String  — always "in"
```
:::

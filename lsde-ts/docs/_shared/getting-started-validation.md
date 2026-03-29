::: code-group
```ts [TypeScript]
engine.init({
  data,
  check: {
    signatures: ['set_flag', 'play_sound'],
    dictionaries: { items: ['sword', 'shield'] },
    characters: ['Alice', 'Bob'],
  },
});
```
```csharp [C#]
engine.Init(new InitOptions {
    Data = blueprint,
    Check = new CheckOptions {
        Signatures = new() { "set_flag", "play_sound" },
        Characters = new() { "Alice", "Bob" },
    },
});
```
```cpp [C++]
engine.init({blueprint, CheckOptions{
    {"set_flag", "play_sound"},  // signatures
    {},                           // dictionaries
    {"Alice", "Bob"},             // characters
}});
```
```gdscript [GDScript]
engine.init({
    "data": blueprint,
    "check": {
        "signatures": ["set_flag", "play_sound"],
        "characters": ["Alice", "Bob"],
    },
})
```
:::

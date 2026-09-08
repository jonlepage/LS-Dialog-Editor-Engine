::: code-group
```ts [TypeScript]
engine.init({
  data,
  check: {
    functions: ['set_flag', 'play_sound'],          // function ids your game implements
    dictionaries: { items: ['sword', 'shield'] },   // dictionary ids and their entry keys
    cards: ['Alice', 'Bob'],                        // card NAMES, never the editor id
  },
});
```
```csharp [C#]
engine.Init(new InitOptions {
    Data = blueprint,
    Check = new CheckOptions {
        Functions = new() { "set_flag", "play_sound" },
        Dictionaries = new() { ["items"] = new() { "sword", "shield" } },
        Cards = new() { "Alice", "Bob" },
    },
});
```
```cpp [C++]
lsde::CheckOptions check;
check.functions = {"set_flag", "play_sound"};
check.dictionaries = {{"items", {"sword", "shield"}}};
check.cards = {"Alice", "Bob"};

engine.init({blueprint, check});
```
```gdscript [GDScript]
engine.init({
    "data": blueprint,
    "check": {
        "functions": ["set_flag", "play_sound"],
        "dictionaries": {"items": ["sword", "shield"]},
        "cards": ["Alice", "Bob"],
    },
})
```
:::

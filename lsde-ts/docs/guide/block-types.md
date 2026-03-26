# Block Types

The engine supports 5 block types. Each has a dedicated handler and a type-specific context.

All 4 content block handlers (`onDialog`, `onChoice`, `onCondition`, `onAction`) are **required** — the engine validates their presence when you call `start()`.

## DIALOG

Displays text spoken by a character. The character is resolved by the `onResolveCharacter` callback.

::: code-group
```ts [TypeScript]
engine.onDialog(({ block, context, next }) => {
  const char = context.character;  // BlockCharacter | undefined
  const text = LsdeUtils.getLocalizedText(block.dialogueText);

  showDialogUI(char?.name, text);

  // If portPerCharacter is enabled:
  if (block.nativeProperties?.portPerCharacter && char) {
    context.resolveCharacterPort(char.uuid);
  }
  next();
});
```
```csharp [C#]
engine.OnDialog(args => {
    var ch = args.Context.Character;
    var text = LsdeUtils.GetLocalizedText(args.Block.DialogueText);

    ShowDialogUI(ch?.Name, text);

    if (args.Block.NativeProperties?.PortPerCharacter == true && ch != null)
        args.Context.ResolveCharacterPort(ch.Uuid);
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onDialog([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ch = ctx->character();
    auto text = LsdeUtils::GetLocalizedText(block->dialogueText);

    showDialogUI(ch ? ch->name : "", text.value_or(""));

    if (block->nativeProperties && block->nativeProperties->portPerCharacter
        && *block->nativeProperties->portPerCharacter && ch) {
        ctx->resolveCharacterPort(ch->uuid);
    }
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    var ch = args["context"].character
    var text = LsdeUtils.get_localized_text(args["block"].get("dialogueText"))

    show_dialog_ui(ch.get("name", "") if ch else "", text)

    var np = args["block"].get("nativeProperties")
    if np is Dictionary and np.get("portPerCharacter", false) and ch:
        args["context"].resolve_character_port(ch.get("uuid", ""))
    args["next"].call()
    return Callable()
)
```
:::

`resolveCharacterPort()` matches by character **UUID first**, then by **name** as fallback.

## CHOICE

Presents selectable options to the player. When [`setChoiceFilter()`](/guide/choice-visibility) is configured, each choice is tagged with `visible: true | false`.

::: code-group
```ts [TypeScript]
engine.onChoice(({ block, context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);

  showChoicesUI(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false).ToList();

    ShowChoicesUI(visible, uuid => {
        args.Context.SelectChoice(uuid);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    showChoicesUI(visible, [ctx, next](auto& uuid) {
        ctx->selectChoice(uuid);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].choices:
        if c.get("visible") != false:
            visible.append(c)

    show_choices_ui(visible, func(uuid):
        args["context"].select_choice(uuid)
        args["next"].call()
    )
    return Callable()
)
```
:::

See [Choice Visibility](/guide/choice-visibility) for the full opt-in tagging system.

## CONDITION

Evaluates logic to branch the flow. The handler **must** call `resolve(result)` — `true` follows port index 0, `false` follows port index 1.

::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)
      : gameState.check(cond.key, cond.operator, cond.value),
  );
  context.resolve(result);
  next();
});
```
```csharp [C#]
engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Check(cond.Key, cond.Operator, cond.Value)
    );
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onCondition([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene](const auto& cond) {
            return isChoiceCondition(cond)
                ? scene->evaluateCondition(cond)
                : gameState.check(cond.key, cond.op, cond.value);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return game_state.check(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::

::: tip choice: conditions
Conditions with keys starting with `choice:` reference a previous player selection. Use `scene.evaluateCondition(cond)` to resolve them — the engine checks its internal choice history automatically.
:::

## ACTION

Triggers game state changes. Call `resolve()` for success or `reject(error)` for failure.

::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  for (const action of block.actions ?? []) {
    gameState.execute(action.actionId, action.params);
  }
  context.resolve();   // → "then" port
  // or context.reject(err); → "catch" port (fallback "then" if no catch exists)
  next();
});
```
```csharp [C#]
engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
        GameState.Execute(action.ActionId, action.Params);
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onAction([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ab = dynamic_cast<const ActionBlock*>(block);
    for (const auto& a : ab->actions)
        gameState.execute(a.actionId, a.params);
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        game_state.execute(action)
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::

## NOTE

Documentation block for the designer. Never executed — automatically skipped during traversal.

## Common Properties

All blocks share these base fields:

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Unique identifier |
| `type` | `BlockType` | Discriminant type |
| `label` | `string?` | Human-readable name |
| `properties` | `BlockProperty[]` | Key-value properties |
| `userProperties` | `Record?` | Free-form user properties |
| `nativeProperties` | `NativeProperties?` | Execution properties (async, delay, etc.) |
| `metadata` | `BlockMetadata?` | Display metadata (characters, tags, color) |
| `isStartBlock` | `boolean?` | Marks the entry block |

### NativeProperties

| Field | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | Execute on a parallel async track |
| `delay` | `number?` | Delay before execution (consumed by `onBeforeBlock`) |
| `timeout` | `number?` | Execution timeout |
| `portPerCharacter` | `boolean?` | One output port per character in metadata |
| `followNarrative` | `boolean?` | Async track follows main narrative pace |

# Block 类型

engine 支持 5 种 block 类型。每种类型都有专用的 handler 和特定类型的 context。

所有 4 个内容 block handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）都是**必需的** — engine 在调用 `start()` 时会验证它们是否已注册。

## DIALOG

显示角色所说的文本。角色由 `onResolveCharacter` callback 解析。

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

`resolveCharacterPort()` 先按角色 **UUID** 匹配，然后以**名称**作为回退。

## CHOICE

向玩家呈现可选选项。当配置了 [`setChoiceFilter()`](/zh/guide/choice-visibility) 时，每个 choice 会被标记为 `visible: true | false`。

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

参见 [Choice 可见性](/zh/guide/choice-visibility) 了解完整的可选标记系统。

## CONDITION

评估逻辑以分支流程。handler **必须**调用 `resolve(result)` — `true` 走 port index 0，`false` 走 port index 1。

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

::: tip choice: condition
以 `choice:` 开头的 key 的 condition 引用了之前的玩家选择。使用 `scene.evaluateCondition(cond)` 来解析它们 — engine 会自动检查其内部的选择历史记录。
:::

## ACTION

触发游戏状态变更。调用 `resolve()` 表示成功，或调用 `reject(error)` 表示失败。

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

设计师使用的文档 block。不会被执行 — 在遍历过程中自动跳过。

## 通用属性

所有 block 共享以下基础字段：

| 字段 | 类型 | 描述 |
|------|------|------|
| `uuid` | `string` | 唯一标识符 |
| `type` | `BlockType` | 判别类型 |
| `label` | `string?` | 人类可读的名称 |
| `properties` | `BlockProperty[]` | 键值属性 |
| `userProperties` | `Record?` | 自由格式的用户属性 |
| `nativeProperties` | `NativeProperties?` | 执行属性（async、delay 等） |
| `metadata` | `BlockMetadata?` | 显示元数据（角色、标签、颜色） |
| `isStartBlock` | `boolean?` | 标记入口 block |

### NativeProperties

| 字段 | 类型 | 描述 |
|------|------|------|
| `isAsync` | `boolean?` | 在并行异步轨道上执行 |
| `delay` | `number?` | 执行前的延迟（由 `onBeforeBlock` 消费） |
| `timeout` | `number?` | 执行超时时间 |
| `portPerCharacter` | `boolean?` | metadata 中每个角色对应一个输出 port |
| `followNarrative` | `boolean?` | 异步轨道跟随主叙事节奏 |

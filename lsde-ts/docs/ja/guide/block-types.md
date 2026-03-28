# Block タイプ

engine は5つの block タイプをサポートしています。それぞれに専用の handler とタイプ固有の context があります。

4つのコンテンツ block handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）は**必須**です — `start()` を呼び出す際に engine がそれらの存在を検証します。

## DIALOG

キャラクターが話すテキストを表示します。キャラクターは `onResolveCharacter` callback によって解決されます。

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

`resolveCharacterPort()` はキャラクターの **UUID を最優先**で照合し、次に**名前**をフォールバックとして使用します。

## CHOICE

プレイヤーに選択肢を提示します。[`setChoiceFilter()`](/ja/guide/choice-visibility) が設定されている場合、各 choice は `visible: true | false` でタグ付けされます。

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

完全なオプトイン方式のタグ付けシステムについては [Choice の表示制御](/ja/guide/choice-visibility) を参照してください。

## CONDITION

ロジックを評価してフローを分岐させます。handler は**必ず** `resolve(result)` を呼び出す必要があります — `true` は port index 0 に、`false` は port index 1 に従います。

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

::: tip choice: condition について
`choice:` で始まるキーを持つ condition は、以前のプレイヤー選択を参照しています。`scene.evaluateCondition(cond)` を使って解決してください — engine が内部の choice 履歴を自動的にチェックします。
:::

## ACTION

ゲームステートの変更をトリガーします。成功の場合は `resolve()` を、失敗の場合は `reject(error)` を呼び出します。

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

デザイナー向けのドキュメンテーション block です。実行されることはなく、走査中は自動的にスキップされます。

## 共通プロパティ

すべての block は以下の基本フィールドを共有します：

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `uuid` | `string` | 一意識別子 |
| `type` | `BlockType` | 判別タイプ |
| `label` | `string?` | 人間可読な名前 |
| `properties` | `BlockProperty[]` | キー・バリュープロパティ |
| `userProperties` | `Record?` | 自由形式のユーザープロパティ |
| `nativeProperties` | `NativeProperties?` | 実行プロパティ（async、delay など） |
| `metadata` | `BlockMetadata?` | 表示メタデータ（キャラクター、タグ、カラー） |
| `isStartBlock` | `boolean?` | エントリー block を示す |

### NativeProperties

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `isAsync` | `boolean?` | 並列 async トラックで実行 |
| `delay` | `number?` | 実行前の遅延（`onBeforeBlock` で処理） |
| `timeout` | `number?` | 実行タイムアウト |
| `portPerCharacter` | `boolean?` | metadata 内のキャラクターごとに1つの出力 port |
| `skipIfMissingActor` | `boolean?` | 参照アクターが不在の場合 block をスキップ |
| `debug` | `boolean?` | エディタ用デバッグフラグ |
| `waitForBlocks` | `string[]?` | この block が進行する前に訪問済みでなければならない block UUID |
| `waitInput` | `boolean?` | プレイヤー入力制御用パッシブフラグ |

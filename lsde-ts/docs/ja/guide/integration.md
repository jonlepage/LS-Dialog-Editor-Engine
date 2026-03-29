# ゲームエンジン統合

LSDE engine は純粋なグラフ走査マシンです — ノードを辿り handler を呼び出します。**handler が engine とゲーム側の橋渡し役です。** このページでは、実際のゲームエンジンへの接続方法を示します。

## パターン

すべての統合は同じ3ステップのダンスに従います：

1. **初期化** — engine に blueprint JSON を読み込ませる
2. **接続** — 4つの handler をゲームシステム（UI、ステート、オーディオ...）に接続する
3. **開始** — engine が handler を呼び出し、ゲーム側で処理を実行する

engine は UI やステート、オーディオに一切触れません。何が*起きたか*を伝えるだけです。*どう*反応するかはホストアプリケーション側の責務です。舞台演出を読み上げる演出家のようなもの — ゲームがキャスト、クルー、舞台そのものです。

## 対話の表示

最もシンプルな handler — テキストを表示し、プレイヤーの続行を待ちます。

::: code-group
```ts [TypeScript]
// The engine says "show this text". You decide where, how, and when to move on.
engine.onDialog(({ block, context, next }) => {
  const text = LsdeUtils.getLocalizedText(block.dialogueText);
  const char = context.character;

  const el = document.getElementById('dialog')!;
  el.innerHTML = `<strong>${char?.name ?? ''}</strong>: ${text ?? ''}`;
  el.style.display = 'block';

  // Player clicks → flow continues. Your pace, your rules.
  const handler = () => { next(); el.removeEventListener('click', handler); };
  el.addEventListener('click', handler);

  // Cleanup: hide when the next block takes over
  return () => { el.style.display = 'none'; };
});
```
```csharp [C# — Unity]
// Drag your UI references in the Inspector, wire the rest in code.
engine.OnDialog(args => {
    var text = LsdeUtils.GetLocalizedText(args.Block.DialogueText);
    var ch = args.Context.Character;

    dialogText.text = $"{ch?.Name ?? ""}: {text ?? "—"}";
    dialogText.gameObject.SetActive(true);

    // Store next() — call it when the player clicks the "continue" button.
    pendingNext = args.Next;

    // Cleanup: hide the dialog panel
    return () => dialogText.gameObject.SetActive(false);
});

// Somewhere in your UI button handler:
public void OnContinueClick() {
    pendingNext?.Invoke();
    pendingNext = null;
}
```
```cpp [C++ — Unreal]
// UMG widget does the heavy lifting. The engine just says "go".
engine.onDialog([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto text = lsde::LsdeUtils::GetLocalizedText(block->dialogueText);
    auto* ch = ctx->character();

    DialogWidget->SetText(FString(ch ? ch->name.c_str() : ""),
                          FString(text.value_or("").c_str()));
    DialogWidget->SetVisibility(ESlateVisibility::Visible);

    // Store next — triggered by a UI button delegate
    PendingNext = std::move(next);

    return [this]() { DialogWidget->SetVisibility(ESlateVisibility::Collapsed); };
});
```
```gdscript [GDScript — Godot]
# BBCode in RichTextLabel? Fancy. The engine doesn't judge.
engine.on_dialog(func(args):
    var text = LsdeUtils.get_localized_text(args["block"].get("dialogueText"))
    var ch = args["context"].character
    dialog_label.text = "[b]%s:[/b] %s" % [ch.get("name", "") if ch else "", text]
    dialog_label.visible = true

    # Wait for player input — your signal, your timer, your call
    await player_clicked  # or await get_tree().create_timer(2.0).timeout
    args["next"].call()

    return func(): dialog_label.visible = false
)
```
:::

::: tip next() はリモコンです
即座に `next()` を呼び出して高速対話を実現するか、保存して後から呼び出します — アニメーション後、タイマー後、プレイヤーのクリック後...ゲームに合ったタイミングで。engine は辛抱強く待ちます。
:::

## 選択肢の表示

UI 要素を動的に生成し、プレイヤーに選ばせ、選択された結果を engine に伝えます。

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  const panel = document.getElementById('choices')!;
  const visible = context.choices.filter(c => c.visible !== false);

  for (const choice of visible) {
    const btn = document.createElement('button');
    btn.textContent = LsdeUtils.getLocalizedText(choice.dialogueText) ?? choice.label ?? '';
    btn.onclick = () => {
      context.selectChoice(choice.uuid); // Tell the engine which path to take
      next();
    };
    panel.appendChild(btn);
  }

  // Cleanup: wipe the buttons when leaving this block
  return () => { panel.innerHTML = ''; };
});
```
```csharp [C# — Unity]
engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false).ToList();

    // Spawn a button per visible choice — your prefab, your layout
    foreach (var choice in visible)
    {
        var btn = Instantiate(choiceButtonPrefab, choicePanel);
        btn.GetComponentInChildren<Text>().text =
            LsdeUtils.GetLocalizedText(choice.DialogueText) ?? choice.Label ?? "";

        var uuid = choice.Uuid; // capture for closure
        btn.onClick.AddListener(() => {
            args.Context.SelectChoice(uuid);
            args.Next();
        });
    }

    // Cleanup: destroy spawned buttons
    return () => {
        foreach (Transform child in choicePanel)
            Destroy(child.gameObject);
    };
});
```
```cpp [C++ — Unreal]
engine.onChoice([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    const auto& choices = ctx->choices();
    for (const auto& c : choices) {
        if (!c.visible.has_value() || c.visible.value()) {
            auto text = lsde::LsdeUtils::GetLocalizedText(c.dialogueText);
            ChoiceWidget->AddOption(c.uuid, text.value_or(""));
        }
    }

    // Store context — your UI delegate calls selectChoice + next
    ChoiceCtx = ctx;
    ChoiceNext = std::move(next);

    return [this]() { ChoiceWidget->ClearOptions(); };
});

// Called from your UMG button delegate
void OnChoiceSelected(const std::string& uuid) {
    ChoiceCtx->selectChoice(uuid);
    ChoiceNext();
}
```
```gdscript [GDScript — Godot]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].choices:
        if c.get("visible") != false:
            visible.append(c)

    # One button per choice — connect the pressed signal
    for c in visible:
        var btn = Button.new()
        btn.text = LsdeUtils.get_localized_text(c.get("dialogueText")) or c.get("label", "")
        btn.pressed.connect(func():
            args["context"].select_choice(c["uuid"])
            args["next"].call()
        )
        choice_container.add_child(btn)

    # Cleanup: free the buttons when leaving
    return func():
        for child in choice_container.get_children():
            child.queue_free()
)
```
:::

## Condition の評価

ゲームステートの評価はゲーム側の責務です。engine が必要とするのは `true` か `false` だけです。

::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond) // choice history — engine handles it
      : gameState.check(cond.key, cond.operator, cond.value), // your logic
  );
  context.resolve(result); // true → port 0, false → port 1
  next();
});
```
```csharp [C# — Unity]
engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value));
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onCondition([this](auto* scene, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto* cb = dynamic_cast<const lsde::ConditionBlock*>(block);
    auto result = lsde::LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene, this](const auto& cond) {
            return lsde::isChoiceCondition(cond)
                ? scene->evaluateCondition(cond)
                : GetGameState()->Evaluate(cond);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return GameState.evaluate(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::

## Action の実行

ここからゲームが動き出します — サウンド再生、アイテム付与、フラグ設定、カットシーンのトリガー。

::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  for (const { actionId, params } of block.actions ?? []) {
    switch (actionId) {
      case 'set_flag':   gameState.setFlag(params[0], params[1]); break;
      case 'play_sound': audio.play(params[0] as string); break;
      case 'give_item':  inventory.add(params[0] as string); break;
    }
  }
  context.resolve();    // success → "then" port
  // context.reject(err); // failure → "catch" port (fallback "then")
  next();
});
```
```csharp [C# — Unity]
engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
    {
        switch (action.ActionId)
        {
            case "set_flag":   GameState.Instance.SetFlag(action.Params); break;
            case "play_sound": AudioManager.Play(action.Params[0].ToString()); break;
            case "give_item":  Inventory.Add(action.Params[0].ToString()); break;
        }
    }
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onAction([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto* ab = dynamic_cast<const lsde::ActionBlock*>(block);
    for (const auto& a : ab->actions) {
        if (a.actionId == "set_flag")   GetGameState()->SetFlag(a.params);
        if (a.actionId == "play_sound") GetAudioManager()->Play(a.params);
        if (a.actionId == "give_item")  GetInventory()->Add(a.params);
    }
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        match action.get("actionId"):
            "set_flag":   GameState.set_flag(action["params"][0], action["params"][1])
            "play_sound": AudioManager.play(action["params"][0])
            "give_item":  Inventory.add(action["params"][0])
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::

## 接続先の一覧

| Handler | engine が伝えること | ゲーム側の処理 |
|---|---|---|
| `onDialog` | 「このキャラクターからこのテキストを表示して」 | UI 表示、ボイス再生、入力待ち |
| `onChoice` | 「選択肢がここにある（visible/hidden タグ付き）」 | ボタン生成、選択処理 |
| `onCondition` | 「これらの condition を評価して」 | ゲームステートチェック、true/false を返す |
| `onAction` | 「これらのエフェクトを実行して」 | フラグ設定、アイテム付与、サウンド再生 |
| `onResolveCharacter` | 「どのキャラクターがアクティブ？」 | パーティシステム、戦闘フォーメーション |
| `setChoiceFilter` | 「この condition は表示制御のために true？」 | インベントリ、フラグ、クエストステートのチェック |
| `onValidateNextBlock` | 「次の block — 実行を許可する？」 | キャラクターゲーティング、ステータスチェック、遷移ルール |
| `onBeforeBlock` | 「block が実行されようとしている」 | 遅延処理、トランジション、フェードイン |

## プロのヒント

- **`next()` はリモコンです。** 高速対話のために即座に呼び出すか、アニメーションが終わるまで保持できます。engine は待機します — 時間の概念を持ちません。
- **クリーンアップ関数は無料のハウスキーピングです。** 任意の handler から返すと、次の block に移る際に engine が呼び出します。UI の非表示、オーディオの停止、生成ノードの解放に最適です。
- **`onBeforeBlock` が遅延を処理します。** engine は `delay` を強制しません — `onBeforeBlock` handler が `nativeProperties.delay` を読み取り、タイマー後に `resolve()` を呼び出します。完全な制御権がホストアプリケーション側にあります。
- **Async トラックは並列ストーリーラインです。** カットシーンで対話とカメラ移動を同時に行う必要がある場合、エディターで block を `isAsync` としてマークします。各トラックは独立して実行されます。

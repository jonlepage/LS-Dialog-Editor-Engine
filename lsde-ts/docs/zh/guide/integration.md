# 游戏引擎集成

LSDE engine 是一个纯粹的图遍历机器 — 它遍历节点并调用已注册的 handler。**handler 是 engine 和游戏之间的桥梁。** 本页展示如何将它们接入真实的游戏引擎。

## 模式

每次集成都遵循相同的 3 步流程：

1. **初始化** — 将 blueprint JSON 输入 engine
2. **连接** — 将 4 个 handler 接入游戏系统（UI、状态、音频...）
3. **启动** — engine 调用 handler，由 handler 驱动游戏逻辑

engine 永远不会触碰 UI、状态或音频。它只通知*发生了什么*，由 handler 决定*如何响应*。可以将其理解为一个导演在读舞台指示 — 游戏就是演员、工作人员和舞台。

## 显示对话

最简单的 handler — 显示文本并等待玩家继续。

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

::: tip next() 是流程控制器
立即调用 `next()` 可以实现快速对话推进，或者保存它稍后调用 — 在动画结束后、计时器结束后、玩家点击后... 任何适合游戏的方式。engine 会耐心等待。
:::

## 呈现选项

动态生成 UI 元素，让玩家选择，然后告诉 engine 选了什么。

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

## 评估 Condition

游戏状态逻辑完全由宿主应用程序控制。engine 只需要一个 `true` 或 `false`。

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

## 执行 Action

这是游戏真正活起来的地方 — 播放音效、给予物品、设置标记、触发过场动画。

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

## 各 Handler 的对应关系

| Handler | engine 通知的内容 | 对应的处理方式 |
|---|---|---|
| `onDialog` | "显示这个角色的这段文本" | 显示 UI、播放语音、等待输入 |
| `onChoice` | "这些是选项（标记了可见/隐藏）" | 生成按钮、处理选择 |
| `onCondition` | "评估这些 condition" | 检查游戏状态，返回 true/false |
| `onAction` | "执行这些效果" | 设置标记、给予物品、播放音效 |
| `onResolveCharacter` | "哪个角色是活跃的？" | 队伍系统、战斗阵型 |
| `setChoiceFilter` | "这个 condition 对可见性来说为真吗？" | 检查背包、标记、任务状态 |
| `onValidateNextBlock` | "下一个 block — 允许执行吗？" | 角色门控、状态检查、转换规则 |
| `onBeforeBlock` | "Block 即将执行" | 处理延迟、过渡、淡入效果 |

## 实用技巧

- **`next()` 是流程控制器。** 立即调用实现快速对话推进，或者保存它直到动画结束。engine 会等待 — 它没有时间概念。
- **清理函数是免费的管家服务。** 从任何 handler 返回一个清理函数，engine 在移动到下一个 block 时会调用它。非常适合隐藏 UI、停止音频或释放生成的节点。
- **`onBeforeBlock` 处理延迟。** engine 不强制执行 `delay` — 这由 `onBeforeBlock` handler 读取 `nativeProperties.delay` 并在计时器后调用 `resolve()` 来实现。完全由 handler 控制。
- **异步轨道是并行故事线。** 如果过场动画需要同时进行对话和镜头移动，在编辑器中将 block 标记为 `isAsync`。每条轨道独立运行。

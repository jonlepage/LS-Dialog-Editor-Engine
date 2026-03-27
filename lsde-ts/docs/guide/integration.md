# Game Engine Integration

The LSDE engine is a pure graph traversal machine — it walks nodes and calls registered handlers. **The handlers are the bridge between the engine and the host application.** This page shows how to wire them into real game engines.

## The Pattern

Every integration follows the same 3-step dance:

1. **Initialize** — feed the engine the blueprint JSON
2. **Connect** — plug the 4 handlers into the game systems (UI, state, audio...)
3. **Start** — the engine calls the handlers, the host application takes it from there

The engine never touches the UI, game state, or audio. It only reports *what* happened. The reaction is up to the host application. Think of it as a director reading stage directions — the game is the cast, crew, and stage.

## Showing Dialogue

The simplest handler — display text and wait for the player to continue.

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

::: tip next() is a remote control
Call `next()` instantly for rapid-fire dialogue, or store it and call later — after an animation, a timer, a player click... whatever fits the game. The engine waits patiently.
:::

## Presenting Choices

Spawn UI elements dynamically, let the player pick, and tell the engine what was selected.

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

## Evaluating Conditions

The game state, the rules. The engine just needs a `true` or `false`.

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

## Executing Actions

This is where the game comes alive — play sounds, give items, set flags, trigger cutscenes.

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

## What Connects Where

| Handler | What the engine reports | What the host application does |
|---|---|---|
| `onDialog` | "Show this text from this character" | Display UI, play voice, wait for input |
| `onChoice` | "Here are the options (tagged visible/hidden)" | Spawn buttons, handle selection |
| `onCondition` | "Evaluate these conditions" | Check game state, return true/false |
| `onAction` | "Execute these effects" | Set flags, give items, play sounds |
| `onResolveCharacter` | "Which character is active?" | Party system, battle formation |
| `setChoiceFilter` | "Is this condition true for visibility?" | Check inventory, flags, quest state |
| `onBeforeBlock` | "Block is about to execute" | Handle delays, transitions, fade-ins |

## Pro Tips

- **`next()` is a remote control.** Call it instantly for rapid-fire dialogue, or hold it until an animation finishes. The engine waits — it has no concept of time.
- **Cleanup functions are free housekeeping.** Return one from any handler and the engine calls it when moving to the next block. Perfect for hiding UI, stopping audio, or freeing spawned nodes.
- **`onBeforeBlock` handles delays.** The engine does not enforce `delay` — the `onBeforeBlock` handler reads `nativeProperties.delay` and calls `resolve()` after a timer. Full control.
- **Async tracks are parallel storylines.** If a cutscene needs dialogue and camera movement at the same time, mark blocks as `isAsync` in the editor. Each track runs independently.

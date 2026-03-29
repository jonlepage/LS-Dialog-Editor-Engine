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

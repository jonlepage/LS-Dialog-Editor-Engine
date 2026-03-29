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

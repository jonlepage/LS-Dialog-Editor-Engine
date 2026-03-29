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
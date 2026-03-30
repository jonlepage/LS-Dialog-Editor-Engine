::: code-group
```ts [TypeScript]
engine.onDialog(({ block, context, next }) => {
  const { dialogueText, nativeProperties } = block;
  const { character, resolveCharacterPort } = context;
  const text = game.getLocalizedText(dialogueText);
  const emotion = game.getCharacterEmotion(character);

  character && resolveCharacterPort(character.uuid);

  game.moveCameraToCharacter(character);
  game.animateCharacter(character, emotion);

  const dialog = game.createDialog(text, character, emotion);
  const shouldWaitInput = game.shouldWaitPlayerInputForDialog(nativeProperties);

  // next() tells the engine this block is done — call it when the player
  // dismisses the dialog or when the text animation finishes on its own
  if (shouldWaitInput) {
    dialog.onInput(() => next(), { once: true });
  } else {
    dialog.then(() =>
      game.wait(nativeProperties?.timeout ?? 0).then(() => next()),
    );
  }

  // cleanup: runs when the engine moves to the next block
  return () => {
    dialog.destroy();
    game.animateCharacter(character, false);
  };
});
```
```csharp [C#]
engine.OnDialog(args => {
    var (scene, block, context, next) = args;
    var (text, ch, emotion) = (
        Game.GetLocalizedText(block.DialogueText),
        context.Character,
        Game.GetCharacterEmotion(context.Character)
    );

    if (ch != null) context.ResolveCharacterPort(ch.Uuid);

    Game.MoveCameraToCharacter(ch);
    Game.AnimateCharacter(ch, emotion);

    var dialog = Game.CreateDialog(text, ch, emotion);
    var shouldWaitInput = Game.ShouldWaitPlayerInputForDialog(block.NativeProperties);

    // next() tells the engine this block is done — call it when the player
    // dismisses the dialog or when the text animation finishes on its own
    if (shouldWaitInput)
        dialog.OnInput(() => next(), once: true);
    else
        dialog.Then(() =>
            Game.Wait(block.NativeProperties?.Timeout ?? 0).Then(() => next()));

    // cleanup: runs when the engine moves to the next block
    return () => {
        dialog.Destroy();
        Game.AnimateCharacter(ch, false);
    };
});
```
```cpp [C++]
engine.onDialog([&game](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ch = ctx->character();
    auto text = game.getLocalizedText(block->dialogueText);
    auto emotion = game.getCharacterEmotion(ch);

    if (ch) ctx->resolveCharacterPort(ch->uuid);

    game.moveCameraToCharacter(ch);
    game.animateCharacter(ch, emotion);

    auto* dialog = game.createDialog(text, ch, emotion);
    auto shouldWaitInput = game.shouldWaitPlayerInputForDialog(block->nativeProperties);

    // next() tells the engine this block is done — call it when the player
    // dismisses the dialog or when the text animation finishes on its own
    if (shouldWaitInput) {
        dialog->onInput([next]() { next(); });
    } else {
        dialog->then([&game, next, block]() {
            game.wait(block->nativeProperties ? block->nativeProperties->timeout.value_or(0) : 0)
                .then([next]() { next(); });
        });
    }

    // cleanup: runs when the engine moves to the next block
    return [dialog, &game, ch]() {
        dialog->destroy();
        game.animateCharacter(ch, false);
    };
});
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    var block = args["block"]
    var ctx = args["context"]
    var next_fn = args["next"]
    var ch = ctx.character
    var text = game.get_localized_text(block.get("dialogueText"))
    var emotion = game.get_character_emotion(ch)

    if ch:
        ctx.resolve_character_port(ch.get("uuid", ""))

    game.move_camera_to_character(ch)
    game.animate_character(ch, emotion)

    var dialog = game.create_dialog(text, ch, emotion)
    var should_wait = game.should_wait_player_input(block.get("nativeProperties"))

    # next_fn.call() tells the engine this block is done — call it when the player
    # dismisses the dialog or when the text animation finishes on its own
    if should_wait:
        dialog.on_input(func(): next_fn.call(), true)
    else:
        await dialog.wait()
        await game.wait(block.get("nativeProperties", {}).get("timeout", 0))
        next_fn.call()

    # cleanup: runs when the engine moves to the next block
    return func():
        dialog.destroy()
        game.animate_character(ch, false)
)
```
:::

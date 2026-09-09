::: code-group
```ts [TypeScript]
engine.onDialog(({ block, context, next }) => {
  const { text, props } = block;
  const { character, resolveCharacterPort } = context;
  const line = game.getLocalizedText(text);
  const emotion = game.getCharacterEmotion(character);

  character && resolveCharacterPort(character.id);

  game.moveCameraToCharacter(character);
  game.animateCharacter(character, emotion);

  const dialog = game.createDialog(line, character, emotion);

  // next() tells the engine this block is done. WHEN to call it is answered by three
  // natives, and `timeout` comes FIRST because it outranks the other two: all three
  // say when the block is left, and the card is the most specific answer.
  if (props?.timeout) {
    // MILLISECONDS, and the countdown starts when the line has been SAID — `timeout`
    // is how long it STAYS on screen afterwards. Arming it on arrival truncates any
    // line slower to reveal than the timeout allows.
    dialog.onRevealComplete(() => game.wait(props.timeout).then(() => next()));
    // A click may HURRY that reveal; it may not dismiss a line that plays its own time.
    dialog.onInput(() => dialog.skipReveal(), { once: true });
  } else if (game.shouldWaitPlayerInputForDialog(props)) {
    dialog.onInput(() => next(), { once: true });
  } else {
    dialog.onRevealComplete(() => next());
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
        Game.GetLocalizedText(block.Text),
        context.Character,
        Game.GetCharacterEmotion(context.Character)
    );

    if (ch != null) context.ResolveCharacterPort(ch.Id);

    Game.MoveCameraToCharacter(ch);
    Game.AnimateCharacter(ch, emotion);

    var dialog = Game.CreateDialog(text, ch, emotion);
    var natives = block.NativeProperties;

    // next() tells the engine this block is done. Timeout comes FIRST: it outranks
    // WaitInput and it outranks leaving at once. All three say when the block is left,
    // and the one the writer put on the card is the most specific answer.
    if (natives?.Timeout > 0) {
        // MILLISECONDS, and the countdown starts when the line has been SAID — Timeout
        // is how long it STAYS on screen afterwards. Arming it on arrival truncates any
        // line slower to reveal than the timeout allows.
        dialog.OnRevealComplete(() =>
            Game.Wait(natives.Timeout.Value).Then(() => next()));
        // A click may HURRY that reveal; it may not dismiss a line playing its own time.
        dialog.OnInput(() => dialog.SkipReveal(), once: true);
    } else if (Game.ShouldWaitPlayerInputForDialog(natives)) {
        dialog.OnInput(() => next(), once: true);
    } else {
        dialog.OnRevealComplete(() => next());
    }

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
    auto text = game.getLocalizedText(block->text);
    auto emotion = game.getCharacterEmotion(ch);

    if (ch) ctx->resolveCharacterPort(ch->id);

    game.moveCameraToCharacter(ch);
    game.animateCharacter(ch, emotion);

    auto* dialog = game.createDialog(text, ch, emotion);
    auto natives = lsde::getNativeProperties(*block);

    // next() tells the engine this block is done. timeout comes FIRST: it outranks
    // waitInput and it outranks leaving at once. All three say when the block is left,
    // and the one the writer put on the card is the most specific answer.
    if (natives.timeout.value_or(0) > 0) {
        // MILLISECONDS, and the countdown starts when the line has been SAID - timeout
        // is how long it STAYS on screen afterwards. Arming it on arrival truncates any
        // line slower to reveal than the timeout allows.
        const auto stayMs = *natives.timeout;
        dialog->onRevealComplete([&game, next, stayMs]() {
            game.wait(stayMs).then([next]() { next(); });
        });
        // A click may HURRY that reveal; it may not dismiss a line playing its own time.
        dialog->onInput([dialog]() { dialog->skipReveal(); });
    } else if (game.shouldWaitPlayerInputForDialog(block->props)) {
        dialog->onInput([next]() { next(); });
    } else {
        dialog->onRevealComplete([next]() { next(); });
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
    var text = game.get_localized_text(block.get("text"))
    var emotion = game.get_character_emotion(ch)

    if ch:
        ctx.resolve_character_port(ch.get("id", ""))

    game.move_camera_to_character(ch)
    game.animate_character(ch, emotion)

    var dialog = game.create_dialog(text, ch, emotion)
    var natives = block.get("props", {})
    var stay_ms = natives.get("timeout", 0)

    # next_fn.call() tells the engine this block is done. timeout comes FIRST: it
    # outranks waitInput and it outranks leaving at once. All three say when the block
    # is left, and the one written on the card is the most specific answer.
    if stay_ms > 0:
        # A click may HURRY the reveal; it may not dismiss a line playing its own time.
        dialog.on_input(func(): dialog.skip_reveal(), true)
        # MILLISECONDS, counted from the moment the line has been SAID — stay_ms is how
        # long it REMAINS on screen afterwards, never how long it has to be said in.
        await dialog.reveal_finished
        await game.wait(stay_ms)
        next_fn.call()
    elif game.should_wait_player_input(natives):
        dialog.on_input(func(): next_fn.call(), true)
    else:
        await dialog.reveal_finished
        next_fn.call()

    # cleanup: runs when the engine moves to the next block
    return func():
        dialog.destroy()
        game.animate_character(ch, false)
)
```
:::

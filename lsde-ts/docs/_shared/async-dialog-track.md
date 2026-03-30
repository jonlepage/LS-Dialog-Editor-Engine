::: code-group
```ts [TypeScript]
engine.onDialog(({ scene, block, context, next }) => {
  if (scene === mainDialogue) {
    showMainUI(block);
    // next() called later — by player input
  } else if (scene === tutorialOverlay) {
    showTutorialBubble(block);
    // auto-advance after display
    next();
  }
});

const mainDialogue = engine.scene('main-quest');
const tutorialOverlay = engine.scene('tutorial-hints');
mainDialogue.start();
tutorialOverlay.start();
```
```csharp [C#]
engine.OnDialog(args => {
    if (args.Scene == mainDialogue)
    {
        ShowMainUI(args.Block);
        // next() called later — by player input
    }
    else if (args.Scene == tutorialOverlay)
    {
        ShowTutorialBubble(args.Block);
        // auto-advance after display
        args.Next();
    }
    return null;
});

var mainDialogue = engine.Scene("main-quest");
var tutorialOverlay = engine.Scene("tutorial-hints");
mainDialogue.Start();
tutorialOverlay.Start();
```
```cpp [C++]
engine.onDialog([&](auto* scene, auto* block, auto*, auto next) -> CleanupFn {
    if (scene == mainDialogue.get()) {
        showMainUI(block);
        // next() called later — by player input
    } else if (scene == tutorialOverlay.get()) {
        showTutorialBubble(block);
        // auto-advance after display
        next();
    }
    return {};
});

auto mainDialogue = engine.scene("main-quest");
auto tutorialOverlay = engine.scene("tutorial-hints");
mainDialogue->start();
tutorialOverlay->start();
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    if args["scene"] == main_dialogue:
        show_main_ui(args["block"])
        # next() called later — by player input
    elif args["scene"] == tutorial_overlay:
        show_tutorial_bubble(args["block"])
        # auto-advance after display
        args["next"].call()
    return Callable()
)

var main_dialogue = engine.scene("main-quest")
var tutorial_overlay = engine.scene("tutorial-hints")
main_dialogue.start()
tutorial_overlay.start()
```
:::

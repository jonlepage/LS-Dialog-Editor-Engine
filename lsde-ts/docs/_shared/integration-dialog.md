::: code-group
```ts [TypeScript — Phaser]
// Phaser 3.80+ — overlay scene for dialogue
import Phaser from 'phaser';
import { type DialogueEngine, LsdeUtils } from 'lsde';

export class DialogueUI extends Phaser.Scene {
  private pendingNext: (() => void) | null = null;

  constructor() {
    super({ key: 'DialogueUI' });
  }

  create(params: { engine: DialogueEngine }) {
    const panel = this.createDialogPanel();

    this.input.keyboard?.addKey('SPACE').on('down', () => this.advance());
    this.input.on('pointerdown', () => this.advance());

    params.engine.onDialog(({ block, context, next }) => {
      const { dialogueText, nativeProperties } = block;
      const { character, resolveCharacterPort } = context;
      const text = LsdeUtils.getLocalizedText(dialogueText);

      character && resolveCharacterPort(character.uuid);

      panel.show(text, character?.name);

      // next() signals the engine this block is done
      // store it — the player advances via input
      this.pendingNext = next;

      // auto-advance after a delay (cinematics, tutorials)
      let timer: Phaser.Time.TimerEvent | null = null;
      if (nativeProperties?.timeout) {
        timer = this.time.delayedCall(
          nativeProperties.timeout * 1000,
          () => this.advance(),
        );
      }

      // cleanup: runs when the engine moves on or the scene is cancelled
      return () => {
        panel.hide();
        this.pendingNext = null;
        timer?.destroy();
      };
    });
  }

  private advance() {
    if (this.pendingNext) { this.pendingNext(); this.pendingNext = null; }
  }

  /** Build your dialogue UI — adapt to your game's visual style. */
  private createDialogPanel() {
    const bg = this.add
      .graphics()
      .fillStyle(0x000000, 0.8)
      .fillRoundedRect(0, 0, 700, 150, 12);

    const nameText = this.add.text(16, 12, '', {
      fontSize: '16px', color: '#ffcc00', fontStyle: 'bold',
    });

    const bodyText = this.add.text(16, 38, '', {
      fontSize: '14px', color: '#ffffff', wordWrap: { width: 668 },
    });

    const container = this.add
      .container(50, 430, [bg, nameText, bodyText])
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    return {
      show: (text?: string, speaker?: string) => {
        nameText.setText(speaker ?? '');
        bodyText.setText(text ?? '');
        container.setVisible(true);
      },
      hide: () => container.setVisible(false),
    };
  }
}

// launched from the game scene:
// this.scene.launch('DialogueUI', { engine });
```
```csharp [C# — Unity]
engine.OnDialog(args => {
    var (_, block, context, next) = args;
    var text = LsdeUtils.GetLocalizedText(block.DialogueText);
    var ch = context.Character;

    if (ch != null) context.ResolveCharacterPort(ch.Uuid);

    speakerName.text = ch?.Name ?? "";
    dialogText.text = text ?? "";
    dialogPanel.SetActive(true);

    // next() tells the engine this block is done — store it for the Continue button
    _pendingNext = next;

    return () => {
        dialogPanel.SetActive(false);
        _pendingNext = null;
    };
});
```
```cpp [C++ — Unreal]
Engine.onDialog([this](auto* scene, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    const auto& text = block->dialogueText;
    auto* ch = ctx->character();
    auto localized = lsde::LsdeUtils::GetLocalizedText(text);

    if (ch) ctx->resolveCharacterPort(ch->uuid);

    DialogWidget->SetDialogue(
        FString(localized.value_or("").c_str()),
        FString(ch ? ch->name.c_str() : ""));
    DialogWidget->SetVisibility(ESlateVisibility::Visible);

    // next() tells the engine this block is done — store it for the UI delegate
    PendingNext = std::move(next);

    return [this]() {
        DialogWidget->SetVisibility(ESlateVisibility::Collapsed);
        PendingNext = nullptr;
    };
});
```
```gdscript [GDScript — Godot]
engine.on_dialog(func(args):
    var block = args["block"]
    var ctx = args["context"]
    var next_fn = args["next"]
    var ch = ctx.character
    var text = LsdeUtils.get_localized_text(block.get("dialogueText"))

    if ch:
        ctx.resolve_character_port(ch.get("uuid", ""))

    speaker_label.text = ch.get("name", "") if ch else ""
    dialogue_label.text = text if text else ""
    dialogue_panel.visible = true

    # next_fn.call() tells the engine this block is done
    _pending_next = next_fn

    return func():
        dialogue_panel.visible = false
        _pending_next = Callable()
)
```
:::

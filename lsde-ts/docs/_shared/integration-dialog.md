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
// Unity 2021+ — MonoBehaviour that owns the dialogue UI
using UnityEngine;
using TMPro;
using LsdeDialogEngine;

public class DialogueUI : MonoBehaviour
{
    [Header("UI References — assign in Inspector")]
    [SerializeField] private GameObject dialogPanel;
    [SerializeField] private TMP_Text speakerName;
    [SerializeField] private TMP_Text dialogText;

    private System.Action _pendingNext;

    /// <summary>
    /// Call once to wire LSDE handlers to this UI.
    /// The engine must be initialized before calling this method.
    /// </summary>
    public void Register(DialogueEngine engine)
    {
        engine.OnDialog(args => {
            var (_, block, context, next) = args;
            var text = LsdeUtils.GetLocalizedText(block.DialogueText);
            var ch = context.Character;

            if (ch != null) context.ResolveCharacterPort(ch.Uuid);

            // pass the block data to the UI
            speakerName.text = ch?.Name ?? "";
            dialogText.text = text ?? "";
            dialogPanel.SetActive(true);

            // next() signals the engine this block is done
            // store it — the player advances via the Continue button
            _pendingNext = next;

            // cleanup: runs when the engine moves on or the scene is cancelled
            return () => {
                dialogPanel.SetActive(false);
                _pendingNext = null;
            };
        });
    }

    /// <summary>Wire this to your Continue button's OnClick in the Inspector.</summary>
    public void OnContinueClick()
    {
        if (_pendingNext == null) return;
        _pendingNext();
        _pendingNext = null;
    }
}
```
```cpp [C++ — Unreal]
// UE5 — GameInstanceSubsystem that bridges LSDE with your game
// Engine is a lsde::DialogueEngine member initialized in Initialize()
#include "lsde/engine.h"
#include "lsde/utils.h"
#include "DialogueSubsystem.h"
#include "DialogueWidget.h"

void UDialogueSubsystem::RegisterHandlers()
{
    Engine.onDialog([this](auto* scene, const auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
        auto localized = lsde::LsdeUtils::GetLocalizedText(block->dialogueText);
        auto* ch = ctx->character();

        if (ch) ctx->resolveCharacterPort(ch->uuid);

        // pass the block data to the UMG widget
        DialogWidget->SetDialogue(
            FString(UTF8_TO_TCHAR(localized.value_or("").c_str())),
            FString(UTF8_TO_TCHAR(ch ? ch->name.c_str() : "")));
        DialogWidget->SetVisibility(ESlateVisibility::Visible);

        // next() signals the engine this block is done
        // store it — the player advances via a BlueprintCallable method
        PendingNext = std::move(next);

        // cleanup: runs when the engine moves on or the scene is cancelled
        return [this]() {
            DialogWidget->SetVisibility(ESlateVisibility::Collapsed);
            PendingNext = nullptr;
        };
    });
}

// UFUNCTION(BlueprintCallable) — call from your UI button delegate
void UDialogueSubsystem::AdvanceDialogue()
{
    if (PendingNext) { PendingNext(); PendingNext = nullptr; }
}
```
```gdscript [GDScript — Godot]
# Godot 4.3+ — autoload node that owns the dialogue UI
# Register as autoload in Project > Settings > Autoload
extends Node

@onready var dialogue_panel: PanelContainer = %DialoguePanel
@onready var speaker_label: Label = %SpeakerLabel
@onready var dialogue_label: RichTextLabel = %DialogueLabel

var _engine: LsdeDialogueEngine
var _pending_next: Callable

func _ready() -> void:
    # load and initialize the engine
    var json = JSON.parse_string(FileAccess.open("res://data/blueprint.json", FileAccess.READ).get_as_text())
    _engine = LsdeDialogueEngine.new()
    _engine.init({"data": json})
    _engine.set_locale("en")

    _register_handlers()

func _register_handlers() -> void:
    _engine.on_dialog(func(args):
        var block = args["block"]
        var ctx = args["context"]
        var next_fn = args["next"]
        var ch = ctx.character
        var text = LsdeUtils.get_localized_text(block.get("dialogueText"))

        if ch:
            ctx.resolve_character_port(ch.get("uuid", ""))

        # pass the block data to the UI
        speaker_label.text = ch.get("name", "") if ch else ""
        dialogue_label.text = text if text else ""
        dialogue_panel.visible = true

        # next_fn.call() signals the engine this block is done
        # store it — the player advances via ui_accept input
        _pending_next = next_fn

        # cleanup: runs when the engine moves on or the scene is cancelled
        return func():
            dialogue_panel.visible = false
            _pending_next = Callable()
    )

## Player input — advance dialogue on ui_accept (Space, Enter, gamepad A)
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_accept") and _pending_next.is_valid():
        _pending_next.call()
        _pending_next = Callable()
        get_viewport().set_input_as_handled()
```
:::

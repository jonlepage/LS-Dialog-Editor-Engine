::: code-group
```ts [TypeScript — Phaser]
// Phaser 3.80+ — overlay scene that handles all LSDE block types
import Phaser from 'phaser';
import { type DialogueEngine, LsdeUtils } from '@lsde/dialog-engine';

export class DialogueUI extends Phaser.Scene {
  private pendingNext: (() => void) | null = null;

  constructor() {
    super({ key: 'DialogueUI' });
  }

  create(params: { engine: DialogueEngine }) {
    const dialog = this.createDialogPanel();
    const choices = this.createChoicePanel();

    // player advances dialogue via keyboard or touch
    this.input.keyboard?.addKey('SPACE').on('down', () => this.advance());
    this.input.on('pointerdown', () => this.advance());

    // ── DIALOG ────────────────────────────────────────────────
    params.engine.onDialog(({ block, context, next }) => {
      const { dialogueText, nativeProperties } = block;
      const { character, resolveCharacterPort } = context;
      const text = LsdeUtils.getLocalizedText(dialogueText);

      character && resolveCharacterPort(character.uuid);

      dialog.show(text, character?.name);
      this.pendingNext = next;

      // auto-advance after a delay (cinematics, tutorials)
      let timer: Phaser.Time.TimerEvent | null = null;
      if (nativeProperties?.timeout) {
        timer = this.time.delayedCall(nativeProperties.timeout * 1000, () => this.advance());
      }

      return () => { dialog.hide(); this.pendingNext = null; timer?.destroy(); };
    });

    // ── CHOICE ────────────────────────────────────────────────
    params.engine.onChoice(({ block, context, next }) => {
      const { nativeProperties } = block;
      const { choices: items, selectChoice } = context;
      const visible = items.filter(c => c.visible !== false);

      const buttons = choices.show(visible, (uuid) => {
        selectChoice(uuid);
        next();
      });

      let timer: Phaser.Time.TimerEvent | null = null;
      if (nativeProperties?.timeout) {
        timer = this.time.delayedCall(nativeProperties.timeout * 1000, () => next());
      }

      return () => { choices.hide(buttons); timer?.destroy(); };
    });

    // ── CONDITION ─────────────────────────────────────────────
    params.engine.onCondition(({ block, context, next }) => {
      // evaluate your game state — return true or false
      const result = true; // ← replace with your game logic
      context.resolve(result);
      next();
    });

    // ── ACTION ────────────────────────────────────────────────
    params.engine.onAction(({ block, context, next }) => {
      // execute your game effects — set flags, play sounds, give items
      // context.resolve() on success, context.reject(err) on failure
      context.resolve();
      next();
    });
  }

  private advance() {
    if (this.pendingNext) { this.pendingNext(); this.pendingNext = null; }
  }

  // ── UI factories ──────────────────────────────────────────────

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

  private createChoicePanel() {
    return {
      show: (
        visible: { uuid: string; dialogueText?: Record<string, string>; label?: string }[],
        onSelect: (uuid: string) => void,
      ) => {
        return visible.map((choice, i) => {
          const text = LsdeUtils.getLocalizedText(choice.dialogueText) ?? choice.label ?? '';
          return this.add
            .text(80, 440 + i * 40, text, { fontSize: '15px', color: '#ffffff' })
            .setScrollFactor(0)
            .setDepth(1001)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => onSelect(choice.uuid));
        });
      },
      hide: (buttons: Phaser.GameObjects.Text[]) => buttons.forEach(b => b.destroy()),
    };
  }
}

// start a dialogue scene from your game:
// this.scene.launch('DialogueUI', { engine });
// engine.scene(sceneId).start();
```
```csharp [C# — Unity]
// Unity 2021+ — MonoBehaviour that handles all LSDE block types
using System.Linq;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using LsdeDialogEngine;

public class DialogueUI : MonoBehaviour
{
    [Header("Dialog UI — assign in Inspector")]
    [SerializeField] private GameObject dialogPanel;
    [SerializeField] private TMP_Text speakerName;
    [SerializeField] private TMP_Text dialogText;

    [Header("Choice UI")]
    [SerializeField] private Transform choiceContainer;
    [SerializeField] private GameObject choiceButtonPrefab;

    private DialogueEngine _engine;
    private System.Action _pendingNext;

    /// <summary>
    /// Call once to wire all LSDE handlers to this UI.
    /// The engine must be initialized before calling this method.
    /// </summary>
    public void Register(DialogueEngine engine)
    {
        _engine = engine;

        // ── DIALOG ────────────────────────────────────────────
        engine.OnDialog(args => {
            var (_, block, context, next) = args;
            var text = LsdeUtils.GetLocalizedText(block.DialogueText);
            var ch = context.Character;

            if (ch != null) context.ResolveCharacterPort(ch.Uuid);

            speakerName.text = ch?.Name ?? "";
            dialogText.text = text ?? "";
            dialogPanel.SetActive(true);

            _pendingNext = next;

            return () => { dialogPanel.SetActive(false); _pendingNext = null; };
        });

        // ── CHOICE ────────────────────────────────────────────
        engine.OnChoice(args => {
            var (_, block, context, next) = args;
            var visible = context.Choices
                .Where(c => c.Visible != false).ToList();

            foreach (var choice in visible)
            {
                var btn = Instantiate(choiceButtonPrefab, choiceContainer);
                btn.GetComponentInChildren<TMP_Text>().text =
                    LsdeUtils.GetLocalizedText(choice.DialogueText) ?? choice.Label ?? "";

                var uuid = choice.Uuid;
                btn.GetComponent<Button>().onClick.AddListener(() => {
                    context.SelectChoice(uuid);
                    next();
                });
            }

            return () => {
                foreach (Transform child in choiceContainer)
                    Destroy(child.gameObject);
            };
        });

        // ── CONDITION ─────────────────────────────────────────
        engine.OnCondition(args => {
            var (_, block, context, next) = args;

            // evaluate your game state — return true or false
            var result = true; // ← replace with your game logic
            context.Resolve(result);
            next();
            return null;
        });

        // ── ACTION ────────────────────────────────────────────
        engine.OnAction(args => {
            var (_, block, context, next) = args;

            // execute your game effects — set flags, play sounds, give items
            // context.Resolve() on success, context.Reject(err) on failure
            context.Resolve();
            next();
            return null;
        });
    }

    /// <summary>Wire this to your Continue button's OnClick in the Inspector.</summary>
    public void OnContinueClick()
    {
        if (_pendingNext == null) return;
        _pendingNext();
        _pendingNext = null;
    }

    /// <summary>Start a dialogue scene from your game code.</summary>
    public void StartScene(string sceneId)
    {
        var handle = _engine.Scene(sceneId);
        handle.Start();
    }
}
```
```cpp [C++ — Unreal]
// UE5 — GameInstanceSubsystem that handles all LSDE block types
// Engine is a lsde::DialogueEngine member initialized in Initialize()
#include "lsde/engine.h"
#include "lsde/utils.h"
#include "DialogueSubsystem.h"
#include "DialogueWidget.h"
#include "ChoiceWidget.h"

void UDialogueSubsystem::RegisterHandlers()
{
    // ── DIALOG ────────────────────────────────────────────────
    Engine.onDialog([this](auto* scene, const auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
        auto localized = lsde::LsdeUtils::GetLocalizedText(block->dialogueText);
        auto* ch = ctx->character();

        if (ch) ctx->resolveCharacterPort(ch->uuid);

        DialogWidget->SetDialogue(
            FString(UTF8_TO_TCHAR(localized.value_or("").c_str())),
            FString(UTF8_TO_TCHAR(ch ? ch->name.c_str() : "")));
        DialogWidget->SetVisibility(ESlateVisibility::Visible);

        PendingNext = std::move(next);

        return [this]() {
            DialogWidget->SetVisibility(ESlateVisibility::Collapsed);
            PendingNext = nullptr;
        };
    });

    // ── CHOICE ────────────────────────────────────────────────
    // PendingChoiceCtx is valid only during the current block — the engine
    // invalidates it once the cleanup runs or the scene advances.
    Engine.onChoice([this](auto* scene, const auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
        const auto& choices = ctx->choices();

        for (const auto& c : choices) {
            if (!c.visible.has_value() || c.visible.value()) {
                auto text = lsde::LsdeUtils::GetLocalizedText(c.dialogueText);
                ChoiceWidget->AddOption(
                    FString(UTF8_TO_TCHAR(c.uuid.c_str())),
                    FString(UTF8_TO_TCHAR(text.value_or("").c_str())));
            }
        }

        PendingChoiceCtx = ctx;
        PendingChoiceNext = std::move(next);

        return [this]() {
            ChoiceWidget->ClearOptions();
            PendingChoiceCtx = nullptr;
        };
    });

    // ── CONDITION ─────────────────────────────────────────────
    Engine.onCondition([](auto*, const auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
        // evaluate your game state — return true or false
        bool result = true; // ← replace with your game logic
        ctx->resolve(result);
        next();
        return {};
    });

    // ── ACTION ────────────────────────────────────────────────
    Engine.onAction([](auto*, const auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
        // execute your game effects — set flags, play sounds, give items
        // ctx->resolve() on success, ctx->reject(err) on failure
        ctx->resolve();
        next();
        return {};
    });
}

// UFUNCTION(BlueprintCallable) — call from your Continue button
void UDialogueSubsystem::AdvanceDialogue()
{
    if (PendingNext) { PendingNext(); PendingNext = nullptr; }
}

// UFUNCTION(BlueprintCallable) — call from your choice button delegate
void UDialogueSubsystem::OnChoiceSelected(const FString& Uuid)
{
    if (PendingChoiceCtx) {
        PendingChoiceCtx->selectChoice(TCHAR_TO_UTF8(*Uuid));
        if (PendingChoiceNext) { PendingChoiceNext(); PendingChoiceNext = nullptr; }
        PendingChoiceCtx = nullptr;
    }
}

// UFUNCTION(BlueprintCallable) — start a dialogue scene
void UDialogueSubsystem::StartScene(const FString& SceneId)
{
    auto handle = Engine.scene(TCHAR_TO_UTF8(*SceneId));
    handle->start();
}
```
```gdscript [GDScript — Godot]
# Godot 4.3+ — autoload node that handles all LSDE block types
# Register as autoload in Project > Settings > Autoload
extends Node

@onready var dialogue_panel: PanelContainer = %DialoguePanel
@onready var speaker_label: Label = %SpeakerLabel
@onready var dialogue_label: RichTextLabel = %DialogueLabel
@onready var choice_container: VBoxContainer = %ChoiceContainer

var _engine: LsdeDialogueEngine
var _pending_next: Callable

func _ready() -> void:
    var json = JSON.parse_string(
        FileAccess.open("res://data/blueprint.json", FileAccess.READ).get_as_text())
    _engine = LsdeDialogueEngine.new()
    _engine.init({"data": json})
    _engine.set_locale("en")

    _register_handlers()

func _register_handlers() -> void:

    # ── DIALOG ────────────────────────────────────────────────
    _engine.on_dialog(func(args):
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

        _pending_next = next_fn

        return func():
            dialogue_panel.visible = false
            _pending_next = Callable()
    )

    # ── CHOICE ────────────────────────────────────────────────
    _engine.on_choice(func(args):
        var ctx = args["context"]
        var next_fn = args["next"]
        var choices = ctx.choices

        var visible: Array = []
        for c in choices:
            if c.get("visible") != false:
                visible.append(c)

        for c in visible:
            var btn = Button.new()
            var label = LsdeUtils.get_localized_text(c.get("dialogueText"))
            btn.text = label if label else c.get("label", "")
            btn.pressed.connect(func():
                ctx.select_choice(c["uuid"])
                next_fn.call()
            )
            choice_container.add_child(btn)

        return func():
            for child in choice_container.get_children():
                child.queue_free()
    )

    # ── CONDITION ─────────────────────────────────────────────
    _engine.on_condition(func(args):
        var ctx = args["context"]
        var next_fn = args["next"]

        # evaluate your game state — return true or false
        var result = true  # ← replace with your game logic
        ctx.resolve(result)
        next_fn.call()
    )

    # ── ACTION ────────────────────────────────────────────────
    _engine.on_action(func(args):
        var ctx = args["context"]
        var next_fn = args["next"]

        # execute your game effects — set flags, play sounds, give items
        # ctx.resolve() on success, ctx.reject(err) on failure
        ctx.resolve()
        next_fn.call()
    )

## Player input — advance dialogue on ui_accept (Space, Enter, gamepad A)
func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_accept") and _pending_next.is_valid():
        _pending_next.call()
        _pending_next = Callable()
        get_viewport().set_input_as_handled()

## Start a dialogue scene from your game code
func start_scene(scene_id: String) -> void:
    var handle = _engine.scene(scene_id)
    handle.start()
```
:::

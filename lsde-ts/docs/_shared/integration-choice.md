::: code-group
```ts [TypeScript — Phaser]
// Phaser 3.80+ — extends DialogueUI with choice support
// choices are spawned dynamically as interactive text objects

registerChoiceHandler(engine: DialogueEngine) {
  engine.onChoice(({ block, context, next }) => {
    const { choices, selectChoice } = context;
    const { nativeProperties } = block;
    const visible = choices.filter(c => c.visible !== false);

    // spawn one interactive text per visible choice
    const buttons: Phaser.GameObjects.Text[] = visible.map((choice, i) => {
      const text = LsdeUtils.getLocalizedText(choice.dialogueText) ?? choice.label ?? '';
      const btn = this.add
        .text(80, 440 + i * 40, text, { fontSize: '15px', color: '#ffffff' })
        .setScrollFactor(0)
        .setDepth(1001)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          selectChoice(choice.uuid);
          next();
        });
      return btn;
    });

    // optional: auto-advance after a timeout (skip the choice)
    let timer: Phaser.Time.TimerEvent | null = null;
    if (nativeProperties?.timeout) {
      timer = this.time.delayedCall(nativeProperties.timeout * 1000, () => next());
    }

    // cleanup: destroy spawned buttons when the engine moves on
    return () => {
      buttons.forEach(b => b.destroy());
      timer?.destroy();
    };
  });
}
```
```csharp [C# — Unity]
// Unity 2021+ — extends DialogueUI with choice support
// choiceButtonPrefab and choiceContainer are [SerializeField] assigned in Inspector

[Header("Choice UI")]
[SerializeField] private Transform choiceContainer;
[SerializeField] private Button choiceButtonPrefab;

public void RegisterChoiceHandler(DialogueEngine engine)
{
    engine.OnChoice(args => {
        var (_, block, context, next) = args;
        var visible = context.Choices
            .Where(c => c.Visible != false).ToList();

        // spawn one button per visible choice
        foreach (var choice in visible)
        {
            var btn = Instantiate(choiceButtonPrefab, choiceContainer);
            btn.GetComponentInChildren<TMP_Text>().text =
                LsdeUtils.GetLocalizedText(choice.DialogueText) ?? choice.Label ?? "";

            var uuid = choice.Uuid;
            btn.onClick.AddListener(() => {
                context.SelectChoice(uuid);
                next();
            });
        }

        // cleanup: destroy spawned buttons when the engine moves on
        return () => {
            foreach (Transform child in choiceContainer)
                Destroy(child.gameObject);
        };
    });
}
```
```cpp [C++ — Unreal]
// UE5 — extends UDialogueSubsystem with choice support
// ChoiceWidget is a UMG widget with AddOption() / ClearOptions()

void UDialogueSubsystem::RegisterChoiceHandler()
{
    Engine.onChoice([this](auto* scene, const auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
        const auto& choices = ctx->choices();

        // add one option per visible choice to the UMG widget
        for (const auto& c : choices) {
            if (!c.visible.has_value() || c.visible.value()) {
                auto text = lsde::LsdeUtils::GetLocalizedText(c.dialogueText);
                ChoiceWidget->AddOption(
                    FString(UTF8_TO_TCHAR(c.uuid.c_str())),
                    FString(UTF8_TO_TCHAR(text.value_or("").c_str())));
            }
        }

        // store context and next — the UI delegate calls them on selection
        ChoiceCtx = ctx;
        ChoiceNext = std::move(next);

        return [this]() { ChoiceWidget->ClearOptions(); };
    });
}

// UFUNCTION(BlueprintCallable) — called from the choice button delegate
void UDialogueSubsystem::OnChoiceSelected(const FString& Uuid)
{
    if (ChoiceCtx) {
        ChoiceCtx->selectChoice(TCHAR_TO_UTF8(*Uuid));
        if (ChoiceNext) { ChoiceNext(); ChoiceNext = nullptr; }
        ChoiceCtx = nullptr;
    }
}
```
```gdscript [GDScript — Godot]
# Godot 4.3+ — extends the autoload with choice support
# choice_container is a VBoxContainer referenced via unique name

@onready var choice_container: VBoxContainer = %ChoiceContainer

func _register_choice_handler() -> void:
    _engine.on_choice(func(args):
        var ctx = args["context"]
        var next_fn = args["next"]
        var choices = ctx.choices

        # filter visible choices
        var visible: Array = []
        for c in choices:
            if c.get("visible") != false:
                visible.append(c)

        # spawn one button per visible choice
        for c in visible:
            var btn = Button.new()
            btn.text = LsdeUtils.get_localized_text(c.get("dialogueText")) or c.get("label", "")
            btn.pressed.connect(func():
                ctx.select_choice(c["uuid"])
                next_fn.call()
            )
            choice_container.add_child(btn)

        # cleanup: free spawned buttons when the engine moves on
        return func():
            for child in choice_container.get_children():
                child.queue_free()
    )
```
:::

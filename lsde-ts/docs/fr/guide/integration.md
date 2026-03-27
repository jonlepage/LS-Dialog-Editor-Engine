# Intégration avec un game engine

Le LSDE engine est une pure machine de traversée de graphe — il walk les nodes et call tes handlers. **Tes handlers sont le pont entre le engine et ton jeu.** Cette page montre comment les brancher dans de vrais game engines.

## Le pattern

Chaque intégration suit la même danse en 3 étapes :

1. **Initialiser** — feed le engine ton blueprint JSON
2. **Connecter** — plug tes 4 handlers dans tes systèmes de jeu (UI, state, audio...)
3. **Starter** — le engine call tes handlers, tu fais la magie

Le engine touche jamais à ton UI, ton state ou ton audio. Il te dit juste *ce qui* s'est passé. Tu décides *comment* réagir. Pense à ça comme un directeur qui lit les directions de scène — ton jeu c'est le cast, le crew et la scène.

## Afficher le dialogue

Le handler le plus simple — affiche du texte et attend que le joueur continue.

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

::: tip next() c'est ta télécommande
Call `next()` instantanément pour du dialogue rapide, ou store-le et call-le plus tard — après une animation, un timer, un click du joueur... whatever qui fit ton jeu. Le engine attend patiemment.
:::

## Présenter des choix

Spawn des éléments UI dynamiquement, laisse le joueur choisir, et dis au engine ce qui a été sélectionné.

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

## Évaluer les conditions

Ton game state, tes règles. Le engine a juste besoin d'un `true` ou `false`.

::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond) // choice history — engine handles it
      : gameState.check(cond.key, cond.operator, cond.value), // your logic
  );
  context.resolve(result); // true → port 0, false → port 1
  next();
});
```
```csharp [C# — Unity]
engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value));
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onCondition([this](auto* scene, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto* cb = dynamic_cast<const lsde::ConditionBlock*>(block);
    auto result = lsde::LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene, this](const auto& cond) {
            return lsde::isChoiceCondition(cond)
                ? scene->evaluateCondition(cond)
                : GetGameState()->Evaluate(cond);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return GameState.evaluate(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::

## Exécuter des actions

C'est ici que ton jeu prend vie — joue des sons, donne des items, set des flags, trigger des cutscenes.

::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  for (const { actionId, params } of block.actions ?? []) {
    switch (actionId) {
      case 'set_flag':   gameState.setFlag(params[0], params[1]); break;
      case 'play_sound': audio.play(params[0] as string); break;
      case 'give_item':  inventory.add(params[0] as string); break;
    }
  }
  context.resolve();    // success → "then" port
  // context.reject(err); // failure → "catch" port (fallback "then")
  next();
});
```
```csharp [C# — Unity]
engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
    {
        switch (action.ActionId)
        {
            case "set_flag":   GameState.Instance.SetFlag(action.Params); break;
            case "play_sound": AudioManager.Play(action.Params[0].ToString()); break;
            case "give_item":  Inventory.Add(action.Params[0].ToString()); break;
        }
    }
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
engine.onAction([this](auto*, auto* block, auto* ctx, auto next) -> lsde::CleanupFn {
    auto* ab = dynamic_cast<const lsde::ActionBlock*>(block);
    for (const auto& a : ab->actions) {
        if (a.actionId == "set_flag")   GetGameState()->SetFlag(a.params);
        if (a.actionId == "play_sound") GetAudioManager()->Play(a.params);
        if (a.actionId == "give_item")  GetInventory()->Add(a.params);
    }
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        match action.get("actionId"):
            "set_flag":   GameState.set_flag(action["params"][0], action["params"][1])
            "play_sound": AudioManager.play(action["params"][0])
            "give_item":  Inventory.add(action["params"][0])
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::

## Ce qui connecte où

| Handler | Ce que le engine te dit | Ce que tu fais avec |
|---|---|---|
| `onDialog` | "Affiche ce texte de ce personnage" | Afficher l'UI, jouer la voix, attendre l'input |
| `onChoice` | "Voici les options (taggées visible/hidden)" | Spawn des boutons, gérer la sélection |
| `onCondition` | "Évalue ces conditions" | Checker le game state, retourner true/false |
| `onAction` | "Exécute ces effets" | Set des flags, donner des items, jouer des sons |
| `onResolveCharacter` | "Quel personnage est actif?" | Système de party, formation de bataille |
| `setChoiceFilter` | "Est-ce que cette condition est vraie pour la visibilité?" | Checker inventaire, flags, state des quêtes |
| `onBeforeBlock` | "Un block est sur le point de s'exécuter" | Gérer les delays, transitions, fade-ins |

## Pro Tips

- **`next()` c'est ta télécommande.** Call-le instantanément pour du dialogue rapide, ou garde-le en otage jusqu'à ce que ton animation finisse. Le engine attend — il a aucun concept du temps.
- **Les fonctions de cleanup c'est du housekeeping gratuit.** Retourne-en une de n'importe quel handler et le engine va la call quand il move au prochain block. Parfait pour cacher l'UI, stopper l'audio ou free des nodes spawnés.
- **`onBeforeBlock` gère les delays.** Le engine enforce pas `delay` — c'est ton handler `onBeforeBlock` qui lit `nativeProperties.delay` et call `resolve()` après un timer. Full control.
- **Les async tracks sont des storylines parallèles.** Si ta cutscene a besoin de dialogue et de mouvements de caméra en même temps, marque les blocks comme `isAsync` dans l'éditeur. Chaque track run indépendamment.

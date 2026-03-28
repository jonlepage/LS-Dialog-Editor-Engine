# Types de blocks

Le engine supporte 5 types de blocks. Chacun a un handler dédié et un context spécifique au type.

Les 4 handlers de blocks de contenu (`onDialog`, `onChoice`, `onCondition`, `onAction`) sont **required** — le engine valide leur présence à l'appel de `start()`.

## DIALOG

Affiche du texte dit par un personnage. Le personnage est résolu par le callback `onResolveCharacter`.

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

`resolveCharacterPort()` match par **UUID du personnage en premier**, puis par **nom** comme fallback.

## CHOICE

Présente des options sélectionnables au joueur. Quand [`setChoiceFilter()`](/fr/guide/choice-visibility) est configuré, chaque choice est taggé avec `visible: true | false`.

::: code-group
```ts [TypeScript]
engine.onChoice(({ block, context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);

  showChoicesUI(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false).ToList();

    ShowChoicesUI(visible, uuid => {
        args.Context.SelectChoice(uuid);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    showChoicesUI(visible, [ctx, next](auto& uuid) {
        ctx->selectChoice(uuid);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].choices:
        if c.get("visible") != false:
            visible.append(c)

    show_choices_ui(visible, func(uuid):
        args["context"].select_choice(uuid)
        args["next"].call()
    )
    return Callable()
)
```
:::

Voir [Choice Visibility](/fr/guide/choice-visibility) pour le système complet de tagging opt-in.

## CONDITION

Évalue de la logique pour brancher le flow. Le handler **doit** appeler `resolve(result)` — `true` suit le port index 0, `false` suit le port index 1.

::: code-group
```ts [TypeScript]
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)
      : gameState.check(cond.key, cond.operator, cond.value),
  );
  context.resolve(result);
  next();
});
```
```csharp [C#]
engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : GameState.Check(cond.Key, cond.Operator, cond.Value)
    );
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onCondition([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(
        cb->conditions,
        [scene](const auto& cond) {
            return isChoiceCondition(cond)
                ? scene->evaluateCondition(cond)
                : gameState.check(cond.key, cond.op, cond.value);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return game_state.check(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::

::: tip Conditions choice:
Les conditions avec des clés qui commencent par `choice:` font référence à une sélection précédente du joueur. Utilise `scene.evaluateCondition(cond)` pour les résoudre — le engine check son historique de choix interne automatiquement.
:::

## ACTION

Trigger des changements de game state. Appeler `resolve()` pour le succès ou `reject(error)` pour un échec.

::: code-group
```ts [TypeScript]
engine.onAction(({ block, context, next }) => {
  for (const action of block.actions ?? []) {
    gameState.execute(action.actionId, action.params);
  }
  context.resolve();   // → "then" port
  // or context.reject(err); → "catch" port (fallback "then" if no catch exists)
  next();
});
```
```csharp [C#]
engine.OnAction(args => {
    foreach (var action in args.Block.Actions ?? new())
        GameState.Execute(action.ActionId, action.Params);
    args.Context.Resolve();
    args.Next();
    return null;
});
```
```cpp [C++]
engine.onAction([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* ab = dynamic_cast<const ActionBlock*>(block);
    for (const auto& a : ab->actions)
        gameState.execute(a.actionId, a.params);
    ctx->resolve();
    next();
    return {};
});
```
```gdscript [GDScript]
engine.on_action(func(args):
    for action in args["block"].get("actions", []):
        game_state.execute(action)
    args["context"].resolve()
    args["next"].call()
    return Callable()
)
```
:::

## NOTE

Block de documentation pour le designer. Jamais exécuté — automatiquement skippé pendant la traversée.

## Propriétés communes

Tous les blocks partagent ces champs de base :

| Champ | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Identifiant unique |
| `type` | `BlockType` | Type discriminant |
| `label` | `string?` | Nom lisible par un humain |
| `properties` | `BlockProperty[]` | Propriétés clé-valeur |
| `userProperties` | `Record?` | Propriétés utilisateur libres |
| `nativeProperties` | `NativeProperties?` | Propriétés d'exécution (async, delay, etc.) |
| `metadata` | `BlockMetadata?` | Metadata d'affichage (personnages, tags, couleur) |
| `isStartBlock` | `boolean?` | Marque le block d'entrée |

### NativeProperties

| Champ | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | Exécuter sur un track async parallèle |
| `delay` | `number?` | Délai avant exécution (consommé par `onBeforeBlock`) |
| `timeout` | `number?` | Timeout d'exécution |
| `portPerCharacter` | `boolean?` | Un output port par personnage dans les metadata |
| `skipIfMissingActor` | `boolean?` | Ignorer le block si l'acteur est absent |
| `debug` | `boolean?` | Flag de debug pour l'éditeur |
| `waitForBlocks` | `string[]?` | UUIDs de blocks qui doivent être visités avant que ce block puisse progresser |
| `waitInput` | `boolean?` | Flag passif pour contrôle d'input joueur explicite |

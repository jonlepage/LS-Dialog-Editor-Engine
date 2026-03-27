# Choice Visibility

## Aperçu

Quand un block CHOICE est dispatché, `context.choices` contient toujours **tous** les choix définis dans le blueprint — rien n'est pré-filtré. Le engine n'enlève jamais de choix du array.

Pour du filtrage de visibilité (ex. cacher des choix basés sur le game state ou des sélections précédentes), le engine fournit un système de **tagging opt-in**. Un filter est installé une seule fois, et le engine tag chaque choix avec `visible: true | false` avant que le handler `onChoice` le reçoive.

## Setup

Enregistre un choice filter sur le engine — une seule fois, avant de starter n'importe quelle scene :

::: code-group
```ts [TypeScript]
engine.setChoiceFilter((condition) => {
  // Evaluate game-state conditions only.
  // choice: conditions are handled internally by the engine.
  return gameState.check(condition.key, condition.operator, condition.value);
});
```
```csharp [C#]
engine.SetChoiceFilter(cond => {
    return GameState.Check(cond.Key, cond.Operator, cond.Value);
});
```
```cpp [C++]
engine.setChoiceFilter([](const ExportCondition& cond) {
    return gameState.check(cond.key, cond.op, cond.value);
});
```
```gdscript [GDScript]
engine.set_choice_filter(func(cond):
    return game_state.check(cond)
)
```
:::

Quand le filter est installé, le engine évalue les `visibilityConditions` de chaque choix **avant** d'appeler `onChoice` :

- **Conditions `choice:`** (qui référencent des sélections précédentes du joueur) sont résolues automatiquement par le engine via son historique de choix interne — le callback ne les reçoit jamais.
- **Conditions de game-state** (tout le reste) sont déléguées au callback.
- Le chaining avec `&` (AND) et `|` (OR) fonctionne correctement entre les deux types.

## Filtrage dans onChoice

Dans le handler, le filtrage se fait avec une seule ligne :

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

### Pourquoi `visible !== false` et pas `=== true`?

Quand **aucun filter n'est installé**, `visible` est `undefined`. Comme `undefined !== false` donne `true`, tous les choix passent — rétrocompatible par défaut. Quand un filter **est installé**, les choix sont taggés `true` ou `false` explicitement.

| Valeur de `visible` | Signification | `!== false` |
|---|---|---|
| `true` | Filter installé, le choix passe | `true` |
| `false` | Filter installé, choix caché | `false` |
| `undefined` | Pas de filter installé | `true` |

## RuntimeChoiceItem

Quand un filter est installé, chaque choix dans `context.choices` est un `RuntimeChoiceItem` — une extension de `ChoiceItem` avec le tag `visible` :

```ts
interface RuntimeChoiceItem extends ChoiceItem {
  visible?: boolean; // true | false | undefined
}
```

Sans filter, les choix sont toujours des `RuntimeChoiceItem` mais `visible` reste `undefined`.

## Exemples

### Standard — afficher les choix visibles

```ts
engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  ui.showChoices(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```

### Choix minuté — auto-select au timeout

```ts
engine.onChoice(({ block, context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  const timeout = block.nativeProperties?.timeout;

  const resolve = (choice) => {
    context.selectChoice(choice.uuid);
    next();
  };

  if (timeout) {
    const timer = setTimeout(() => resolve(visible[0]), timeout * 1000);
    ui.showChoices(visible, (uuid) => {
      clearTimeout(timer);
      resolve(visible.find(c => c.uuid === uuid));
    });
  } else {
    ui.showChoices(visible, (uuid) => resolve(visible.find(c => c.uuid === uuid)));
  }
});
```

### Choix cachés affichés en grisé

```ts
engine.onChoice(({ context, next }) => {
  for (const choice of context.choices) {
    if (choice.visible === false) {
      ui.addGreyed(choice);   // Show but disabled
    } else {
      ui.addNormal(choice);   // Selectable
    }
  }
  // Wait for player selection...
});
```

### Tutorial — ignorer complètement la visibilité

```ts
tutorial.onChoice(({ context, next }) => {
  // Force-select the first choice, no filtering
  context.selectChoice(context.choices[0].uuid);
  next();
});
```

## Partager l'évaluateur

Le jeu évalue probablement les conditions à un seul endroit — un système d'inventaire, un flag manager, un quest tracker. Il est possible de partager la **même fonction d'évaluation** entre `setChoiceFilter` et `onCondition` pour que la logique reste au même endroit :

::: code-group
```ts [TypeScript]
// Define once, use everywhere
const evaluateGameCondition = (cond: ExportCondition) =>
  gameState.check(cond.key, cond.operator, cond.value);

// Choice visibility — uses your evaluator for game-state conditions
engine.setChoiceFilter(evaluateGameCondition);

// Condition blocks — same evaluator, plus choice: handling
engine.onCondition(({ scene, block, context, next }) => {
  const result = LsdeUtils.evaluateConditionChain(
    block.conditions ?? [],
    (cond) => LsdeUtils.isChoiceCondition(cond)
      ? scene.evaluateCondition(cond)  // engine handles choice history
      : evaluateGameCondition(cond),   // your shared function
  );
  context.resolve(result);
  next();
});
```
```csharp [C# — Unity]
// One evaluator to rule them all
Func<ExportCondition, bool> evalGameCond = cond =>
    GameState.Instance.Evaluate(cond.Key, cond.Operator, cond.Value);

engine.SetChoiceFilter(evalGameCond);

engine.OnCondition(args => {
    var result = LsdeUtils.EvaluateConditionChain(
        args.Block.Conditions ?? new(),
        cond => LsdeUtils.IsChoiceCondition(cond)
            ? args.Scene.EvaluateCondition(cond)
            : evalGameCond(cond));
    args.Context.Resolve(result);
    args.Next();
    return null;
});
```
```cpp [C++ — Unreal]
// Shared lambda — capture your game state once
auto evalGameCond = [this](const ExportCondition& cond) {
    return GetGameState()->Evaluate(cond.key, cond.op, cond.value);
};

engine.setChoiceFilter(evalGameCond);

engine.onCondition([this, evalGameCond](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* cb = dynamic_cast<const ConditionBlock*>(block);
    auto result = LsdeUtils::EvaluateConditionChain(cb->conditions,
        [scene, &evalGameCond](const auto& cond) {
            return isChoiceCondition(cond) ? scene->evaluateCondition(cond) : evalGameCond(cond);
        });
    ctx->resolve(result);
    next();
    return {};
});
```
```gdscript [GDScript — Godot]
# One function, two uses
var eval_game_cond = func(cond):
    return GameState.evaluate(cond.get("key"), cond.get("operator"), cond.get("value"))

engine.set_choice_filter(eval_game_cond)

engine.on_condition(func(args):
    var result = LsdeUtils.evaluate_condition_chain(
        args["block"].get("conditions", []),
        func(cond):
            if LsdeUtils.is_choice_condition(cond):
                return args["scene"].evaluate_condition(cond)
            return eval_game_cond.call(cond)
    )
    args["context"].resolve(result)
    args["next"].call()
    return Callable()
)
```
:::

::: tip Pourquoi partager?
Sans ce pattern, la même logique `gameState.check(...)` se retrouve à deux places. Quand l'API de game state change, un seul côté est corrigé et l'autre est oublié. Une seule fonction, deux registrations, zéro drift.
:::

## Avancé : Filtrage manuel

Si un filter global n'est pas souhaité, `LsdeUtils` fournit un utilitaire low-level :

```ts
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // Optional — when provided, choice: conditions are resolved via choice history
);
```

Le paramètre `scene` active la résolution automatique des conditions `choice:`. Sans celui-ci, toutes les conditions sont déléguées au evaluator callback.

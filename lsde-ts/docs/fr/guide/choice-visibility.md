# Visibilité des choix

## Aperçu

Quand un block CHOICE est dispatché, `context.options` contient toujours **tous** les choix définis dans le blueprint — rien n'est pré-filtré. Le engine n'enlève jamais de choix du array.

Pour du filtrage de visibilité (ex. cacher des choix basés sur le game state ou des sélections précédentes), le engine fournit un système de **tagging opt-in**. Un condition resolver est installé une seule fois, et le engine tag chaque choix avec `visible: true | false` avant que le handler `onChoice` le reçoive.

## Setup

Enregistrez un condition resolver sur le engine — une seule fois, avant de démarrer une scène :

<!--@include: ../../_shared/choice-filter-setup.md-->

Quand le resolver est installé, le engine évalue les `when` de chaque choix **avant** d'appeler `onChoice`. Le même resolver pré-évalue aussi les groupes de condition blocks -- voir [Condition blocks](/fr/guide/block-types#condition) pour les détails.

- **Conditions `choice:`** (qui référencent des sélections précédentes du joueur) sont résolues automatiquement par le engine via son historique de choix interne — le callback ne les reçoit jamais.
- **Conditions de game-state** (tout le reste) sont déléguées au callback.
- Le chaining avec `&` (AND) et `|` (OR) fonctionne correctement entre les deux types.

## Filtrage dans onChoice

Dans le handler, le filtrage se fait avec une seule ligne :

<!--@include: ../../_shared/choice-visibility-handler.md-->

### Pourquoi `visible !== false` et pas `=== true`?

Quand **aucun resolver n'est installé**, `visible` est `undefined`. Comme `undefined !== false` donne `true`, tous les choix passent — rétrocompatible par défaut. Quand un resolver **est installé**, les choix sont taggés `true` ou `false` explicitement.

| Valeur de `visible` | Signification | `!== false` |
|---|---|---|
| `true` | Resolver installé, le choix passe | `true` |
| `false` | Resolver installé, choix caché | `false` |
| `undefined` | Pas de resolver installé | `true` |

## RuntimeChoiceItem

Chaque entrée de `context.options` est un [`RuntimeChoiceItem`](/api-ref/interfaces/RuntimeChoiceItem) — l'`Option` du blueprint, plus le tag `visible` :

::: code-group
```ts [TypeScript]
interface RuntimeChoiceItem extends Option {
  visible?: boolean; // true | false | undefined
}
```
```csharp [C#]
public class RuntimeChoiceItem : Option
{
    public bool? Visible { get; set; } // true | false | null
}
```
```cpp [C++]
struct RuntimeChoiceItem : Option {
    std::optional<bool> visible; // true | false | nullopt
};
```
```gdscript [GDScript]
# RuntimeChoiceItem is a Dictionary with an extra "visible" key:
# { "id": "C1", "key": "...", "text": {...}, "visible": true/false/absent }
```
:::

Sans resolver, les choix sont toujours des `RuntimeChoiceItem` mais `visible` reste `undefined`/`null`/`nullopt`/absent. L'`Option` elle-même porte `id`, `key`, `text` et `when` — et son **`id` est le port de sortie** (`C1`, `C2`…).

## Exemples

### Standard — afficher les choix visibles

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  const offered = context.options.filter(c => c.visible !== false);
  ui.showOptions(visible, (optionId) => {
    context.selectChoice(optionId);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Options
        .Where(c => c.Visible != false).ToList();
    ShowChoicesUI(visible, optionId => {
        args.Context.SelectChoice(optionId);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->options())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);
    showOptionsUI(visible, [ctx, next](const auto& optionId) {
        ctx->selectChoice(optionId);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].options:
        if c.get("visible") != false:
            visible.append(c)
    show_options_ui(visible, func(option_id):
        args["context"].select_choice(option_id)
        args["next"].call()
    )
    return Callable()
)
```
:::

### Choix minuté — auto-select au timeout

::: code-group
```ts [TypeScript]
engine.onChoice(({ block, context, next }) => {
  const offered = context.options.filter(c => c.visible !== false);
  const timeout = LsdeUtils.getNativeProperties(block)?.timeout;

  const resolve = (choice) => {
    context.selectChoice(choice.id);
    next();
  };

  if (timeout) {
    const timer = setTimeout(() => resolve(visible[0]), timeout * 1000);
    ui.showOptions(visible, (optionId) => {
      clearTimeout(timer);
      resolve(visible.find(c => c.id === optionId));
    });
  } else {
    ui.showOptions(visible, (optionId) => resolve(visible.find(c => c.id === optionId)));
  }
});
```
```csharp [C#]
engine.OnChoice(args => {
    var (_, block, context, next) = args;
    var visible = context.Options
        .Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;

    void Resolve(RuntimeChoiceItem choice) {
        context.SelectChoice(choice.Id);
        next();
    }

    if (timeout.HasValue)
    {
        // use your engine's timer — cancel on player selection
        var timer = ScheduleTimer((float)timeout.Value, () => Resolve(visible[0]));
        ShowChoicesUI(visible, optionId => {
            timer.Cancel();
            Resolve(visible.First(c => c.Id == optionId));
        });
    }
    else
    {
        ShowChoicesUI(visible, optionId => Resolve(visible.First(c => c.Id == optionId)));
    }
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->options())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    auto timeout = block->props
        ? block->props->timeout : std::nullopt;

    auto resolve = [ctx, next](const std::string& optionId) {
        ctx->selectChoice(optionId);
        next();
    };

    if (timeout.has_value()) {
        // use your engine's timer — cancel on player selection
        auto timer = scheduleDelay(timeout.value(), [&]() { resolve(visible[0]->id); });
        showOptionsUI(visible, [resolve, timer](const auto& optionId) {
            timer->cancel();
            resolve(optionId);
        });
    } else {
        showOptionsUI(visible, resolve);
    }
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var ctx = args["context"]
    var next_fn = args["next"]
    var block = args["block"]
    var visible = []
    for c in ctx.options:
        if c.get("visible") != false:
            visible.append(c)

    var timeout_val = block.get("props", {}).get("timeout", 0)

    if timeout_val > 0:
        # use your engine's timer — cancel on player selection
        var timer = get_tree().create_timer(timeout_val)
        timer.timeout.connect(func():
            ctx.select_choice(visible[0]["id"])
            next_fn.call()
        )
        show_options_ui(visible, func(option_id):
            timer.time_left = 0  # cancel
            ctx.select_choice(option_id)
            next_fn.call()
        )
    else:
        show_options_ui(visible, func(option_id):
            ctx.select_choice(option_id)
            next_fn.call()
        )
    return Callable()
)
```
:::

### Choix cachés affichés en grisé

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  for (const choice of context.options) {
    if (choice.visible === false) {
      ui.addGreyed(choice);   // show but disabled
    } else {
      ui.addNormal(choice);   // selectable
    }
  }
  // wait for player selection...
});
```
```csharp [C#]
engine.OnChoice(args => {
    foreach (var choice in args.Context.Options)
    {
        if (choice.Visible == false)
            AddGreyed(choice);   // show but disabled
        else
            AddNormal(choice);   // selectable
    }
    // wait for player selection...
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    for (const auto& choice : ctx->options()) {
        if (choice.visible.has_value() && !choice.visible.value())
            addGreyed(choice);   // show but disabled
        else
            addNormal(choice);   // selectable
    }
    // wait for player selection...
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    for choice in args["context"].options:
        if choice.get("visible") == false:
            add_greyed(choice)   # show but disabled
        else:
            add_normal(choice)   # selectable
    # wait for player selection...
    return Callable()
)
```
:::

### Tutorial — ignorer complètement la visibilité

::: code-group
```ts [TypeScript]
tutorial.onChoice(({ context, next }) => {
  // force-select the first choice, no filtering
  context.selectChoice(context.options[0].id);
  next();
});
```
```csharp [C#]
tutorial.OnChoice(args => {
    // force-select the first choice, no filtering
    args.Context.SelectChoice(args.Context.Options[0].Id);
    args.Next();
    return null;
});
```
```cpp [C++]
tutorial->onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    // force-select the first choice, no filtering
    ctx->selectChoice(ctx->options()[0].id);
    next();
    return {};
});
```
```gdscript [GDScript]
tutorial.on_choice(func(args):
    # force-select the first choice, no filtering
    args["context"].select_choice(args["context"].options[0]["id"])
    args["next"].call()
    return Callable()
)
```
:::

## Partager l'évaluateur

Avec `onResolveCondition`, un seul callback gère **à la fois** la visibilité des choix et la pré-évaluation des condition blocks. Plus besoin de dupliquer la logique :

<!--@include: ../../_shared/choice-reusable-filter.md-->

::: tip Pourquoi un seul callback?
Avant `onResolveCondition`, la même logique `gameState.check(...)` devait être enregistrée séparément dans `onResolveCondition` et `onCondition`. Avec le resolver unifié, c'est un seul callback — le engine gère les deux automatiquement.
:::

## Avancé : tagger soi-même

Si un resolver global n'est pas souhaité, `LsdeUtils.tagOptionVisibility` fait le même travail à la
demande. Il prend **deux** arguments — les options et l'évaluateur — et rend la liste **entière**,
taguée :

::: code-group
```ts [TypeScript]
import { LsdeUtils, type ConditionEvaluator } from '@lsde/dialog-engine';

const evaluator: ConditionEvaluator = t => gameState.check(t.dict, t.entry, t.op, t.value);
const offered = LsdeUtils.tagOptionVisibility(block.options, evaluator);
```
```csharp [C#]
var offered = LsdeUtils.TagOptionVisibility(
    block.Options,
    t => GameState.Check(t.Dict, t.Entry, t.Op, t.Value));
```
```cpp [C++]
lsde::ConditionEvaluatorFn evaluator = [](const lsde::ConditionTest& t) {
    return gameState.check(t.dict, t.entry, t.op, t.value);
};
auto offered = lsde::LsdeUtils::TagOptionVisibility(block->options, &evaluator);
```
```gdscript [GDScript]
var offered = LsdeUtils.tag_option_visibility(
    block.get("options", []),
    func(t): return GameState.check(t["dict"], t["entry"], t["op"], t["value"]))
```
:::

::: warning Les conditions `choice:` ne sont pas résolues pour vous ici
Le raccourci qui les traitait automatiquement n'existe pas : sans le engine dans la boucle, un test
sur le dictionnaire réservé `choice` arrive à **votre** évaluateur. Redirigez-le vers la scène, qui
tient l'historique :

```ts
const evaluator: ConditionEvaluator = t =>
  LsdeUtils.isChoiceCondition(t) ? scene.evaluateCondition(t)
                                 : gameState.check(t.dict, t.entry, t.op, t.value);
```
:::

`tagOptionVisibility` remplace le `filterVisibleChoices` de la v1, qui **raccourcissait** la liste
et vous enlevait la possibilité d'afficher une réponse verrouillée.

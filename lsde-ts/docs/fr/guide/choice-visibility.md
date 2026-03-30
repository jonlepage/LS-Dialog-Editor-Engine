# Visibilité des choix

## Aperçu

Quand un block CHOICE est dispatché, `context.choices` contient toujours **tous** les choix définis dans le blueprint — rien n'est pré-filtré. Le engine n'enlève jamais de choix du array.

Pour du filtrage de visibilité (ex. cacher des choix basés sur le game state ou des sélections précédentes), le engine fournit un système de **tagging opt-in**. Un filter est installé une seule fois, et le engine tag chaque choix avec `visible: true | false` avant que le handler `onChoice` le reçoive.

## Setup

Enregistrez un choice filter sur le engine — une seule fois, avant de démarrer une scène :

<!--@include: ../../_shared/choice-filter-setup.md-->

Quand le filter est installé, le engine évalue les `visibilityConditions` de chaque choix **avant** d'appeler `onChoice` :

- **Conditions `choice:`** (qui référencent des sélections précédentes du joueur) sont résolues automatiquement par le engine via son historique de choix interne — le callback ne les reçoit jamais.
- **Conditions de game-state** (tout le reste) sont déléguées au callback.
- Le chaining avec `&` (AND) et `|` (OR) fonctionne correctement entre les deux types.

## Filtrage dans onChoice

Dans le handler, le filtrage se fait avec une seule ligne :

<!--@include: ../../_shared/choice-visibility-handler.md-->

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

<!--@include: ../../_shared/choice-reusable-filter.md-->

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

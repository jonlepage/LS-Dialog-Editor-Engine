# StateBridge

Le `StateBridge` est le pont entre le moteur de dialogue et l'état de votre jeu. C'est l'interface que vous implémentez pour connecter la logique du blueprint à votre application.

## Interface

```ts
interface StateBridge {
  evaluateCondition: (condition: ExportCondition) => boolean;
  executeAction: (action: ExportAction, signature?: ActionSignature) => void;
  resolveDictionary: (groupLabel: string, rowKey: string) => string | number | boolean;
}
```

## evaluateCondition

Appelé automatiquement par le moteur pour :
- **Blocs CONDITION** — quand aucun `onCondition` handler n'est enregistré
- **Visibility conditions** — pour filtrer les choix visibles dans un bloc CHOICE

```ts
evaluateCondition: (cond) => {
  // cond.key      — clé de la condition (ex: "has_item")
  // cond.operator — opérateur (ex: "==", "!=", ">")
  // cond.value    — valeur à comparer
  // cond.chain    — '|' (OR) ou '&' (AND) avec la condition précédente

  const gameValue = gameState.get(cond.key);
  switch (cond.operator) {
    case '==': return gameValue === cond.value;
    case '!=': return gameValue !== cond.value;
    case '>':  return Number(gameValue) > Number(cond.value);
    default:   return false;
  }
}
```

## executeAction

Appelé automatiquement pour les blocs ACTION sans handler `onAction`. La signature correspondante est passée si elle existe dans le blueprint.

```ts
executeAction: (action, signature) => {
  // action.actionId — identifiant de l'action (ex: "set_flag")
  // action.params   — paramètres [(string | number | boolean)]
  // signature       — définition complète avec labels des params

  switch (action.actionId) {
    case 'set_flag':
      gameState.set(action.params[0] as string, action.params[1]);
      break;
    case 'play_sound':
      audio.play(action.params[0] as string);
      break;
  }
}
```

## resolveDictionary

Résout une valeur de dictionnaire par son groupe et sa clé. Utilisé par le moteur lors de l'évaluation des conditions et paramètres d'actions.

```ts
resolveDictionary: (groupLabel, rowKey) => {
  // Lookup dans vos données de jeu
  return gameData.dictionaries[groupLabel]?.[rowKey] ?? rowKey;
}
```

## Quand le StateBridge est-il utilisé ?

| Situation | Méthode appelée |
|-----------|-----------------|
| Bloc CONDITION sans handler | `evaluateCondition()` |
| Filtrage `visibilityConditions` sur un choix | `evaluateCondition()` |
| Bloc ACTION sans handler | `executeAction()` |
| Résolution de paramètre dictionnaire | `resolveDictionary()` |

::: tip
Si vous enregistrez un handler `onCondition` ou `onAction`, c'est **votre handler** qui prend le contrôle. Le StateBridge n'est pas appelé automatiquement dans ce cas — c'est à vous de l'invoquer si nécessaire.
:::

## Chaînage des conditions

Quand un bloc CONDITION ou un choix a plusieurs conditions, le moteur les évalue **de gauche à droite** sans précédence d'opérateur :

```
[cond1]  →  résultat initial
[cond2, chain='&']  →  résultat AND cond2
[cond3, chain='|']  →  (résultat précédent) OR cond3
```

Règles :
- **Array vide** → `true` (pas de conditions = passe)
- **Première condition** → son résultat brut (le champ `chain` est ignoré)
- **`chain = '&'`** ou **absent** → AND avec le résultat accumulé
- **`chain = '|'`** → OR avec le résultat accumulé
- **Pas de précédence** — `A AND B OR C` s'évalue comme `(A AND B) OR C`

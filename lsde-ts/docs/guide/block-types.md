# Types de blocs

Le moteur supporte 5 types de blocs. Chacun a un handler dédié et un contexte spécifique.

## DIALOG

Affiche du texte parlé par un personnage.

```ts
interface DialogBlock {
  type: 'DIALOG';
  structureKey?: string;
  content?: string;
  dialogueText?: Record<string, string>; // Texte par locale
  // + champs communs (uuid, label, properties, metadata, nativeProperties)
}
```

**Handler :**

```ts
engine.onDialog(({ block, context, next }) => {
  const char = context.character;       // BlockCharacter | null
  const text = block.dialogueText?.['fr'];

  // Si portPerCharacter est activé :
  if (block.nativeProperties?.portPerCharacter && char) {
    context.resolveCharacterPort(char.name);
  }

  next();
});
```

## CHOICE

Présente des options sélectionnables au joueur.

```ts
interface ChoiceBlock {
  type: 'CHOICE';
  choices?: ChoiceItem[];
  note?: string;
}
```

**Handler :**

```ts
engine.onChoice(({ context, next }) => {
  // context.choices contient seulement les choix visibles
  console.log(context.choices);

  // Sélectionner un choix par UUID
  context.selectChoice(context.choices[0].uuid);
  next();
});
```

## CONDITION

Évalue une logique pour brancher le flux. Si aucun handler n'est enregistré, le moteur utilise `StateBridge.evaluateCondition()` automatiquement.

```ts
interface ConditionBlock {
  type: 'CONDITION';
  conditions?: ExportCondition[];
  note?: string;
}
```

**Handler :**

```ts
engine.onCondition(({ block, context, next }) => {
  // true → port index 0, false → port index 1
  context.resolve(true);
  next();
});
```

## ACTION

Déclenche des changements d'état. Si aucun handler n'est enregistré, le moteur utilise `StateBridge.executeAction()` automatiquement.

```ts
interface ActionBlock {
  type: 'ACTION';
  actions?: ExportAction[];
  note?: string;
}
```

**Handler :**

```ts
engine.onAction(({ block, context, next }) => {
  context.resolve();   // Succès → port "then"
  // ou context.reject(error); → port "catch" (fallback "then")
  next();
});
```

## NOTE

Bloc de documentation pour le designer. Jamais exécuté par le moteur.

## Propriétés communes

Tous les blocs partagent `BlueprintBlockBase` :

| Champ | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Identifiant unique |
| `type` | `BlockType` | Type discriminant |
| `label` | `string?` | Nom lisible |
| `parentLabels` | `string[]?` | Labels parents (hiérarchie) |
| `properties` | `BlockProperty[]` | Propriétés clé-valeur |
| `userProperties` | `Record<...>?` | Propriétés utilisateur libres |
| `nativeProperties` | `NativeProperties?` | Propriétés d'exécution (async, delay, etc.) |
| `metadata` | `BlockMetadata?` | Métadonnées d'affichage |
| `isStartBlock` | `boolean?` | Marque le bloc d'entrée |

### NativeProperties

| Champ | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | Exécution sur une track asynchrone |
| `delay` | `number?` | Délai avant exécution (secondes) |
| `timeout` | `number?` | Timeout d'exécution |
| `debug` | `boolean?` | Mode debug |
| `portPerCharacter` | `boolean?` | Un port de sortie par personnage |
| `skipIfMissingActor` | `boolean?` | Skip si l'acteur est absent |
| `followNarrative` | `boolean?` | Track async suit la narrative principale |

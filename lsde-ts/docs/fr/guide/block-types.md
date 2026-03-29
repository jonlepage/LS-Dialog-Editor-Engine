# Types de blocks

Le engine supporte 5 types de blocks. Chacun a un handler dédié et un context spécifique au type.

Les 4 handlers de blocks de contenu (`onDialog`, `onChoice`, `onCondition`, `onAction`) sont **required** — le engine valide leur présence à l'appel de `start()`.

## DIALOG

Affiche du texte dit par un personnage. Le personnage est résolu par le callback `onResolveCharacter`.

<!--@include: ../../_shared/block-dialog.md-->

`resolveCharacterPort()` match par **UUID du personnage en premier**, puis par **nom** comme fallback.

## CHOICE

Présente des options sélectionnables au joueur. Quand [`setChoiceFilter()`](/fr/guide/choice-visibility) est configuré, chaque choice est taggé avec `visible: true | false`.

<!--@include: ../../_shared/block-choice.md-->

Voir [Choice Visibility](/fr/guide/choice-visibility) pour le système complet de tagging opt-in.

## CONDITION

Évalue de la logique pour brancher le flow. Le handler **doit** appeler `resolve(result)` — `true` suit le port index 0, `false` suit le port index 1.

<!--@include: ../../_shared/block-condition.md-->

::: tip Conditions choice:
Les conditions avec des clés qui commencent par `choice:` font référence à une sélection précédente du joueur. Utilise `scene.evaluateCondition(cond)` pour les résoudre — le engine check son historique de choix interne automatiquement.
:::

## ACTION

Trigger des changements de game state. Appeler `resolve()` pour le succès ou `reject(error)` pour un échec.

<!--@include: ../../_shared/block-action.md-->

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

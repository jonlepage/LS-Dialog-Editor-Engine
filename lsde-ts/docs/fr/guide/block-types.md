# Types de blocks

Les blocks sont les briques d'une scène de dialogue — chaque nœud dans le graphe de l'éditeur est un block. Le engine route le flow de block en block et appelle le handler correspondant à chaque type.

Il existe 5 types : **Dialog**, **Choice**, **Condition**, **Action** et **Note**. Les quatre premiers sont des blocks de contenu avec un handler dédié (`onDialog`, `onChoice`, `onCondition`, `onAction`) — les quatre sont **required** et validés à l'appel de `start()`. Les blocks Note sont automatiquement ignorés.

Les handlers se déclinent en deux niveaux : les **global handlers** (enregistrés sur le engine) couvrent toutes les scènes et suffisent pour la plupart des jeux. Les **scene handlers** (enregistrés sur un [`SceneHandle`](/fr/api-ref/classes/SceneHandle)) peuvent compléter ou remplacer les globaux pour une scène spécifique. Voir [Handlers](/fr/guide/handlers) pour le détail.

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

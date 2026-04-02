# Types de blocks

Les blocks sont les briques d'une scène de dialogue — chaque nœud dans le graphe de l'éditeur est un block. Le engine route le flow de block en block et appelle le handler correspondant à chaque type.

Il existe 5 types : **Dialog**, **Choice**, **Condition**, **Action** et **Note**. Les quatre premiers sont des blocks de contenu avec un handler dédié (`onDialog`, `onChoice`, `onCondition`, `onAction`) — les quatre sont **required** et validés à l'appel de `start()`. Les blocks Note sont automatiquement ignorés.

Les handlers se déclinent en deux niveaux : les **global handlers** (enregistrés sur le engine) couvrent toutes les scènes et suffisent pour la plupart des jeux. Les **scene handlers** (enregistrés sur un [`SceneHandle`](/api-ref/interfaces/SceneHandle)) peuvent compléter ou remplacer les globaux pour une scène spécifique. Voir [Handlers](/fr/guide/handlers) pour le détail.

## DIALOG

Un block dialog représente une réplique — un personnage qui parle, un narrateur, un texte à l'écran. Le engine résout le personnage via le callback `onResolveCharacter` et l'expose dans `context.character`. Un handler dialog typique crée une instance de texte dans le jeu (textbox, bulle, sous-titre…), attend que le joueur ou une animation termine, puis appelle `next()` pour avancer le engine. La fonction de cleanup optionnelle permet de nettoyer les effets de bord quand le engine passe au bloc suivant.

<!--@include: ../../_shared/block-dialog.md-->

Quand le narrative designer assigne un output dédié par personnage ([`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)), le handler doit appeler `resolveCharacterPort()` pour indiquer au engine quel chemin suivre lors du `next()`.

## CHOICE

Un block choice représente un embranchement où le joueur choisit — un menu de réponses, des options de dialogue. Le `context.choices` contient toutes les options disponibles. Quand [`onResolveCondition()`](/fr/guide/choice-visibility) est configuré, chaque option est taggée `visible: true | false` — le handler filtre et affiche celles qu'il veut. Après l'interaction du joueur, `selectChoice(uuid)` indique au engine quel chemin suivre, puis `next()` avance le flow.

<!--@include: ../../_shared/block-choice.md-->

Voir [Choice Visibility](/fr/guide/choice-visibility) pour le système complet de tagging opt-in.

## CONDITION

Un block condition est un aiguillage invisible — il évalue l'état du jeu et envoie le flow sur l'un de deux chemins sans que le joueur le voie. Le handler évalue les conditions du block (variables, flags, inventaire…) puis appelle `context.resolve(result)` — `true` suit le port 0, `false` suit le port 1. Les conditions dont la clé commence par `choice:` référencent un choix précédent du joueur — `scene.evaluateCondition(cond)` les résout automatiquement via l'historique interne.

Le block condition supporte deux modes d'évaluation :

- **Mode switch** (par défaut) : les groupes de conditions sont évalués en séquence. Le premier groupe qui match route le flow vers son port (`true`/`case_N`). Si aucun ne match, le flow suit le port `false`/`default`. C'est un `switch/case` avec break implicite.

- **Mode dispatcher** ([`enableDispatcher`](/api-ref/interfaces/NativeProperties#enabledispatcher) `= true`) : **tous** les groupes qui matchent déclenchent leur port simultanément en tant que tracks async. Le port `false`/`default` devient la track principale de continuation ("Continue") et est **toujours exécuté**, qu'il y ait des matchs ou non. Les blocks connectés aux ports de condition **doivent** être async. C'est un pattern "fire & dispatch" — idéal pour déclencher des réactions parallèles (multi-NPC, événements simultanés) sans bloquer le flow principal.

<!--@include: ../../_shared/block-condition.md-->

## ACTION

Un block action déclenche des effets de bord dans le jeu — donner un item, jouer un son, activer un flag. Chaque action référence un `actionId` que le développeur mappe vers ses propres systèmes. Le handler exécute la liste d'actions puis appelle `context.resolve()` pour suivre le port "then", ou `context.reject(error)` pour suivre le port "catch" (fallback sur "then" si aucun "catch" n'existe).

<!--@include: ../../_shared/block-action.md-->

## NOTE

Un block note est un pense-bête pour le narrative designer — commentaires, rappels, contexte. Il est automatiquement ignoré pendant la traversée. Il est techniquement possible d'intercepter un block note via [`onBeforeBlock`](/fr/guide/lifecycle), mais c'est déconseillé — le block action devrait couvrir tous vos besoins en effets de bord.

## Propriétés communes

Tous les blocks partagent ces champs de base ([`BlueprintBlockBase`](/api-ref/interfaces/BlueprintBlockBase)) :

| Champ | Type | Description |
|-------|------|-------------|
| [`uuid`](/api-ref/interfaces/BlueprintBlockBase#uuid) | `string` | Identifiant unique |
| [`type`](/api-ref/interfaces/BlueprintBlockBase#type) | `BlockType` | Type discriminant |
| [`label`](/api-ref/interfaces/BlueprintBlockBase#label) | `string?` | Nom lisible par un humain |
| [`parentLabels`](/api-ref/interfaces/BlueprintBlockBase#parentlabels) | `string[]?` | Hiérarchie des dossiers parents dans l'éditeur |
| [`properties`](/api-ref/interfaces/BlueprintBlockBase#properties) | `BlockProperty[]` | Propriétés clé-valeur |
| [`userProperties`](/api-ref/interfaces/BlueprintBlockBase#userproperties) | `Record?` | Propriétés utilisateur libres |
| [`nativeProperties`](/api-ref/interfaces/BlueprintBlockBase#nativeproperties) | `NativeProperties?` | Propriétés d'exécution |
| [`metadata`](/api-ref/interfaces/BlueprintBlockBase#metadata) | `BlockMetadata?` | Metadata d'affichage (personnages, tags, couleur) |
| [`isStartBlock`](/api-ref/interfaces/BlueprintBlockBase#isstartblock) | `boolean?` | Marque le block d'entrée |

### NativeProperties

| Champ | Type | Description |
|-------|------|-------------|
| [`isAsync`](/api-ref/interfaces/NativeProperties#isasync) | `boolean?` | Exécuter sur un track async parallèle |
| [`delay`](/api-ref/interfaces/NativeProperties#delay) | `number?` | Délai avant exécution (consommé par `onBeforeBlock`) |
| [`timeout`](/api-ref/interfaces/NativeProperties#timeout) | `number?` | Timeout d'exécution |
| [`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter) | `boolean?` | Un output port par personnage dans les metadata |
| [`skipIfMissingActor`](/api-ref/interfaces/NativeProperties#skipifmissingactor) | `boolean?` | Ignorer le block si l'acteur est absent |
| [`debug`](/api-ref/interfaces/NativeProperties#debug) | `boolean?` | Flag de debug pour l'éditeur |
| [`waitForBlocks`](/api-ref/interfaces/NativeProperties#waitforblocks) | `string[]?` | UUIDs de blocks qui doivent être visités avant que ce block puisse progresser |
| [`waitInput`](/api-ref/interfaces/NativeProperties#waitinput) | `boolean?` | Flag passif pour contrôle d'input joueur explicite |
| [`enableDispatcher`](/api-ref/interfaces/NativeProperties#enabledispatcher) | `boolean?` | Mode dispatcher : toutes les conditions valides déclenchent leur port async, le port false/default devient la track de continuation |

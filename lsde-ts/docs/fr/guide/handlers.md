# Handlers

## Handlers

Les handlers sont le pont entre le engine et votre jeu. Ils fonctionnent comme des observateurs — vous abonnez une fonction, et le engine l'exécute quand l'événement correspondant se produit. C'est à travers eux que vous déclenchez les bons comportements dans votre moteur : afficher du texte, jouer une animation, évaluer un état, etc.

Le engine expose les handlers suivants :

| Handler | Niveau | Description |
|---------|--------|-------------|
| [`onDialog`](/api-ref/classes/DialogueEngine#ondialog) | global / scene | Block dialog — afficher du texte |
| [`onChoice`](/api-ref/classes/DialogueEngine#onchoice) | global / scene | Block choice — présenter des choix |
| [`onCondition`](/api-ref/classes/DialogueEngine#oncondition) | global / scene | Block condition — évaluer et brancher |
| [`onAction`](/api-ref/classes/DialogueEngine#onaction) | global / scene | Block action — déclencher des effets |
| [`onResolveCharacter`](/api-ref/classes/DialogueEngine#onresolvecharacter) | global / scene | Résoudre quel personnage parle |
| [`onBeforeBlock`](/api-ref/classes/DialogueEngine#onbeforeblock) | global | Avant chaque block (delay, animations d'entrée…) |
| [`onValidateNextBlock`](/api-ref/classes/DialogueEngine#onvalidatenextblock) | global | Valider avant de progresser vers un block |
| [`onInvalidateBlock`](/api-ref/classes/DialogueEngine#oninvalidateblock) | global | Réagir quand la validation échoue |
| [`onSceneEnter`](/api-ref/classes/DialogueEngine#onsceneenter) | global / scene | Une scène démarre |
| [`onSceneExit`](/api-ref/classes/DialogueEngine#onsceneexit) | global / scene | Une scène se termine |
| [`onBlock`](/api-ref/interfaces/SceneHandle#onblock) | scene | Override un block spécifique par UUID |
| [`onDialogId`](/api-ref/interfaces/SceneHandle#ondialogid) | scene | Override un block DIALOG spécifique par UUID (type-safe) |
| [`onChoiceId`](/api-ref/interfaces/SceneHandle#onchoiceid) | scene | Override un block CHOICE spécifique par UUID (type-safe) |
| [`onConditionId`](/api-ref/interfaces/SceneHandle#onconditionid) | scene | Override un block CONDITION spécifique par UUID (type-safe) |
| [`onActionId`](/api-ref/interfaces/SceneHandle#onactionid) | scene | Override un block ACTION spécifique par UUID (type-safe) |
| [`setChoiceFilter`](/api-ref/classes/DialogueEngine#setchoicefilter) | global | Évaluateur de visibilité des choix |

Les 4 premiers (`onDialog`, `onChoice`, `onCondition`, `onAction`) sont **required** — le engine valide leur présence à l'appel de `start()` et throw une erreur descriptive si un manque.

<!--@include: ../../_shared/handler-basic.md-->

## Two-Tier Handler System

Le engine résout les handlers sur deux niveaux :

- **Global handlers** — enregistrés sur le engine, ils définissent le comportement par défaut de chaque scène. Ils suffisent dans la majorité des cas.
- **Scene handlers** — enregistrés sur un [`SceneHandle`](/api-ref/interfaces/SceneHandle) spécifique, ils permettent de court-circuiter ou d'étendre le comportement par défaut quand une scène nécessite un rendu ou un contrôle différent. C'est rare, mais disponible.

Quand un block est dispatché, le engine résout le handler dans cet ordre :
1. `handle.onBlock(uuid)` ou `handle.onDialogId(uuid)` / `handle.onActionId(uuid)` / ... — override spécifique à un block
2. `handle.onDialog()` / `handle.onChoice()` / ... — handler de type au niveau scène
3. `engine.onDialog()` / `engine.onChoice()` / ... — handler global

Quand les deux niveaux sont présents, les deux s'exécutent en séquence — scène d'abord, puis global — sauf si le scene handler appelle `context.preventGlobalHandler()` pour supprimer le passage global.

<!--@include: ../../_shared/handler-tier1.md-->

## Character Resolution

Le système de résolution de personnage est optionnel. En enregistrant un callback `onResolveCharacter`, le engine l'invoque avant chaque block qui contient des personnages dans ses `metadata.characters`. Le callback reçoit la liste des personnages assignés au block et retourne celui qui doit être actif — ou `undefined` si aucun n'est disponible. Le personnage résolu est ensuite accessible via `context.character` dans tous les handlers.

C'est le point d'intégration idéal pour interroger l'état de votre jeu : vérifier si un personnage est présent dans la scène, en vie, dans le champ de la caméra, etc. Retourner `undefined` ouvre la porte à plusieurs stratégies : sauter le block via [`skipIfMissingActor`](/api-ref/interfaces/NativeProperties#skipifmissingactor), annuler la scène via `handle.cancel()`, ou gérer le cas directement dans le handler.

<!--@include: ../../_shared/handler-character.md-->

## Scene Lifecycle

Les callbacks `onSceneEnter` et `onSceneExit` permettent de réagir au démarrage et à la fin d'une scène — activer un mode cinématique, arrêter les NPC, préparer l'UI, nettoyer les ressources, etc. Ils sont disponibles au niveau global (sur le engine) et au niveau scène (via `handle.onEnter()` / `handle.onExit()`). Le scene handler remplace le global s'il est défini.

<!--@include: ../../_shared/handler-lifecycle.md-->

## Block Override

`onBlock(uuid)` permet de cibler un block précis par son identifiant pour lui attribuer un handler dédié. C'est un cas d'usage rare — les handlers génériques couvrent la grande majorité des besoins — mais pour des scénarios très spécifiques où un block individuel nécessite un comportement distinct, c'est disponible.

<!--@include: ../../_shared/handler-block-override.md-->

## Type-Safe Block Override

`onDialogId(uuid)`, `onChoiceId(uuid)`, `onConditionId(uuid)` et `onActionId(uuid)` sont des alternatives type-safe à `onBlock(uuid)`. Ils fonctionnent exactement de la même façon — même priorité, même support de `preventGlobalHandler` — mais le handler reçoit le type de block spécialisé et le contexte au lieu de l'union générique.

Utilisez-les quand vous connaissez le type du block au moment de l'enregistrement et que vous voulez l'autocomplétion complète sur `block` et `context`.

<!--@include: ../../_shared/handler-block-override-typed.md-->

## Visual Reference

### Two-Tier Handler Dispatch

```mermaid
flowchart TD
    A[block dispatched] --> B{resolve scene handler}
    B --> B1{"onBlock(uuid) /\nonDialogId(uuid) etc.?"}
    B1 -- found --> S
    B1 -- not found --> B2{"handle.onDialog() etc.?"}
    B2 -- found --> S
    B2 -- not found --> G
    S[execute scene handler] --> D{preventGlobalHandler?}
    D -- yes --> Z[done]
    D -- no --> G["execute global handler\nengine.onDialog() etc."]
    G --> Z
```

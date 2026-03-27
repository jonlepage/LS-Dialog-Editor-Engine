# Handlers & Lifecycle

## Handlers required

Le engine est une machine de traversée de graphe — il walk les nodes et les dispatch au code des handlers. Les 4 handlers de contenu sont required parce que sans eux le engine n'a aucun output :

- `onDialog` — Réagir au texte de dialogue
- `onChoice` — Présenter des choix au joueur
- `onCondition` — Évaluer des conditions pour brancher le flow
- `onAction` — Exécuter des effets côté jeu

À l'appel de `handle.start()`, le engine valide que les 4 sont enregistrés (soit au niveau du engine ou de la scene). S'il en manque, il throw une erreur descriptive qui liste les handlers manquants.

::: code-group
```ts [TypeScript]
engine.onDialog(handler);
engine.onChoice(handler);
engine.onCondition(handler);
engine.onAction(handler);

const handle = engine.scene(sceneId);
handle.start(); // ✓ All 4 registered — scene starts
```
```csharp [C#]
engine.OnDialog(handler);
engine.OnChoice(handler);
engine.OnCondition(handler);
engine.OnAction(handler);

var handle = engine.Scene(sceneId);
handle.Start(); // ✓ All 4 registered — scene starts
```
```cpp [C++]
engine.onDialog(handler);
engine.onChoice(handler);
engine.onCondition(handler);
engine.onAction(handler);

auto handle = engine.scene(sceneId);
handle->start(); // ✓ All 4 registered — scene starts
```
```gdscript [GDScript]
engine.on_dialog(handler)
engine.on_choice(handler)
engine.on_condition(handler)
engine.on_action(handler)

var handle = engine.scene(scene_id)
handle.start() # ✓ All 4 registered — scene starts
```
:::

## Système de handlers two-tier

Le engine utilise un système de handlers à deux niveaux :

1. **Tier 1 — Global (engine-level)** : enregistré sur `DialogueEngine` via `onDialog()`, `onChoice()`, etc.
2. **Tier 2 — Scene-level** : enregistré sur un `SceneHandle` via `handle.onDialog()`, etc.

Quand un block est dispatché :
1. Le scene handler (Tier 2) est callé en premier, s'il existe.
2. Le global handler (Tier 1) est ensuite callé, **sauf si** le scene handler a callé `context.preventGlobalHandler()`.

::: code-group
```ts [TypeScript]
// Tier 1 — global
engine.onDialog(({ block, context, next }) => {
  console.log('Global dialog handler');
  next();
});

// Tier 2 — scene-specific
const handle = engine.scene(sceneId);
handle.onDialog(({ block, context, next }) => {
  console.log('Scene-specific dialog handler');
  context.preventGlobalHandler();
  next();
});
handle.start();
```
```csharp [C#]
// Tier 1 — global
engine.OnDialog(args => {
    Console.WriteLine("Global dialog handler");
    args.Next();
    return null;
});

// Tier 2 — scene-specific
var handle = engine.Scene(sceneId);
handle.OnDialog(args => {
    Console.WriteLine("Scene-specific dialog handler");
    args.Context.PreventGlobalHandler();
    args.Next();
    return null;
});
handle.Start();
```
```cpp [C++]
// Tier 1 — global
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::cout << "Global dialog handler\n";
    next();
    return {};
});

// Tier 2 — scene-specific
auto handle = engine.scene(sceneId);
handle->onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::cout << "Scene-specific dialog handler\n";
    ctx->preventGlobalHandler();
    next();
    return {};
});
handle->start();
```
```gdscript [GDScript]
# Tier 1 — global
engine.on_dialog(func(args):
    print("Global dialog handler")
    args["next"].call()
    return Callable()
)

# Tier 2 — scene-specific
var handle = engine.scene(scene_id)
handle.on_dialog(func(args):
    print("Scene-specific dialog handler")
    args["context"].prevent_global_handler()
    args["next"].call()
    return Callable()
)
handle.start()
```
:::

::: info Priorité des handlers
Quand un block est dispatché, le engine résout le handler dans cet ordre de priorité :
1. `handle.onBlock(uuid)` — override spécifique à un block par UUID
2. `handle.onDialog()` / `handle.onChoice()` / ... — override de type pour la scene
3. `engine.onDialog()` / `engine.onChoice()` / ... — handler global

Si un scene handler (Tier 2) existe, le global handler (Tier 1) est aussi callé **après**, sauf si `context.preventGlobalHandler()` a été callé.
:::

## Résolution de personnage

Le engine résout un personnage pour chaque block qui a `metadata.characters`. Le défaut retourne le premier personnage de la liste.

::: code-group
```ts [TypeScript]
// Engine-level — applies to all scenes
engine.onResolveCharacter((characters) => {
  return party.getActiveLeader(characters);
});

// Scene-level override
const handle = engine.scene(sceneId);
handle.onResolveCharacter((characters) => {
  return battle.getActiveUnit(characters);
});
```
```csharp [C#]
engine.OnResolveCharacter(chars => party.GetActiveLeader(chars));

var handle = engine.Scene(sceneId);
handle.OnResolveCharacter(chars => battle.GetActiveUnit(chars));
```
```cpp [C++]
engine.onResolveCharacter([](const auto& chars) {
    return party.getActiveLeader(chars);
});

auto handle = engine.scene(sceneId);
handle->onResolveCharacter([](const auto& chars) {
    return battle.getActiveUnit(chars);
});
```
```gdscript [GDScript]
engine.on_resolve_character(func(chars):
    return party.get_active_leader(chars)
)

var handle = engine.scene(scene_id)
handle.on_resolve_character(func(chars):
    return battle.get_active_unit(chars)
)
```
:::

Le personnage résolu est disponible via `context.character` dans tous les handlers.

## Historique des choix

Le engine track chaque choix que le joueur fait pendant une scene. Cet historique est utilisé en interne pour l'évaluation des conditions `choice:`, et est aussi disponible pour le code appelant :

```ts
handle.onExit(({ scene }) => {
  // Map of blockUuid → [choiceUuid, ...]
  const history = scene.getChoiceHistory();

  // Get choices for a specific block
  const picks = scene.getChoice('block-uuid-123'); // string[] | undefined
});
```

## Lifecycle complet

### Ordre d'exécution pour chaque block

1. `onValidateNextBlock` — Validation avant exécution
2. **Cleanup du block précédent** — La fonction de cleanup retournée par le handler du block *précédent*
3. `onBeforeBlock` — Pré-traitement (doit call `resolve()` pour continuer)
4. Handler de type (Tier 2 puis Tier 1)

### Events de scene

```ts
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends (naturally or via cancel)
});
```

## onValidateNextBlock

Intercepte chaque transition de block pour validation :

```ts
engine.onValidateNextBlock(({ nextBlock, fromBlock, port }) => {
  // Return { valid: false, reason: '...' } to block
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Invalid block:', reason);
  scene.cancel(); // Stop the scene
});
```

## onBeforeBlock

Appelé avant chaque block. **`resolve()` doit être appelé** pour continuer :

```ts
engine.onBeforeBlock(({ block, resolve }) => {
  const delay = block.nativeProperties?.delay;
  if (delay) {
    setTimeout(resolve, delay * 1000);
  } else {
    resolve();
  }
});
```

## Fonctions de cleanup

Un handler peut retourner une fonction de cleanup, appelée quand le block est quitté :

```ts
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);
  next();

  return () => {
    // Called when the next block takes over
    element.remove();
  };
});
```

## Block Override

Un `SceneHandle` peut aussi override un block spécifique par UUID :

```ts
const handle = engine.scene(sceneId);
handle.onBlock('block-uuid-123', ({ block, context, next }) => {
  // Handler specific to this block only
  next();
});
```

## Error Boundaries

Chaque call de handler est wrappé dans un try/catch. Si un handler throw :

- L'erreur ne corrompt pas le state du engine
- Pour le main track : la scene finit proprement
- Pour les async tracks : seulement le track affecté est terminé — les autres tracks et le flow principal continuent

C'est compatible cross-language (try/catch en TS, C#, C++, GDScript).

## cancel()

Appeler `scene.cancel()` trigger cette séquence :

1. Tous les **async tracks** sont cancelled
2. La **fonction de cleanup** du block courant est exécutée
3. Le handler `onSceneExit` est callé
4. La scene est marquée comme finished

```ts
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation failed:', reason);
  scene.cancel(); // Cleanup + onSceneExit are called
});
```

## Async Tracks

Quand un block a `nativeProperties.isAsync = true`, le engine crée un **track parallèle** qui run indépendamment du flow principal.

### Comment les tracks sont créés

Pendant la résolution des ports, si plusieurs connections sortantes existent :
- La **première connection non-async** devient la continuation du flow principal
- Les **autres connections** (vers des blocks avec `isAsync`) deviennent des tracks parallèles

### Différences avec le flow principal

- `onBeforeBlock` est **skippé** sur les async tracks — le handler de type est callé directement
- Chaque async track suit seulement **une connection** (pas de branching multi-path)
- Les tracks sont automatiquement cancelled quand la scene finit

### followNarrative

Quand `followNarrative = true` sur un block async :
- Le async track **attend** que le flow principal avance
- Si `next()` a déjà été callé dans le handler, l'avancement en attente s'exécute
- Si `next()` n'a **pas** été callé, le block est **force-advanced** (skippé)

### Ce qui fonctionne dans les async tracks (et ce qui fonctionne pas)

Les async tracks sont parfaits pour des choses qui se passent *en parallèle* de la conversation principale — effets ambient, animations parallèles, réactions de compagnons. Mais il y a des limites.

**DO — effets fire-and-forget :**
| Cas d'utilisation | Pourquoi ça marche |
|---|---|
| Dialogue ambient de NPC ("barks") | Blocks dialog sur un async track — les NPCs commentent, réagissent ou bavardent pendant que la conversation principale continue. Parfait pour rendre le monde vivant. |
| Réactions de compagnons NPC | Un membre du party réagit à ce que le joueur vient de dire — async dialog synchronisé avec followNarrative |
| Jouer des sons ambient ou de la musique | Block action, pas d'interaction joueur nécessaire |
| Trigger des mouvements de caméra | Block action, run en parallèle |
| Animations parallèles | followNarrative synchronise avec le pace du track principal |

**DON'T — interaction joueur ou branching de game logic :**
| Cas d'utilisation | Pourquoi ça casse |
|---|---|
| Block CHOICE dans un async track | Le joueur est déjà en interaction avec le main track — qui répond au choice async? |
| Block CONDITION dans followNarrative | Si force-advanced, la condition résout avec `null` → le port resolver retourne rien → le track finit en silence |
| Changements critiques de game state | Si le async track est cancelled (la scene finit), l'action ne s'exécute jamais |

::: warning Choices dans les async tracks
Un block CHOICE dans un async track implique que le joueur devrait faire une sélection pendant qu'il est déjà engagé avec le dialogue principal. Le seul scénario valide c'est un "choix" piloté par l'IA (ex. un compagnon NPC auto-sélectionne basé sur sa personnalité). Si un async track hit un block CHOICE sans scene-level handler qui auto-sélectionne, le flow va stall ou finir en silence.
:::

### Plusieurs scenes en parallèle

Le engine supporte le fait de runner plusieurs scenes en même temps. Chaque `SceneHandle` a son propre state, ses blocks visités et ses async tracks. Les handlers globaux (Tier 1) sont partagés — utilise l'argument `scene` pour savoir quelle scene appelle :

```ts
engine.onDialog(({ scene, block, context, next }) => {
  // scene tells you WHO is calling
  if (scene === mainDialogue) {
    showMainUI(block);
  } else if (scene === tutorialOverlay) {
    showTutorialBubble(block);
  }
  next();
});

// Start two scenes at once
const mainDialogue = engine.scene('main-quest');
const tutorialOverlay = engine.scene('tutorial-hints');
mainDialogue.start();
tutorialOverlay.start();
```

::: tip Routing par scene
Avec plusieurs scenes concurrentes, il est préférable d'enregistrer des handlers scene-level (Tier 2) sur chaque handle au lieu de router dans le handler global. Meilleure séparation, pas de chaînes `if/else`.
:::

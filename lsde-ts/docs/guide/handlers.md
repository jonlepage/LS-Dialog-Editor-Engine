# Handlers & Lifecycle

## Two-Tier Handler System

Le moteur utilise un système de handlers à deux niveaux :

1. **Tier 1 — Global (engine-level)** : enregistrés sur `DialogueEngine` via `onDialog()`, `onChoice()`, etc.
2. **Tier 2 — Scene-level** : enregistrés sur un `SceneHandle` via `handle.onDialog()`, etc.

Quand un bloc est dispatché :
1. Le handler de scène (Tier 2) est appelé en premier, s'il existe.
2. Le handler global (Tier 1) est ensuite appelé, **sauf** si le handler de scène a appelé `context.preventGlobalHandler()`.

```ts
// Tier 1 — global
engine.onDialog(({ block, context, next }) => {
  console.log('Global dialog handler');
  next();
});

// Tier 2 — scene-specific
const handle = engine.scene(sceneId);
handle.onDialog(({ block, context, next }) => {
  console.log('Scene-specific dialog handler');
  context.preventGlobalHandler(); // Skip le handler global
  next();
});
handle.start();
```

## Lifecycle complet

### Ordre d'exécution pour chaque bloc

1. `onValidateNextBlock` — Validation avant exécution
2. **Cleanup du bloc précédent** — La cleanup function retournée par le handler du bloc *précédent* est exécutée ici, au moment d'entrer dans le nouveau bloc
3. `onBeforeBlock` — Pré-traitement (doit appeler `resolve()` pour continuer)
4. Handler de type (Tier 2 puis Tier 1)

::: info Priorité des handlers
Quand un bloc est dispatché, le moteur résout le handler dans cet ordre de priorité :
1. `handle.onBlock(uuid)` — override spécifique à un bloc par UUID
2. `handle.onDialog()` / `handle.onChoice()` / ... — override par type pour la scène
3. `engine.onDialog()` / `engine.onChoice()` / ... — handler global

Si un handler de scène (Tier 2) existe, le handler global (Tier 1) est aussi appelé **après**, sauf si `context.preventGlobalHandler()` a été appelé.
:::

### Événements de scène

```ts
engine.onSceneEnter(({ scene, context }) => {
  // Appelé quand handle.start() est exécuté
});

engine.onSceneExit(({ scene, context }) => {
  // Appelé quand la scène se termine (naturellement ou par cancel)
});
```

## onValidateNextBlock

Intercepte chaque transition entre blocs pour validation :

```ts
engine.onValidateNextBlock(({ nextBlock, fromBlock, port }) => {
  // Retourner { valid: false, reason: '...' } pour bloquer
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Bloc invalide:', reason);
  scene.cancel(); // Arrêter la scène
});
```

## onBeforeBlock

Appelé avant chaque bloc. **Doit appeler `resolve()`** pour continuer :

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

## Cleanup Functions

Un handler peut retourner une fonction de cleanup, appelée quand on quitte le bloc :

```ts
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);
  next();

  return () => {
    // Appelé quand le bloc suivant prend le relais
    element.remove();
  };
});
```

## Override par bloc

Un `SceneHandle` peut aussi overrider un bloc spécifique par UUID :

```ts
const handle = engine.scene(sceneId);
handle.onBlock('block-uuid-123', ({ block, context, next }) => {
  // Handler spécifique à ce bloc uniquement
  next();
});
```

## Blocs sans handler

| Type | Comportement sans handler |
|------|--------------------------|
| **DIALOG** | Le bloc est visité puis le moteur avance silencieusement au bloc suivant. |
| **CHOICE** | Le bloc est visité puis le moteur avance silencieusement. Aucun choix n'est sélectionné — le flux peut se terminer. |
| **CONDITION** | Le moteur auto-évalue via `StateBridge.evaluateCondition()` et suit le port correspondant. |
| **ACTION** | Le moteur auto-exécute via `StateBridge.executeAction()` pour chaque action du bloc. |
| **NOTE** | Jamais exécuté — les blocs NOTE sont toujours ignorés par le moteur. |

## cancel()

Appeler `scene.cancel()` déclenche cette séquence :

1. Toutes les **tracks asynchrones** sont annulées
2. La **cleanup function** du bloc courant est exécutée
3. Le handler `onSceneExit` est appelé
4. La scène est marquée comme terminée

```ts
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation échouée:', reason);
  scene.cancel(); // Cleanup + onSceneExit sont appelés
});
```

## Tracks asynchrones

Quand un bloc a `nativeProperties.isAsync = true`, le moteur crée une **track parallèle** qui s'exécute indépendamment du flux principal.

### Comment les tracks sont créées

Lors de la résolution de port, si plusieurs connexions sortantes existent :
- La **première connexion non-async** devient la suite du flux principal
- Les **autres connexions** (vers des blocs avec `isAsync`) deviennent des tracks parallèles

### Différences avec le flux principal

- `onBeforeBlock` est **sauté** sur les tracks asynchrones — le handler de type est appelé directement
- Chaque track async ne suit qu'**une seule connexion** (pas de branching multi-path)
- Les tracks sont automatiquement annulées quand la scène se termine

### followNarrative

Quand `followNarrative = true` sur un bloc async :
- La track async **attend** que le flux principal avance
- Si `next()` a déjà été appelé dans le handler, l'avance en attente s'exécute
- Si `next()` n'a **pas** été appelé, le bloc est **force-advanced** (sauté)

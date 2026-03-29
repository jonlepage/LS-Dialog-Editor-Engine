# Lifecycle & Validation

## Lifecycle complet

### Ordre d'exécution pour chaque block

1. `onValidateNextBlock` — Validation avant exécution
2. **Cleanup du block précédent** — La fonction de cleanup retournée par le handler du block *précédent*
3. `onBeforeBlock` — Pré-traitement (doit call `resolve()` pour continuer)
4. Handler de type (Tier 2 puis Tier 1)

### Events de scene

<!--@include: ../../_shared/lifecycle-scene-events.md-->

## onValidateNextBlock

Intercepte chaque transition de block pour validation. Le handler reçoit le **personnage résolu** du prochain block (`nextContext`) et du block précédent (`fromContext`) :

<!--@include: ../../_shared/lifecycle-validate.md-->

### Character Gating

Utilisez `nextContext.character` pour contrôler quels blocks peuvent s'exécuter selon l'état du jeu :

<!--@include: ../../_shared/lifecycle-validate-stunned.md-->

Utilisez `fromContext.character` pour valider les transitions entre personnages (ex: relations, cooldowns). `fromContext` est `null` pour le premier block d'une scène.

## onBeforeBlock

Appelé avant chaque block. **`resolve()` doit être appelé** pour continuer :

<!--@include: ../../_shared/lifecycle-before-block.md-->

## Fonctions de cleanup

Un handler peut retourner une fonction de cleanup, appelée quand le block est quitté :

<!--@include: ../../_shared/lifecycle-cleanup.md-->

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

<!--@include: ../../_shared/lifecycle-invalidate.md-->

## NativeProperties

Execution properties that control how a block is dispatched by the engine:

| Field | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | Execute on a parallel async track |
| `delay` | `number?` | Delay before execution (consumed by `onBeforeBlock`) |
| `timeout` | `number?` | Execution timeout |
| `portPerCharacter` | `boolean?` | One output port per character in metadata |
| `skipIfMissingActor` | `boolean?` | Skip block if referenced actor is absent |
| `debug` | `boolean?` | Debug flag for editor use |
| `waitForBlocks` | `string[]?` | Block UUIDs that must be visited before this block can progress |
| `waitInput` | `boolean?` | Passive flag for explicit player input control |

## Visual Reference

### Block Execution Flow

```mermaid
flowchart TD
    A[processBlock] --> B{NOTE block?}
    B -- yes --> C[skip to next connection]
    B -- no --> D["onValidateNextBlock\n• nextContext.character\n• fromContext.character"]
    D --> E{valid?}
    E -- no --> F[onInvalidateBlock\nscene stops]
    E -- yes --> G["onBeforeBlock\nresolve()"]
    G --> H[type handler\nTier 2 then Tier 1]
    H --> I["next() → advance"]
```

### Character Gating Flow

```mermaid
flowchart TD
    A["block.metadata.characters\n= [Lia, Bob, Sam]"] --> B["onResolveCharacter\ngame returns: Lia"]
    B --> C["onValidateNextBlock\nnextContext.character = Lia\nfromContext.character = prev"]
    C --> D{valid?}
    D -- "Lia OK" --> E["execute block\ncontext.character = Lia"]
    D -- "Lia stunned" --> F["onInvalidateBlock\nscene.cancel()"]
    D -- "undefined\nno character in party" --> F
```

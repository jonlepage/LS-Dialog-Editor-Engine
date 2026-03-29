# Lifecycle & Validation

## Lifecycle complet

### Ordre d'exécution pour chaque block

1. `onValidateNextBlock` — Validation avant exécution
2. **Cleanup du block précédent** — La fonction de cleanup retournée par le handler du block *précédent*
3. `onBeforeBlock` — Pré-traitement (doit call `resolve()` pour continuer)
4. Handler de type (Tier 2 puis Tier 1)

### Events de scene

::: code-group
```ts [TypeScript]
engine.onSceneEnter(({ scene, context }) => {
  // Called when handle.start() is executed
});

engine.onSceneExit(({ scene, context }) => {
  // Called when the scene ends (naturally or via cancel)
});
```
```csharp [C#]
engine.OnSceneEnter(args => {
    // Called when handle.Start() is executed
});

engine.OnSceneExit(args => {
    // Called when the scene ends (naturally or via cancel)
});
```
```cpp [C++]
engine.onSceneEnter([](auto* scene, auto*) {
    // Called when handle->start() is executed
});

engine.onSceneExit([](auto* scene, auto*) {
    // Called when the scene ends (naturally or via cancel)
});
```
```gdscript [GDScript]
engine.on_scene_enter(func(args):
    pass # Called when handle.start() is executed
)

engine.on_scene_exit(func(args):
    pass # Called when the scene ends (naturally or via cancel)
)
```
:::

## onValidateNextBlock

Intercepte chaque transition de block pour validation. Le handler reçoit le **personnage résolu** du prochain block (`nextContext`) et du block précédent (`fromContext`) :

::: code-group
```ts [TypeScript]
engine.onValidateNextBlock(({ nextBlock, fromBlock, nextContext, fromContext }) => {
  return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Invalid block:', reason);
  scene.cancel();
});
```
```csharp [C#]
engine.OnValidateNextBlock(args => {
    // args.NextContext.Character, args.FromContext?.Character
    return new ValidationResult { Valid = true };
});

engine.OnInvalidateBlock(args => {
    Console.Error.WriteLine($"Invalid block: {args.Reason}");
    args.Scene.Cancel();
});
```
```cpp [C++]
engine.onValidateNextBlock([](const auto& args) {
    // args.nextContext.character, args.fromContext.character (check args.hasFromContext)
    return ValidationResult{true};
});

engine.onInvalidateBlock([](auto* scene, const auto& reason) {
    std::cerr << "Invalid block: " << reason << "\n";
    scene->cancel();
});
```
```gdscript [GDScript]
engine.on_validate_next_block(func(args):
    # args["nextContext"]["character"], args["fromContext"]["character"]
    return {"valid": true}
)

engine.on_invalidate_block(func(args):
    printerr("Invalid block: %s" % args["reason"])
    args["scene"].cancel()
)
```
:::

### Character Gating

Utilisez `nextContext.character` pour contrôler quels blocks peuvent s'exécuter selon l'état du jeu :

::: code-group
```ts [TypeScript]
// Block if the character is stunned
engine.onValidateNextBlock(({ nextContext }) => {
  const { character } = nextContext;
  if (!character) return { valid: false, reason: 'no_character' };
  if (game.characterHasStatus(character, 'stunned'))
    return { valid: false, reason: 'character_stunned' };
  return { valid: true };
});
```
```csharp [C#]
engine.OnValidateNextBlock(args => {
    var character = args.NextContext.Character;
    if (character == null)
        return ValidationResult.Fail("no_character");
    if (game.CharacterHasStatus(character, "stunned"))
        return ValidationResult.Fail("character_stunned");
    return ValidationResult.Ok();
});
```
```cpp [C++]
engine.onValidateNextBlock([&game](const auto& args) {
    auto* character = args.nextContext.character;
    if (!character) return ValidationResult{false, "no_character"};
    if (game.characterHasStatus(character, "stunned"))
        return ValidationResult{false, "character_stunned"};
    return ValidationResult{true};
});
```
```gdscript [GDScript]
engine.on_validate_next_block(func(args):
    var character = args["nextContext"]["character"]
    if character == null:
        return {"valid": false, "reason": "no_character"}
    if game.character_has_status(character, "stunned"):
        return {"valid": false, "reason": "character_stunned"}
    return {"valid": true}
)
```
:::

Utilisez `fromContext.character` pour valider les transitions entre personnages (ex: relations, cooldowns). `fromContext` est `null` pour le premier block d'une scène.

## onBeforeBlock

Appelé avant chaque block. **`resolve()` doit être appelé** pour continuer :

::: code-group
```ts [TypeScript]
engine.onBeforeBlock(({ block, resolve }) => {
  const delay = block.nativeProperties?.delay;
  if (delay) {
    setTimeout(resolve, delay * 1000);
  } else {
    resolve();
  }
});
```
```csharp [C#]
engine.OnBeforeBlock(args => {
    var delay = args.Block.NativeProperties?.Delay;
    if (delay.HasValue)
        Task.Delay((int)(delay.Value * 1000)).ContinueWith(_ => args.Resolve());
    else
        args.Resolve();
    return null;
});
```
```cpp [C++]
engine.onBeforeBlock([](auto* block, auto resolve) {
    auto delay = block->nativeProperties ? block->nativeProperties->delay : std::nullopt;
    if (delay.has_value()) {
        scheduleTimer(delay.value() * 1000, [resolve]() { resolve(); });
    } else {
        resolve();
    }
});
```
```gdscript [GDScript]
engine.on_before_block(func(args):
    var delay = args["block"].get("nativeProperties", {}).get("delay", 0)
    if delay > 0:
        await get_tree().create_timer(delay).timeout
    args["resolve"].call()
)
```
:::

## Fonctions de cleanup

Un handler peut retourner une fonction de cleanup, appelée quand le block est quitté :

::: code-group
```ts [TypeScript]
engine.onDialog(({ block, next }) => {
  const element = showDialogUI(block);
  next();

  return () => {
    element.remove(); // Called when the next block takes over
  };
});
```
```csharp [C#]
engine.OnDialog(args => {
    var element = ShowDialogUI(args.Block);
    args.Next();

    return () => element.SetActive(false);
});
```
```cpp [C++]
engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    auto* element = showDialogUI(block);
    next();

    return [element]() { element->remove(); };
});
```
```gdscript [GDScript]
engine.on_dialog(func(args):
    var element = show_dialog_ui(args["block"])
    args["next"].call()

    return func(): element.queue_free()
)
```
:::

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

::: code-group
```ts [TypeScript]
engine.onInvalidateBlock(({ scene, reason }) => {
  console.error('Validation failed:', reason);
  scene.cancel();
});
```
```csharp [C#]
engine.OnInvalidateBlock(args => {
    Console.Error.WriteLine($"Validation failed: {args.Reason}");
    args.Scene.Cancel();
});
```
```cpp [C++]
engine.onInvalidateBlock([](auto* scene, const auto& reason) {
    std::cerr << "Validation failed: " << reason << "\n";
    scene->cancel();
});
```
```gdscript [GDScript]
engine.on_invalidate_block(func(args):
    printerr("Validation failed: %s" % args["reason"])
    args["scene"].cancel()
)
```
:::

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

::: code-group
```ts [TypeScript]
// required — the engine won't start without these
engine.onDialog(dialogHandler);
engine.onChoice(choiceHandler);
engine.onCondition(conditionHandler);
engine.onAction(actionHandler);

// optional — lifecycle, validation, pre-execution
engine.onBeforeBlock(beforeBlockHandler);
engine.onResolveCharacter(resolveCharacterHandler);
engine.onValidateNextBlock(validateHandler);
engine.onSceneEnter(sceneEnterHandler);
engine.onSceneExit(sceneExitHandler);

const handle = engine.scene(sceneId);
handle.start();
```
```csharp [C#]
// required — the engine won't start without these
engine.OnDialog(dialogHandler);
engine.OnChoice(choiceHandler);
engine.OnCondition(conditionHandler);
engine.OnAction(actionHandler);

// optional — lifecycle, validation, pre-execution
engine.OnBeforeBlock(beforeBlockHandler);
engine.OnResolveCharacter(resolveCharacterHandler);
engine.OnValidateNextBlock(validateHandler);
engine.OnSceneEnter(sceneEnterHandler);
engine.OnSceneExit(sceneExitHandler);

var handle = engine.Scene(sceneId);
handle.Start();
```
```cpp [C++]
// required — the engine won't start without these
engine.onDialog(dialogHandler);
engine.onChoice(choiceHandler);
engine.onCondition(conditionHandler);
engine.onAction(actionHandler);

// optional — lifecycle, validation, pre-execution
engine.onBeforeBlock(beforeBlockHandler);
engine.onResolveCharacter(resolveCharacterHandler);
engine.onValidateNextBlock(validateHandler);
engine.onSceneEnter(sceneEnterHandler);
engine.onSceneExit(sceneExitHandler);

auto handle = engine.scene(sceneId);
handle->start();
```
```gdscript [GDScript]
# required — the engine won't start without these
engine.on_dialog(dialog_handler)
engine.on_choice(choice_handler)
engine.on_condition(condition_handler)
engine.on_action(action_handler)

# optional — lifecycle, validation, pre-execution
engine.on_before_block(before_block_handler)
engine.on_resolve_character(resolve_character_handler)
engine.on_validate_next_block(validate_handler)
engine.on_scene_enter(scene_enter_handler)
engine.on_scene_exit(scene_exit_handler)

var handle = engine.scene(scene_id)
handle.start()
```
:::

::: code-group
```ts [TypeScript]
import { DialogueEngine } from '@lsde/dialog-engine';
import blueprintJson from './blueprint.json';

const engine = new DialogueEngine();
engine.init({ data: blueprintJson });

// 4 required handlers — bridge between the engine and your game
engine.onDialog(({ scene, block, context, next }) => {
  game
    .createDialogAuto(block, context)
    .catch(() => scene.cancel())
    .finally(() => next());
});

engine.onChoice(({ scene, block, context, next }) => {
  game
    .createChoiceAuto(block, context)
    .catch(() => scene.cancel())
    .finally(() => next());
});

engine.onCondition(({ scene, block, context, next }) => {
  game
    .evaluateConditions(block.conditions)
    .catch(() => scene.cancel())
    .then((result) => context.resolve(result))
    .finally(() => next());
});

engine.onAction(({ block, context, next }) => {
  game
    .executeActions(block.actions)
    .catch((err) => context.reject(err))
    .finally(() => next());
});

// Start a scene anywhere in your game code
function myGameScript(sceneId: string) {
  const scene = engine.scene(sceneId);
  scene.start();
}
```
```csharp [C#]
using LsdeDialogEngine;

var engine = new DialogueEngine();
engine.Init(new InitOptions { Data = blueprint });

// 4 required handlers — bridge between the engine and your game
engine.OnDialog(args => {
    var (scene, block, context, next) = args;
    Game.ShowDialog(block, context, onComplete: next);
});

engine.OnChoice(args => {
    var (scene, block, context, next) = args;
    Game.ShowChoices(block, context, onSelected: next);
});

engine.OnCondition(args => {
    var (scene, block, context, next) = args;
    var result = Game.EvaluateConditions(block.Conditions);
    context.Resolve(result);
    next();
});

engine.OnAction(args => {
    var (scene, block, context, next) = args;
    Game.ExecuteActions(block.Actions);
    context.Resolve();
    next();
});

// Start a scene anywhere in your game code
void MyGameScript(string sceneId) {
    var scene = engine.Scene(sceneId);
    scene.Start();
}
```
```cpp [C++]
#include <lsde/engine.h>

using namespace lsde;

DialogueEngine engine;
engine.init({blueprint});

// 4 required handlers — bridge between the engine and your game
engine.onDialog([](auto* scene, auto* block, auto* ctx, auto next) {
    game->showDialog(block, ctx, [next]() { next(); });
});

engine.onChoice([](auto* scene, auto* block, auto* ctx, auto next) {
    game->showChoices(block, ctx, [next]() { next(); });
});

engine.onCondition([](auto* scene, auto* block, auto* ctx, auto next) {
    auto result = game->evaluateConditions(block->conditions);
    ctx->resolve(result);
    next();
});

engine.onAction([](auto*, auto* block, auto* ctx, auto next) {
    game->executeActions(block->actions);
    ctx->resolve();
    next();
});

// Start a scene anywhere in your game code
auto scene = engine.scene(sceneId);
scene->start();
```
```gdscript [GDScript]
var engine = LsdeDialogueEngine.new()
engine.init({"data": blueprint})

# 4 required handlers — bridge between the engine and your game
engine.on_dialog(func(args):
    await game.show_dialog(args["block"], args["context"])
    args["next"].call()
)

engine.on_choice(func(args):
    await game.show_choices(args["block"], args["context"])
    args["next"].call()
)

engine.on_condition(func(args):
    var result = game.evaluate_conditions(args["block"].conditions)
    args["context"].resolve(result)
    args["next"].call()
)

engine.on_action(func(args):
    game.execute_actions(args["block"].actions)
    args["context"].resolve()
    args["next"].call()
)

# Start a scene anywhere in your game code
func my_game_script(scene_id: String):
    var scene = engine.scene(scene_id)
    scene.start()
```
:::

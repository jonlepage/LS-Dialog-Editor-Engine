::: code-group
```ts [TypeScript]
import { DialogueEngine } from '@lsde/dialog-engine';
import blueprintJson from './blueprint.json';

const engine = new DialogueEngine();
engine.init({ data: blueprintJson });

// Unified condition resolver — evaluates game-state conditions for both
// choice visibility and condition block pre-evaluation.
engine.onResolveCondition((cond) => game.evaluateCondition(cond));

// 3 required handlers — bridge between the engine and your game
// (onCondition is optional when onResolveCondition is installed)
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
using LsdeDialogEngine.Json; // LsdeDialogEngine.SystemTextJson package
// Unity: use LsdeDialogEngine.Newtonsoft instead

var blueprint = LsdeJson.Parse(File.ReadAllText("blueprint.json"));
var engine = new DialogueEngine();
engine.Init(new InitOptions { Data = blueprint });

// Unified condition resolver — evaluates game-state conditions for both
// choice visibility and condition block pre-evaluation.
engine.OnResolveCondition(cond => Game.EvaluateCondition(cond));

// 3 required handlers — bridge between the engine and your game
engine.OnDialog(args => {
    var (scene, block, context, next) = args;
    Game.ShowDialog(block, context, onComplete: next);
});

engine.OnChoice(args => {
    var (scene, block, context, next) = args;
    Game.ShowChoices(block, context, onSelected: next);
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

// Unified condition resolver — evaluates game-state conditions for both
// choice visibility and condition block pre-evaluation.
engine.onResolveCondition([](const ExportCondition& cond) {
    return game->evaluateCondition(cond);
});

// 3 required handlers — bridge between the engine and your game
engine.onDialog([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    game->showDialog(block, ctx, [next]() { next(); });
    return {};
});

engine.onChoice([](auto* scene, auto* block, auto* ctx, auto next) -> CleanupFn {
    game->showChoices(block, ctx, [next]() { next(); });
    return {};
});

engine.onAction([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    game->executeActions(block->actions);
    ctx->resolve();
    next();
    return {};
});

// Start a scene anywhere in your game code
auto scene = engine.scene(sceneId);
scene->start();
```
```gdscript [GDScript]
var engine = LsdeDialogueEngine.new()
engine.init({"data": blueprint})

# Unified condition resolver — evaluates game-state conditions for both
# choice visibility and condition block pre-evaluation.
engine.on_resolve_condition(func(cond):
    return game.evaluate_condition(cond)
)

# 3 required handlers — bridge between the engine and your game
engine.on_dialog(func(args):
    await game.show_dialog(args["block"], args["context"])
    args["next"].call()
)

engine.on_choice(func(args):
    await game.show_choices(args["block"], args["context"])
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

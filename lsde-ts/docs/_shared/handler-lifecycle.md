::: code-group
```ts [TypeScript]
engine.onSceneEnter(({ scene }) => {
  game.cinemaMode(true);
  game.stopNpcMovements();
});

engine.onSceneExit(() => {
  game.cinemaMode(false);
  game.resumeNpcMovements();
});

// scene-level override
const handle = engine.scene(sceneId);
handle.onEnter(({ scene }) => {
  game.playIntroSequence(scene);
});
```
```csharp [C#]
engine.OnSceneEnter(args => {
    Game.CinemaMode(true);
    Game.StopNpcMovements();
});

engine.OnSceneExit(args => {
    Game.CinemaMode(false);
    Game.ResumeNpcMovements();
});

// scene-level override
var handle = engine.Scene(sceneId);
handle.OnEnter(args => {
    Game.PlayIntroSequence(args.Scene);
});
```
```cpp [C++]
engine.onSceneEnter([&game](auto* scene, auto*) {
    game.cinemaMode(true);
    game.stopNpcMovements();
});

engine.onSceneExit([&game](auto*, auto*) {
    game.cinemaMode(false);
    game.resumeNpcMovements();
});

// scene-level override
auto handle = engine.scene(sceneId);
handle->onEnter([&game](auto* scene, auto*) {
    game.playIntroSequence(scene);
});
```
```gdscript [GDScript]
engine.on_scene_enter(func(args):
    game.cinema_mode(true)
    game.stop_npc_movements()
)

engine.on_scene_exit(func(args):
    game.cinema_mode(false)
    game.resume_npc_movements()
)

# scene-level override
var handle = engine.scene(scene_id)
handle.on_enter(func(args):
    game.play_intro_sequence(args["scene"])
)
```
:::

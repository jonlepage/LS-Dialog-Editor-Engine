<!-- ![LSDE Dialog Engine — GDScript](banner.png) -->

# LSDE Dialog Engine — GDScript

> GDScript runtime for Godot 4.x. Zero dependencies, pure GDScript.

Port of the TypeScript reference implementation. Validated against the same 42 cross-language JSON test specifications. Blueprint data stays as native Godot `Dictionary` — zero mapping overhead from `JSON.parse_string()`.

---

## Quick Start

### Install

Copy the `addons/lsde/` folder into your Godot project's `addons/` directory. That's it.

### Usage

```gdscript
var engine = LsdeDialogueEngine.new()
var report = engine.init({"data": blueprint_data})

engine.set_locale("en")
engine.set_state_bridge(MyStateBridge.new())

engine.on_dialog(func(args: Dictionary) -> Callable:
    var block: Dictionary = args["block"]
    var ctx = args["context"]
    var text: String = block.get("dialogueText", {}).get("en", "")
    print("%s: %s" % [ctx.character.get("name", ""), text])
    args["next"].call()
    return Callable()  # or return a cleanup Callable
)

engine.on_choice(func(args: Dictionary) -> Callable:
    var ctx = args["context"]
    # Show choices, then:
    ctx.select_choice(ctx.choices[0]["uuid"])
    args["next"].call()
    return Callable()
)

var handle = engine.scene("scene-uuid")
handle.start()
```

### StateBridge

Extend `LsdeStateBridge` to connect the engine to your game state:

```gdscript
class MyStateBridge extends LsdeStateBridge:
    func evaluate_condition(condition: Dictionary) -> bool:
        return GameState.check(condition["key"])

    func execute_action(action: Dictionary, signature = null) -> void:
        GameState.execute(action["actionId"], action.get("params", []))

    func resolve_dictionary(group_label: String, row_key: String) -> Variant:
        return GameState.get_value(group_label, row_key)
```

---

## Scripts

Requires Godot 4.6+ in PATH or the full path to the executable.

| Command              | Description                                        |
| -------------------- | -------------------------------------------------- |
| `npm run test`       | Run 42 cross-language tests (headless)             |
| `npm run playground` | Run playground against a real blueprint (headless) |

---

## Project Structure

```
addons/lsde/                      # Drop this into your Godot project
├── lsde_engine.gd                # Public facade (LsdeDialogueEngine)
├── lsde_scene_handle.gd          # Traversal loop + AsyncTrack
├── lsde_handler_registry.gd      # Two-tier handler resolution
├── lsde_port_resolver.gd         # Output port routing
├── lsde_block_context.gd         # Context factories
├── lsde_condition_evaluator.gd   # AND/OR chain evaluation
├── lsde_graph.gd                 # Scene + Blueprint indexing
├── lsde_validator.gd             # Blueprint validation
├── lsde_state_bridge.gd          # Base StateBridge class
├── lsde_types.gd                 # Enums, constants
└── lsde_utils.gd                 # Helpers

tests/test_runner.gd              # Headless test runner
examples/playground.gd            # Console playground
```

---

## API Overview

| Method                            | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `engine.init(options)`            | Validate + build graph. Returns diagnostic `Dictionary`. |
| `engine.set_locale(locale)`       | Set active locale.                                       |
| `engine.set_state_bridge(bridge)` | Connect to game state (`LsdeStateBridge`).               |
| `engine.on_dialog(handler)`       | Register DIALOG handler (`Callable`).                    |
| `engine.on_choice(handler)`       | Register CHOICE handler (visibility pre-filtered).       |
| `engine.on_condition(handler)`    | Register CONDITION handler. Auto-evals if absent.        |
| `engine.on_action(handler)`       | Register ACTION handler. Auto-executes if absent.        |
| `engine.scene(scene_id)`          | Create scene handle. Call `handle.start()` to begin.     |

Handlers receive a `Dictionary` with keys `scene`, `block`, `context`, `next` and return a `Callable` (cleanup) or `Callable()` (no cleanup).

### Signals

```gdscript
handle.scene_entered.connect(func(h): print("entered"))
handle.scene_exited.connect(func(h): print("exited"))
```

### Blueprint Data

Blueprint data stays as native `Dictionary` from `JSON.parse_string()`. Access fields with camelCase keys matching the JSON:

```gdscript
var block_type: String = block["type"]       # "DIALOG"
var label: String = block.get("label", "")
var is_async: bool = block.get("nativeProperties", {}).get("isAsync", false)
```

---

## Cross-Language Conformance

42 shared JSON tests across all runtimes: **42/42 passing**.

See [PLAN.md](../PLAN.md) for the complete specification.

---

## License

Proprietary — distributed under the LSDE license.

![LSDE Dialog Engine — GDScript](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-gdscript/banner.png)

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

# Character resolver (optional — default: first character in list)
engine.on_resolve_character(func(chars: Array) -> Variant:
    return chars[0] if not chars.is_empty() else null
)

# Choice visibility filter (optional — tags each choice with visible)
engine.set_choice_filter(func(condition: Dictionary) -> bool:
    return GameState.evaluate(condition)
)

# ─── 4 Required Handlers ────────────────────────────────────────

engine.on_dialog(func(args: Dictionary) -> Callable:
    var block: Dictionary = args["block"]
    var ctx = args["context"]
    var text = LsdeUtils.get_localized_text(block.get("dialogueText", {}))
    var ch = ctx.character()
    print("%s: %s" % [ch.get("name", "???") if ch else "???", text])
    args["next"].call()
    return Callable()  # or return a cleanup Callable
)

engine.on_choice(func(args: Dictionary) -> Callable:
    var ctx = args["context"]
    var choices = ctx.choices()
    for c in choices:
        if not c.has("visible") or c["visible"]:
            ctx.select_choice(c["uuid"])
            break
    args["next"].call()
    return Callable()
)

engine.on_condition(func(args: Dictionary) -> Callable:
    var scene = args["scene"]
    var block: Dictionary = args["block"]
    var ctx = args["context"]
    var result = LsdeUtils.evaluate_condition_chain(
        block.get("conditions", []),
        func(cond: Dictionary) -> bool:
            if LsdeUtils.is_choice_condition(cond):
                return scene.evaluate_condition(cond)
            return GameState.evaluate(cond)
    )
    ctx.resolve(result)
    args["next"].call()
    return Callable()
)

engine.on_action(func(args: Dictionary) -> Callable:
    var block: Dictionary = args["block"]
    var ctx = args["context"]
    for a in block.get("actions", []):
        print("Action: %s" % a["actionId"])
    ctx.resolve()
    args["next"].call()
    return Callable()
)

# ─── Run ─────────────────────────────────────────────────────────

var handle = engine.scene("scene-uuid")
handle.start()
```

### Godot Integration

In Godot, store the `next` callable and trigger it from your UI signals:

```gdscript
engine.on_dialog(func(args: Dictionary) -> Callable:
    var text = LsdeUtils.get_localized_text(args["block"].get("dialogueText", {}))
    var ch = args["context"].character()

    dialogue_label.text = "%s: %s" % [ch.get("name", "") if ch else "", text]
    dialogue_panel.visible = true

    # Store next — triggered by a UI signal
    _pending_next = args["next"]

    return func(): dialogue_panel.visible = false  # cleanup
)

# Called from your UI button signal
func _on_continue_pressed():
    if _pending_next.is_valid():
        _pending_next.call()
        _pending_next = Callable()
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
├── lsde_types.gd                 # Enums, constants
└── lsde_utils.gd                 # Helpers

tests/test_runner.gd              # Headless test runner
examples/playground.gd            # Console playground
```

---

## API Overview

### Engine Lifecycle

| Method | Description |
|--------|-------------|
| `engine.init(options)` | Validate + build graph. Returns diagnostic `Dictionary`. |
| `engine.set_locale(locale)` | Set active locale. |
| `engine.scene(scene_id)` | Create scene handle. Call `handle.start()` to begin. |
| `engine.stop()` | Cancel all active scenes. |
| `engine.is_running()` | True if at least one scene is active. |
| `engine.get_active_scenes()` | Get all running scene handles. |
| `engine.get_current_blocks()` | Get current block of every active scene. |
| `engine.get_scene_connections(scene_id)` | Get all connections for a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.on_dialog(handler)` | Handle DIALOG blocks. |
| `engine.on_choice(handler)` | Handle CHOICE blocks (choices tagged with `visible` when `set_choice_filter` is set). |
| `engine.on_condition(handler)` | Handle CONDITION blocks. Developer **must** call `ctx.resolve(bool)`. |
| `engine.on_action(handler)` | Handle ACTION blocks. Developer **must** call `ctx.resolve()` or `ctx.reject()`. |

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.on_resolve_character(fn)` | Character resolver. Default: first character in the list. |
| `engine.set_choice_filter(fn)` | Install choice visibility evaluator (game-state conditions). |
| `engine.on_before_block(handler)` | Pre-execution gate. Must call `resolve()` to continue. |
| `engine.on_validate_next_block(handler)` | Validate before entering a block. |
| `engine.on_invalidate_block(handler)` | Called when a block fails validation. |
| `engine.on_scene_enter(handler)` | Called when any scene starts. |
| `engine.on_scene_exit(handler)` | Called when any scene ends. |

### Scene Handle (Tier 2 — Per-Scene)

| Method | Description |
|--------|-------------|
| `handle.start()` | Begin traversal from the entry block. |
| `handle.cancel()` | Stop the scene and all async tracks. |
| `handle.on_dialog(handler)` | Override global DIALOG handler for this scene. |
| `handle.on_choice(handler)` | Override global CHOICE handler for this scene. |
| `handle.on_condition(handler)` | Override global CONDITION handler for this scene. |
| `handle.on_action(handler)` | Override global ACTION handler for this scene. |
| `handle.on_block(uuid, handler)` | Override handler for a specific block by UUID. |
| `handle.on_dialog_id(uuid, handler)` | Override a specific DIALOG block by UUID (type-safe). |
| `handle.on_choice_id(uuid, handler)` | Override a specific CHOICE block by UUID (type-safe). |
| `handle.on_condition_id(uuid, handler)` | Override a specific CONDITION block by UUID (type-safe). |
| `handle.on_action_id(uuid, handler)` | Override a specific ACTION block by UUID (type-safe). |
| `handle.on_enter(handler)` | Override global `on_scene_enter` for this scene. |
| `handle.on_exit(handler)` | Override global `on_scene_exit` for this scene. |
| `handle.on_resolve_character(fn)` | Override character resolver for this scene. |
| `handle.get_current_block()` | Get the block currently being executed, or `null`. |
| `handle.get_visited_blocks()` | Ordered list of visited block UUIDs. |
| `handle.get_choice_history()` | Map of block UUID → selected choice UUIDs. |
| `handle.get_choice(block_uuid)` | Get choice(s) selected at a specific block. |
| `handle.evaluate_condition(cond)` | Evaluate a `choice:` condition against history. |
| `handle.is_running()` | Whether the scene is still active. |
| `handle.get_active_tracks()` | Number of active async tracks. |
| `handle.get_track_infos()` | Snapshot of all track states. |

### Handler Pattern

Handlers receive a `Dictionary` with keys `scene`, `block`, `context`, `next` and return a `Callable` (cleanup) or `Callable()` (no cleanup):

```gdscript
engine.on_dialog(func(args: Dictionary) -> Callable:
    # Display dialogue...
    args["next"].call()  # Advance to next block

    return func():
        pass  # Called when leaving this block (cleanup)
)
```

### Blueprint Data

Blueprint data stays as native `Dictionary` from `JSON.parse_string()`. Access fields with camelCase keys matching the JSON:

```gdscript
var block_type: String = block["type"]       # "DIALOG"
var label: String = block.get("label", "")
var is_async: bool = block.get("nativeProperties", {}).get("isAsync", false)
```

### Utilities (`LsdeUtils`)

| Method | Description |
|--------|-------------|
| `LsdeUtils.locale` | Current locale, synced by `engine.set_locale()`. |
| `LsdeUtils.is_dialog_block(block)` | Type guard: true if block is a DIALOG block. |
| `LsdeUtils.is_choice_block(block)` | Type guard: true if block is a CHOICE block. |
| `LsdeUtils.is_condition_block(block)` | Type guard: true if block is a CONDITION block. |
| `LsdeUtils.is_action_block(block)` | Type guard: true if block is an ACTION block. |
| `LsdeUtils.is_note_block(block)` | Type guard: true if block is a NOTE block. |
| `LsdeUtils.get_block_label(block)` | Block label, or first 8 chars of UUID as fallback. |
| `LsdeUtils.get_localized_text(dialogue_text, locale?)` | Lookup localized text. Uses engine locale by default. |
| `LsdeUtils.is_choice_condition(condition)` | True if condition references a previous choice (`choice:<uuid>`). |
| `LsdeUtils.get_choice_condition_block_uuid(condition)` | Extract block UUID from a choice condition. |
| `LsdeUtils.evaluate_condition_chain(conditions, evaluator)` | Evaluate AND/OR condition chain. Empty = `true`. |
| `LsdeUtils.filter_visible_choices(choices, evaluator, scene?)` | Filter choices by visibility conditions. |

---

## Cross-Language Conformance

42 shared JSON tests across all runtimes: **42/42 passing**.

---

## License

Proprietary — distributed under the LSDE license.

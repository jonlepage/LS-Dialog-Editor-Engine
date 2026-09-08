![LSDE Dialog Engine — GDScript](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-gdscript/banner.png)

# LSDE Dialog Engine — GDScript

> GDScript runtime for Godot 4.x. Zero dependencies, pure GDScript.

Port of the TypeScript reference implementation. Validated against the same cross-language JSON test specifications. Blueprint data stays as native Godot `Dictionary` — zero mapping overhead from `JSON.parse_string()`.

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
engine.on_resolve_condition(func(test: Dictionary) -> bool:
    return GameState.evaluate(condition)
)

# ─── 4 Required Handlers ────────────────────────────────────────

engine.on_dialog(func(args: Dictionary) -> Callable:
    var block: Dictionary = args["block"]
    var ctx = args["context"]
    # The engine hands the RAW string over and never looks inside it.
    var text = LsdeUtils.get_localized_text(block.get("text"))
    var names: Array = []
    for actor in ctx.actors:
        names.append(actor.get("name", ""))
    # The emotion belongs to the BLOCK, not to each actor.
    var tone = ctx.emotion.get("name", "") if ctx.emotion != null else ""
    print("%s%s: %s" % [" + ".join(names), (" (%s)" % tone) if tone != "" else "", text])
    args["next"].call()
    return Callable()  # or return a cleanup Callable
)

engine.on_choice(func(args: Dictionary) -> Callable:
    var ctx = args["context"]
    # EVERY option is handed over, tagged — never a shortened list. Test `!= false`: with no
    # resolver installed there is no "visible" key at all, meaning UNKNOWN, not hidden.
    for option in ctx.options:
        if option.get("visible") != false:
            # The option id IS its exit port (C1, C2…), so hand it straight back.
            ctx.select_choice(option["id"])
            break
    args["next"].call()
    return Callable()
)

# on_condition is OPTIONAL when on_resolve_condition is installed: the engine already knows which
# port the cases picked. Keep it to log what matched, or to override with a PORT NAME.
engine.on_condition(func(args: Dictionary) -> Callable:
    var ctx = args["context"]
    for c in ctx.cases:
        if c["result"]:
            print("%s -> %s" % [args["block"].get("id", ""), c["port"]])
            break
    # ctx.resolve("K2")  # override, by port name
    args["next"].call()
    return Callable()
)

engine.on_action(func(args: Dictionary) -> Callable:
    var block: Dictionary = args["block"]
    var ctx = args["context"]
    for call_entry in ctx.calls:
        # `fn` is empty when the writer has not picked a function yet. A draft, not an error.
        print("Call: %s" % call_entry.get("fn", "<no function picked>"))
    ctx.resolve()   # or ctx.reject() to leave by `catch`
    args["next"].call()
    return Callable()
)

# ─── Run ─────────────────────────────────────────────────────────

# A path (`reactor_breach`) or the stable id (`sc_u0vqg2g8`) — the id survives a rename.
var handle = engine.scene("reactor_breach")
handle.start()
```

### Godot Integration

In Godot, store the `next` callable and trigger it from your UI signals:

```gdscript
engine.on_dialog(func(args: Dictionary) -> Callable:
    var text = LsdeUtils.get_localized_text(args["block"].get("text", {}))
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
| `npm run test`       | Run the full suite (headless)                      |
| `npm run playground` | Run playground against a real blueprint (headless) |

---

## Project Structure

```
addons/lsde/                      # Drop this into your Godot project
├── lsde_engine.gd                # Public facade (LsdeDialogueEngine)
├── lsde_track.gd                 # THE traversal, written once. The main flow is a track, id 0
├── lsde_scene_handle.gd          # The scene: public API, and what its tracks share
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
| `engine.scene(scene_ref)` | Create scene handle. Call `handle.start()` to begin. |
| `engine.stop()` | Cancel all active scenes. |
| `engine.is_running()` | True if at least one scene is active. |
| `engine.get_active_scenes()` | Get all running scene handles. |
| `engine.get_current_blocks()` | Get current block of every active scene. |
| `engine.get_scene_connections(scene_ref)` | Every wire INSIDE a scene, flattened. Graph inspection; wires never cross a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.on_dialog(handler)` | Handle DIALOG blocks. |
| `engine.on_choice(handler)` | Handle choice blocks. EVERY option is handed over, tagged with `visible` when `on_resolve_condition` is installed. |
| `engine.on_condition(handler)` | Handle CONDITION blocks. **Optional** when `on_resolve_condition` is installed; `ctx.resolve(port)` takes a PORT NAME. |
| `engine.on_action(handler)` | Handle ACTION blocks. Developer **must** call `ctx.resolve()` or `ctx.reject()`. Leaves by `then` or `catch`. |

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.on_resolve_character(fn)` | Character resolver. Default: first character in the list. |

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
| `handle.on_block(id, handler)` | Override the handler for one block, by its id (`DIALOG-007`). |
| `handle.on_dialog_id(id, handler)` | Override one DIALOG block by id (type-safe). |
| `handle.on_choice_id(id, handler)` | Override one CHOICE block by id (type-safe). |
| `handle.on_condition_id(id, handler)` | Override one CONDITION block by id (type-safe). |
| `handle.on_action_id(id, handler)` | Override one ACTION block by id (type-safe). |
| `handle.on_enter(handler)` | Override global `on_scene_enter` for this scene. |
| `handle.on_exit(handler)` | Override global `on_scene_exit` for this scene. |
| `handle.on_resolve_character(fn)` | Override character resolver for this scene. |
| `handle.get_current_block()` | Get the block currently being executed, or `null`. |
| `handle.get_visited_blocks()` | Ordered list of visited block ids, for this scene. |
| `handle.get_choice_history()` | Map of CHOICE block id → the option ids the player picked. |
| `handle.get_choice(block_id)` | The option ids picked at one CHOICE block. |
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
var block_type: String = block["type"]       # "dialog"
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
| `LsdeUtils.get_block_label(block)` | How to name a block on screen: `label`, else the designer `note`, else the id. |
| `LsdeUtils.get_localized_text(text, locale?)` | Pick a locale out of an inline `text` map. Uses the engine locale by default. |
| `LsdeUtils.get_text_from_table(table, scene, block_id, option_id?)` | Read a line out of a loaded `localization/<locale>/__blueprints__.json` (separate-text mode). |
| `LsdeUtils.get_text_key(block, option_id?)` | The i18n key of a block, or of one option of a choice. |
| `LsdeUtils.get_native_properties(block)` | The properties the ENGINE acts on, out of `props`. **`delay`/`timeout` are MILLISECONDS.** |
| `LsdeUtils.get_custom_properties(block)` | The properties the DESIGNER declared, with the natives taken out. |
| `LsdeUtils.is_choice_condition(test)` | True if the test reads a past answer — `{ dict: "choice" }`. |
| `LsdeUtils.get_choice_condition_block_id(test)` | The CHOICE block a `choice:` test reads. |
| `LsdeUtils.evaluate_condition_chain(tests, evaluator)` | Evaluate an AND/OR chain, left to right, no precedence. Absent or empty = `true`. |
| `LsdeUtils.evaluate_condition_cases(cases, port_per_case, evaluator)` | The exit port of a condition block: `out`/`default`, or `K1`… with `portPerCase`. |
| `LsdeUtils.evaluate_each_case(cases, evaluator)` | Each case on its own, in order — to show what matched without changing the routing. |
| `LsdeUtils.tag_option_visibility(options, evaluator)` | Tag every option with whether its `when` holds, returning them ALL. |

---

## Cross-Language Conformance

52 shared cases, in 46 suites, run by all four runtimes: **52/52 passing**.

---

## License

Proprietary — distributed under the LSDE license.

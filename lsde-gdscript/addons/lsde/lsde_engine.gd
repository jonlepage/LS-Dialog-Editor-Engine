## LSDE Dialog Engine — Public facade (callback-driven graph dispatcher).
##
## Top-level entry point managing blueprint loading, global handler registration, and scene creation.
## Use LsdeSceneHandle for per-scene control.
class_name LsdeDialogueEngine
extends RefCounted

var _graph: LsdeGraph = null
var _global_registry: LsdeHandlerRegistry = LsdeHandlerRegistry.new()
var _locale: String = ""
## The scenes currently playing, in the order they started.
##
## Held by HANDLE, not keyed by the reference scene() was called with. Nothing stops a game from
## opening the same scene twice — a hub revisited while a first pass is parked on a handler — and
## keying by the reference meant the second one EVICTED the first: the engine reported one scene
## when two were playing, and stop() could no longer reach the one it had dropped, which then ran
## for the rest of the process.
var _active_scenes: Array = []
var _initialized: bool = false
## Which actor of a block is the one speaking. Defaults to the first.
##
## LSDE deliberately refuses to say what the order of `actors` means — whether it is who speaks or
## who is present is a decision each game makes. The default picks the first because a default has
## to pick something, not because the format says so.
var _resolve_character: Callable = func(actors: Array) -> Variant:
	return actors[0] if actors.size() > 0 else null
## Unified condition resolver for choice visibility and condition block pre-evaluation.
var _condition_resolver: Callable

# ─── Initialization ───────────────────────────────────────────────────────

## Load a payload and report what is wrong with it.
##
## Takes one export in `data`, or the several files of a per-scene one in `files` — each of those
## carries the whole header, so they are folded into a single payload after checking they come from
## one export.
##
## The engine is initialized only when there are no errors: a payload it cannot read leaves it
## unusable rather than half-loaded.
func init(options: Dictionary) -> Dictionary:
	var report: Dictionary = LsdeValidator.validate_blueprint(options)
	if report["errors"].size() == 0:
		var payload: Variant = options.get("data")
		var files: Variant = options.get("files")
		if files is Array and not files.is_empty():
			payload = LsdeValidator.merge_payloads(files)["data"]
		_graph = LsdeGraph.new(payload)
		_initialized = true
	return report

## Set the active locale for text resolution. Validates against blueprint.locales.
## Also syncs LsdeUtils.locale.
func set_locale(locale: String) -> void:
	if _graph != null:
		var valid_locales: Array = _graph.get_locales()
		if valid_locales.size() > 0 and not valid_locales.has(locale):
			assert(false, "Invalid locale \"%s\". Available locales: %s" % [locale, ", ".join(valid_locales)])
	_locale = locale
	LsdeUtils.locale = locale

# ─── Character resolution ────────────────────────────────────────────────

## Which actor of a block is the one speaking. Called for every block that cites actors; the whole
## cast is passed, in file order, already resolved through the export's cards table.
func on_resolve_character(resolver: Callable) -> void:
	_resolve_character = resolver

# ─── Condition resolution ────────────────────────────────────────────────

## Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
## The engine handles choice: conditions internally via choice history — this callback evaluates
## game-state conditions only.
func on_resolve_condition(evaluator: Callable) -> void:
	_condition_resolver = evaluator


# ─── Validation ───────────────────────────────────────────────────────────

## Register a handler called before each block to validate it.
func on_validate_next_block(handler: Callable) -> void:
	_global_registry.validate_next_block_handler = handler

## Register a handler called when a block fails validation.
func on_invalidate_block(handler: Callable) -> void:
	_global_registry.invalidate_block_handler = handler

# ─── Pre-execution ────────────────────────────────────────────────────────

## Register a handler called before every block. Must call resolve() to continue.
func on_before_block(handler: Callable) -> void:
	_global_registry.before_block_handler = handler

# ─── Type handlers (Tier 1 — global) ─────────────────────────────────────

## Register a global handler for DIALOG blocks. May return a cleanup Callable.
func on_dialog(handler: Callable) -> void:
	_global_registry.dialog_handler = handler

## Register a global handler for CHOICE blocks.
## Every option is handed over, tagged with visible when on_resolve_condition is installed.
func on_choice(handler: Callable) -> void:
	_global_registry.choice_handler = handler

## Register a global handler for CONDITION blocks. The developer MUST handle evaluation.
func on_condition(handler: Callable) -> void:
	_global_registry.condition_handler = handler

## Register a global handler for ACTION blocks. The developer MUST handle execution.
func on_action(handler: Callable) -> void:
	_global_registry.action_handler = handler

# ─── Scene lifecycle ──────────────────────────────────────────────────────

## Register a handler called when any scene starts.
func on_scene_enter(handler: Callable) -> void:
	_global_registry.scene_enter_handler = handler

## Register a handler called when any scene ends (natural or cancelled).
func on_scene_exit(handler: Callable) -> void:
	_global_registry.scene_exit_handler = handler

# ─── Scene handles ────────────────────────────────────────────────────────

## Open a scene by its PATH (reactor_breach) or by the id that survives a rename (sc_u0vqg2g8).
## Does NOT start the flow — call handle.start().
##
## Take the id wherever the reference is stored OUTSIDE the payload — a resource, a save file, a
## database row. The path is what a writer reads and what builds the i18n keys, but it changes the
## day someone renames the scene, and a stored path then resolves to nothing.
func scene(scene_ref: String) -> LsdeSceneHandle:
	assert(_initialized and _graph != null, "Engine not initialized. Call init() first.")
	var scene_graph: Variant = _graph.get_scene_graph(scene_ref)
	assert(scene_graph != null, "Scene \"%s\" not found." % scene_ref)

	var graph := _graph

	# The handle that ends is the handle that leaves. No identity check to write: a list of handles
	# cannot confuse two runs of the same scene the way a dictionary keyed by its name did.
	var on_ended: Callable = func(h: Variant) -> void:
		_active_scenes.erase(h)

	var handle: LsdeSceneHandle = LsdeSceneHandle.new(scene_graph, _global_registry, {
		"on_scene_started": func(h: Variant) -> void: _active_scenes.append(h),
		"on_scene_ended": on_ended,
		"get_resolve_character": func() -> Callable: return _resolve_character,
		"get_condition_resolver": func() -> Callable: return _condition_resolver,
		"get_card": func(card_id: String) -> Variant: return graph.get_card(card_id),
	})
	return handle

# ─── Engine control ───────────────────────────────────────────────────────

## Stop all active scenes.
func stop() -> void:
	# A copy: cancelling a scene removes it from the list as it ends.
	var handles: Array = _active_scenes.duplicate()
	for handle in handles:
		handle.cancel()

## True if at least one scene is active.
func is_running() -> bool:
	return _active_scenes.size() > 0

## Get all currently active scene handles.
func get_active_scenes() -> Array:
	return _active_scenes.duplicate()

## Get the current block of every active scene.
func get_current_blocks() -> Array:
	var blocks: Array = []
	for handle in _active_scenes:
		var block: Variant = handle.get_current_block()
		if block != null:
			blocks.append(block)
	return blocks

## Every wire INSIDE a scene, flattened so each carries the block it leaves.
##
## Graph inspection only. It has never had anything to do with going from one scene to another: a
## wire has never crossed a scene in any version of the format.
func get_scene_connections(scene_ref: String) -> Array:
	if _graph == null:
		return []
	return _graph.get_scene_connections(scene_ref)

## LSDE Dialog Engine — Public facade (callback-driven graph dispatcher).
##
## Top-level entry point managing blueprint loading, global handler registration, and scene creation.
## Use LsdeSceneHandle for per-scene control.
class_name LsdeDialogueEngine
extends RefCounted

var _graph: LsdeGraph = null
var _global_registry: LsdeHandlerRegistry = LsdeHandlerRegistry.new()
var _locale: String = ""
var _active_scenes: Dictionary = {}
var _initialized: bool = false
## Character resolution callback. Default: first character in the list.
var _resolve_character: Callable = func(characters: Array) -> Variant:
	return characters[0] if characters.size() > 0 else null
## Choice visibility evaluator. When set, the engine tags each choice with visible before calling on_choice.
var _choice_filter: Callable

# ─── Initialization ───────────────────────────────────────────────────────

## Validate blueprint data, build internal graph, return diagnostic report.
func init(options: Dictionary) -> Dictionary:
	var report: Dictionary = LsdeValidator.validate_blueprint(options)
	if report["errors"].size() == 0:
		_graph = LsdeGraph.new(options["data"])
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

## Register a global character resolver. Called for every block with metadata.characters.
## Default: returns the first character in the list.
func on_resolve_character(resolver: Callable) -> void:
	_resolve_character = resolver

# ─── Choice visibility ───────────────────────────────────────────────────

## Install a condition evaluator for choice visibility tagging.
## When set, the engine evaluates each choice's visibilityConditions before calling on_choice,
## tagging each choice with visible = true/false. The engine handles choice: conditions
## internally via choice history — this callback evaluates game-state conditions only.
func set_choice_filter(evaluator: Callable) -> void:
	_choice_filter = evaluator

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
## All choices are provided, tagged with visible when set_choice_filter() is configured.
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

## Create a scene handle. Does NOT start the flow — call handle.start().
func scene(scene_id: String) -> LsdeSceneHandle:
	assert(_initialized and _graph != null, "Engine not initialized. Call init() first.")
	var scene_graph: Variant = _graph.get_scene_graph(scene_id)
	assert(scene_graph != null, "Scene \"%s\" not found." % scene_id)

	var handle: LsdeSceneHandle = LsdeSceneHandle.new(scene_graph, _global_registry, {
		"on_scene_started": func(h: Variant) -> void: _active_scenes[scene_id] = h,
		"on_scene_ended": func(_h: Variant) -> void: _active_scenes.erase(scene_id),
		"get_resolve_character": func() -> Callable: return _resolve_character,
		"get_choice_filter": func() -> Callable: return _choice_filter,
		"get_locale": func() -> String: return _locale,
	})
	return handle

# ─── Engine control ───────────────────────────────────────────────────────

## Stop all active scenes.
func stop() -> void:
	var handles: Array = _active_scenes.values().duplicate()
	for handle in handles:
		handle.cancel()

## True if at least one scene is active.
func is_running() -> bool:
	return _active_scenes.size() > 0

## Get all currently active scene handles.
func get_active_scenes() -> Array:
	return _active_scenes.values()

## Get the current block of every active scene.
func get_current_blocks() -> Array:
	var blocks: Array = []
	for handle in _active_scenes.values():
		var block: Variant = handle.get_current_block()
		if block != null:
			blocks.append(block)
	return blocks

## Get connections for a scene.
func get_scene_connections(scene_id: String) -> Array:
	if _graph == null:
		return []
	return _graph.get_scene_connections(scene_id)

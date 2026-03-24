## LSDE Dialog Engine — Public facade
class_name LsdeDialogueEngine
extends RefCounted

var _graph: LsdeGraph = null
var _global_registry: LsdeHandlerRegistry = LsdeHandlerRegistry.new()
var _state_bridge: LsdeStateBridge = null
var _locale: String = ""
var _active_scenes: Dictionary = {}
var _initialized: bool = false

# ─── Initialization ───────────────────────────────────────────────────────

func init(options: Dictionary) -> Dictionary:
	var report: Dictionary = LsdeValidator.validate_blueprint(options)
	if report["errors"].size() == 0:
		_graph = LsdeGraph.new(options["data"])
		_initialized = true
	return report

func set_locale(locale: String) -> void:
	_locale = locale

func set_state_bridge(bridge: LsdeStateBridge) -> void:
	_state_bridge = bridge

# ─── Validation ───────────────────────────────────────────────────────────

func on_validate_next_block(handler: Callable) -> void:
	_global_registry.validate_next_block_handler = handler

func on_invalidate_block(handler: Callable) -> void:
	_global_registry.invalidate_block_handler = handler

# ─── Pre-execution ────────────────────────────────────────────────────────

func on_before_block(handler: Callable) -> void:
	_global_registry.before_block_handler = handler

# ─── Type handlers ────────────────────────────────────────────────────────

func on_dialog(handler: Callable) -> void:
	_global_registry.dialog_handler = handler

func on_choice(handler: Callable) -> void:
	_global_registry.choice_handler = handler

func on_condition(handler: Callable) -> void:
	_global_registry.condition_handler = handler

func on_action(handler: Callable) -> void:
	_global_registry.action_handler = handler

# ─── Scene lifecycle ──────────────────────────────────────────────────────

func on_scene_enter(handler: Callable) -> void:
	_global_registry.scene_enter_handler = handler

func on_scene_exit(handler: Callable) -> void:
	_global_registry.scene_exit_handler = handler

# ─── Scene handles ────────────────────────────────────────────────────────

func scene(scene_id: String) -> LsdeSceneHandle:
	assert(_initialized and _graph != null, "Engine not initialized. Call init() first.")
	var scene_graph: Variant = _graph.get_scene_graph(scene_id)
	assert(scene_graph != null, "Scene \"%s\" not found." % scene_id)

	var handle: LsdeSceneHandle = LsdeSceneHandle.new(scene_graph, _global_registry, {
		"on_scene_started": func(h: Variant) -> void: _active_scenes[scene_id] = h,
		"on_scene_ended": func(_h: Variant) -> void: _active_scenes.erase(scene_id),
		"get_state_bridge": func() -> Variant: return _state_bridge,
		"get_locale": func() -> String: return _locale,
	})
	return handle

# ─── Engine control ───────────────────────────────────────────────────────

func stop() -> void:
	var handles: Array = _active_scenes.values().duplicate()
	for handle in handles:
		handle.cancel()

func is_running() -> bool:
	return _active_scenes.size() > 0

func get_active_scenes() -> Array:
	return _active_scenes.values()

func get_current_blocks() -> Array:
	var blocks: Array = []
	for handle in _active_scenes.values():
		var block: Variant = handle.get_current_block()
		if block != null:
			blocks.append(block)
	return blocks

func get_scene_connections(scene_id: String) -> Array:
	if _graph == null:
		return []
	return _graph.get_scene_connections(scene_id)

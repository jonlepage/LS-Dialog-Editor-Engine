## LSDE Dialog Engine — SceneHandle + AsyncTrack
class_name LsdeSceneHandle
extends RefCounted

signal scene_entered(handle)
signal scene_exited(handle)

var _scene_graph: LsdeGraph.SceneGraph
var _global_registry: LsdeHandlerRegistry
var _scene_registry: LsdeHandlerRegistry.SceneRegistry
var _callbacks: Dictionary  # {on_scene_started, on_scene_ended, get_state_bridge, get_locale}

var _running: bool = false
var _cancelled: bool = false
var _current_block: Variant = null
var _previous_block: Variant = null
var _visited: Array = []  # ordered list of visited UUIDs (preserves insertion order)
var _visited_set: Dictionary = {}  # fast lookup
var _previous_cleanup: Callable
var _async_tracks: Array = []

func _init(scene_graph: LsdeGraph.SceneGraph, global_registry: LsdeHandlerRegistry, callbacks: Dictionary) -> void:
	_scene_graph = scene_graph
	_global_registry = global_registry
	_scene_registry = LsdeHandlerRegistry.SceneRegistry.new()
	_callbacks = callbacks

# ─── Public API ───────────────────────────────────────────────────────────

func start() -> void:
	if _running:
		return
	_running = true
	_cancelled = false
	if _callbacks.has("on_scene_started"):
		_callbacks["on_scene_started"].call(self)
	_fire_scene_enter()
	var start_block: Variant = _scene_graph.get_start_block()
	if start_block != null:
		_process_block(start_block)
	else:
		_end_scene()

func cancel() -> void:
	if not _running:
		return
	_cancelled = true
	for track in _async_tracks:
		track.cancel()
	_async_tracks.clear()
	if _previous_cleanup.is_valid():
		_previous_cleanup.call()
		_previous_cleanup = Callable()
	_running = false
	_current_block = null
	_fire_scene_exit()
	if _callbacks.has("on_scene_ended"):
		_callbacks["on_scene_ended"].call(self)

func on_enter(handler: Callable) -> void:
	_scene_registry.enter_handler = handler

func on_exit(handler: Callable) -> void:
	_scene_registry.exit_handler = handler

func on_block(block_uuid: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_uuid, handler)

func on_dialog(handler: Callable) -> void:
	_scene_registry.dialog_handler = handler

func on_choice(handler: Callable) -> void:
	_scene_registry.choice_handler = handler

func on_condition(handler: Callable) -> void:
	_scene_registry.condition_handler = handler

func on_action(handler: Callable) -> void:
	_scene_registry.action_handler = handler

func get_current_block() -> Variant:
	return _current_block

func get_visited_blocks() -> Array:
	return _visited

func is_running() -> bool:
	return _running

func get_active_tracks() -> int:
	var count: int = 0
	for track in _async_tracks:
		if track.is_running():
			count += 1
	return count

# ─── Internal API (used by AsyncTrack) ────────────────────────────────────

func _get_scene_registry() -> LsdeHandlerRegistry.SceneRegistry:
	return _scene_registry

func _get_global_registry() -> LsdeHandlerRegistry:
	return _global_registry

func _get_state_bridge() -> Variant:
	if _callbacks.has("get_state_bridge"):
		return _callbacks["get_state_bridge"].call()
	return null

func _add_visited(uuid: String) -> void:
	if not _visited_set.has(uuid):
		_visited.append(uuid)
		_visited_set[uuid] = true

func _remove_track(track: Variant) -> void:
	var idx: int = _async_tracks.find(track)
	if idx >= 0:
		_async_tracks.remove_at(idx)

func _create_block_context(block: Dictionary) -> Variant:
	return _create_context(block)

# ─── Traversal ────────────────────────────────────────────────────────────

func _process_block(block: Dictionary) -> void:
	if _cancelled:
		return

	# Skip NOTE
	if block.get("type", "") == "NOTE":
		var connections: Array = _scene_graph.get_outgoing_connections(block.get("uuid", ""))
		if connections.size() > 0:
			var next_block: Variant = _scene_graph.get_block(connections[0].get("toId", ""))
			if next_block != null:
				_process_block(next_block)
				return
		_end_scene()
		return

	# Validate
	if _global_registry.validate_next_block_handler.is_valid():
		var result: Dictionary = _global_registry.validate_next_block_handler.call({
			"nextBlock": block, "fromBlock": _previous_block, "port": null, "context": {}
		})
		if not result.get("valid", true):
			if _global_registry.invalidate_block_handler.is_valid():
				_global_registry.invalidate_block_handler.call({
					"scene": self, "reason": result.get("reason", "validation_failed")
				})
			return

	if _cancelled:
		return

	_current_block = block
	_add_visited(block.get("uuid", ""))

	# onBeforeBlock
	if _global_registry.before_block_handler.is_valid():
		_global_registry.before_block_handler.call({
			"block": block, "scene": self,
			"context": {"nativeProperties": block.get("nativeProperties")},
			"resolve": Callable(self, "_execute_block_handler").bind(block)
		})
	else:
		_execute_block_handler(block)

func _execute_block_handler(block: Dictionary) -> void:
	if _cancelled:
		return

	var resolved: Dictionary = LsdeHandlerRegistry.resolve_handler(
		block.get("type", ""), block.get("uuid", ""), _scene_registry, _global_registry)

	var context: Variant = _create_context(block)
	if context == null:
		_advance_to_next_block(block, null)
		return

	var scene_handler: Callable = resolved["scene_handler"]
	var global_handler: Callable = resolved["global_handler"]

	# Auto-behavior
	if not scene_handler.is_valid() and not global_handler.is_valid():
		if block.get("type", "") == "CONDITION":
			_auto_evaluate_condition(block, context)
			return
		if block.get("type", "") == "ACTION":
			_auto_execute_action(block, context)
			return

	var state: Array = [false, true]  # [next_called, sync_phase] — Array for ref capture in lambda
	var scene_cleanup: Callable
	var global_cleanup: Callable

	var next_fn: Callable = func() -> void:
		if state[0]:  # next_called
			return
		state[0] = true
		if state[1]:  # sync_phase
			return
		_advance_to_next_block(block, context)

	var args: Dictionary = {"scene": self, "block": block, "context": context, "next": next_fn}

	if scene_handler.is_valid():
		scene_cleanup = scene_handler.call(args)
		if not context.global_prevented and global_handler.is_valid():
			global_cleanup = global_handler.call(args)
	elif global_handler.is_valid():
		global_cleanup = global_handler.call(args)

	_previous_cleanup = _combine_cleanups(scene_cleanup, global_cleanup)

	state[1] = false  # sync_phase = false
	if state[0]:  # next_called
		_advance_to_next_block(block, context)

func _advance_to_next_block(block: Dictionary, context: Variant) -> void:
	if _cancelled:
		return

	_previous_block = block

	var connections: Array = _scene_graph.get_outgoing_connections(block.get("uuid", ""))

	var input: Dictionary = {"block": block, "connections": connections}
	if context is LsdeBlockContext.ChoiceContext:
		input["selectedChoiceUuid"] = context.selected_choice_uuid
	if context is LsdeBlockContext.ConditionContext:
		input["conditionResult"] = context.condition_result
	if context is LsdeBlockContext.ActionContext:
		input["actionRejected"] = context.action_rejected
	if context is LsdeBlockContext.DialogContext:
		input["characterPortIndex"] = context.character_port_index

	var resolved_conns: Array = LsdePortResolver.resolve_port(input)

	# Separate: first non-async = main, rest = async
	var main_connection: Variant = null
	var async_connections: Array = []

	for conn in resolved_conns:
		var target_block: Variant = _scene_graph.get_block(conn.get("toId", ""))
		if target_block == null:
			continue
		var np: Variant = target_block.get("nativeProperties")
		var is_async: bool = np is Dictionary and np.get("isAsync", false)
		if main_connection == null and not is_async:
			main_connection = conn
		else:
			async_connections.append(conn)

	# Spawn async tracks
	for conn in async_connections:
		var target_block: Variant = _scene_graph.get_block(conn.get("toId", ""))
		if target_block != null:
			_async_tracks.append(AsyncTrack.new(_scene_graph, self, target_block))

	# Notify follow-narrative tracks
	for track in _async_tracks:
		if track.is_follow_narrative():
			track.notify_main_advance()

	# Continue main track
	if main_connection != null:
		var next_block: Variant = _scene_graph.get_block(main_connection.get("toId", ""))
		if next_block != null:
			var cleanup_to_run: Callable = _previous_cleanup
			_previous_cleanup = Callable()
			if cleanup_to_run.is_valid():
				cleanup_to_run.call()
			_process_block(next_block)
			return

	_end_scene()

func _end_scene() -> void:
	for track in _async_tracks:
		track.cancel()
	_async_tracks.clear()
	if _previous_cleanup.is_valid():
		_previous_cleanup.call()
		_previous_cleanup = Callable()
	_running = false
	_current_block = null
	_fire_scene_exit()
	if _callbacks.has("on_scene_ended"):
		_callbacks["on_scene_ended"].call(self)

# ─── Auto-behaviors ───────────────────────────────────────────────────────

func _auto_evaluate_condition(block: Dictionary, context: LsdeBlockContext.ConditionContext) -> void:
	var bridge: Variant = _get_state_bridge()
	if bridge == null:
		_end_scene()
		return
	if block.get("type", "") == "CONDITION":
		var conditions: Array = block.get("conditions", [])
		context.condition_result = LsdeConditionEvaluator.evaluate_condition_chain(
			conditions, Callable(bridge, "evaluate_condition"))
	_previous_cleanup = Callable()
	_advance_to_next_block(block, context)

func _auto_execute_action(block: Dictionary, context: LsdeBlockContext.ActionContext) -> void:
	var bridge: Variant = _get_state_bridge()
	if bridge == null:
		_end_scene()
		return
	if block.get("type", "") == "ACTION":
		for action in block.get("actions", []):
			bridge.execute_action(action, null)
	context.action_rejected = false
	_previous_cleanup = Callable()
	_advance_to_next_block(block, context)

# ─── Scene lifecycle ──────────────────────────────────────────────────────

func _fire_scene_enter() -> void:
	var handler: Callable = _scene_registry.enter_handler if _scene_registry.enter_handler.is_valid() else _global_registry.scene_enter_handler
	if handler.is_valid():
		handler.call({"scene": self, "context": {}})
	scene_entered.emit(self)

func _fire_scene_exit() -> void:
	var handler: Callable = _scene_registry.exit_handler if _scene_registry.exit_handler.is_valid() else _global_registry.scene_exit_handler
	if handler.is_valid():
		handler.call({"scene": self, "context": {}})
	scene_exited.emit(self)

# ─── Helpers ──────────────────────────────────────────────────────────────

func _create_context(block: Dictionary) -> Variant:
	match block.get("type", ""):
		"DIALOG":
			return LsdeBlockContext.create_dialog_context(block)
		"CHOICE":
			var bridge: Variant = _get_state_bridge()
			var evaluator: Callable = Callable(bridge, "evaluate_condition") if bridge != null else func(_c: Dictionary) -> bool: return true
			return LsdeBlockContext.create_choice_context(block, evaluator)
		"CONDITION":
			return LsdeBlockContext.create_condition_context()
		"ACTION":
			return LsdeBlockContext.create_action_context()
	return null

static func _combine_cleanups(a: Callable, b: Callable) -> Callable:
	if a.is_valid() and b.is_valid():
		return func() -> void: a.call(); b.call()
	if a.is_valid():
		return a
	if b.is_valid():
		return b
	return Callable()

# ─── AsyncTrack ───────────────────────────────────────────────────────────

class AsyncTrack extends RefCounted:
	var _running: bool = true
	var _current_block: Variant = null
	var _previous_cleanup: Callable
	var _follow_narrative: bool = false
	var _pending_advance: Callable
	var _scene_graph: LsdeGraph.SceneGraph
	var _parent: LsdeSceneHandle

	func _init(scene_graph: LsdeGraph.SceneGraph, parent: LsdeSceneHandle, start_block: Dictionary) -> void:
		_scene_graph = scene_graph
		_parent = parent
		var np: Variant = start_block.get("nativeProperties")
		_follow_narrative = np is Dictionary and np.get("followNarrative", false)
		_process_block(start_block)

	func cancel() -> void:
		if not _running:
			return
		_running = false
		if _previous_cleanup.is_valid():
			_previous_cleanup.call()
			_previous_cleanup = Callable()
		_current_block = null
		_pending_advance = Callable()

	func is_running() -> bool:
		return _running

	func is_follow_narrative() -> bool:
		return _follow_narrative

	func notify_main_advance() -> void:
		if not _running or not _follow_narrative:
			return
		if _pending_advance.is_valid():
			var advance: Callable = _pending_advance
			_pending_advance = Callable()
			advance.call()
		else:
			_force_advance()

	func _process_block(block: Dictionary) -> void:
		if not _running:
			return
		if block.get("type", "") == "NOTE":
			var connections: Array = _scene_graph.get_outgoing_connections(block.get("uuid", ""))
			if connections.size() > 0:
				var next_block: Variant = _scene_graph.get_block(connections[0].get("toId", ""))
				if next_block != null:
					_process_block(next_block)
					return
			_end_track()
			return
		_current_block = block
		_parent._add_visited(block.get("uuid", ""))
		_execute_block_handler(block)

	func _execute_block_handler(block: Dictionary) -> void:
		if not _running:
			return
		var resolved: Dictionary = LsdeHandlerRegistry.resolve_handler(
			block.get("type", ""), block.get("uuid", ""), _parent._get_scene_registry(), _parent._get_global_registry())
		var context: Variant = _parent._create_block_context(block)
		if context == null:
			_advance_to_next_block(block, null)
			return

		var scene_handler: Callable = resolved["scene_handler"]
		var global_handler: Callable = resolved["global_handler"]

		if not scene_handler.is_valid() and not global_handler.is_valid():
			if block.get("type", "") == "CONDITION":
				_auto_evaluate_condition(block, context)
				return
			if block.get("type", "") == "ACTION":
				_auto_execute_action(block, context)
				return

		var state: Array = [false, true]  # [next_called, sync_phase]
		var scene_cleanup: Callable
		var global_cleanup: Callable

		var next_fn: Callable = func() -> void:
			if state[0]:
				return
			state[0] = true
			if _follow_narrative:
				_pending_advance = func() -> void: _advance_to_next_block(block, context)
				return
			if state[1]:
				return
			_advance_to_next_block(block, context)

		var args: Dictionary = {"scene": _parent, "block": block, "context": context, "next": next_fn}

		if scene_handler.is_valid():
			scene_cleanup = scene_handler.call(args)
			if not context.global_prevented and global_handler.is_valid():
				global_cleanup = global_handler.call(args)
		elif global_handler.is_valid():
			global_cleanup = global_handler.call(args)

		_previous_cleanup = LsdeSceneHandle._combine_cleanups(scene_cleanup, global_cleanup)

		state[1] = false
		if state[0] and not _follow_narrative:
			_advance_to_next_block(block, context)

	func _advance_to_next_block(block: Dictionary, context: Variant) -> void:
		if not _running:
			return
		var connections: Array = _scene_graph.get_outgoing_connections(block.get("uuid", ""))
		var input: Dictionary = {"block": block, "connections": connections}
		if context is LsdeBlockContext.ChoiceContext:
			input["selectedChoiceUuid"] = context.selected_choice_uuid
		if context is LsdeBlockContext.ConditionContext:
			input["conditionResult"] = context.condition_result
		if context is LsdeBlockContext.ActionContext:
			input["actionRejected"] = context.action_rejected
		if context is LsdeBlockContext.DialogContext:
			input["characterPortIndex"] = context.character_port_index
		var resolved_conns: Array = LsdePortResolver.resolve_port(input)

		if resolved_conns.size() > 0:
			var conn: Dictionary = resolved_conns[0]
			var next_block: Variant = _scene_graph.get_block(conn.get("toId", ""))
			if next_block != null:
				var cleanup_to_run: Callable = _previous_cleanup
				_previous_cleanup = Callable()
				if cleanup_to_run.is_valid():
					cleanup_to_run.call()
				_process_block(next_block)
				return
		_end_track()

	func _force_advance() -> void:
		if not _running or _current_block == null:
			return
		var block: Dictionary = _current_block
		if _previous_cleanup.is_valid():
			_previous_cleanup.call()
			_previous_cleanup = Callable()
		_advance_to_next_block(block, null)

	func _end_track() -> void:
		if _previous_cleanup.is_valid():
			_previous_cleanup.call()
			_previous_cleanup = Callable()
		_running = false
		_current_block = null
		_parent._remove_track(self)

	func _auto_evaluate_condition(block: Dictionary, context: Variant) -> void:
		var bridge: Variant = _parent._get_state_bridge()
		if bridge == null:
			_end_track()
			return
		if block.get("type", "") == "CONDITION":
			context.condition_result = LsdeConditionEvaluator.evaluate_condition_chain(
				block.get("conditions", []), Callable(bridge, "evaluate_condition"))
		_previous_cleanup = Callable()
		_advance_to_next_block(block, context)

	func _auto_execute_action(block: Dictionary, context: Variant) -> void:
		var bridge: Variant = _parent._get_state_bridge()
		if bridge == null:
			_end_track()
			return
		if block.get("type", "") == "ACTION":
			for action in block.get("actions", []):
				bridge.execute_action(action, null)
		context.action_rejected = false
		_previous_cleanup = Callable()
		_advance_to_next_block(block, context)

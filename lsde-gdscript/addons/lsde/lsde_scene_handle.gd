## LSDE Dialog Engine — SceneHandle + AsyncTrack
##
## Manages the main traversal loop, async tracks, two-tier handler resolution
## (scene Tier 2 + global Tier 1), choice history, and character resolution.
class_name LsdeSceneHandle
extends RefCounted

signal scene_entered(handle)
signal scene_exited(handle)

var _scene_graph: LsdeGraph.SceneGraph
var _global_registry: LsdeHandlerRegistry
var _scene_registry: LsdeHandlerRegistry.SceneRegistry
var _callbacks: Dictionary  # {on_scene_started, on_scene_ended, get_resolve_character, get_choice_filter, get_locale}

var _running: bool = false
var _cancelled: bool = false
var _current_block: Variant = null
var _previous_block: Variant = null
var _visited: Array = []  # ordered list of visited UUIDs
var _visited_set: Dictionary = {}  # fast lookup
var _choice_history: Dictionary = {}  # {block_uuid: [choice_uuid, ...]}
var _previous_cleanup: Callable
var _async_tracks: Array = []
## Scene-level character resolver override.
var _resolve_character: Callable

func _init(scene_graph: LsdeGraph.SceneGraph, global_registry: LsdeHandlerRegistry, callbacks: Dictionary) -> void:
	_scene_graph = scene_graph
	_global_registry = global_registry
	_scene_registry = LsdeHandlerRegistry.SceneRegistry.new()
	_callbacks = callbacks

# ─── Public API ───────────────────────────────────────────────────────────

## Start the scene flow from the entry block.
## Validates that all 4 mandatory handlers are registered — asserts if any are missing.
func start() -> void:
	if _running:
		return

	# Validate mandatory handlers
	var missing: Array = []
	if not _scene_registry.dialog_handler.is_valid() and not _global_registry.dialog_handler.is_valid():
		missing.append("on_dialog")
	if not _scene_registry.choice_handler.is_valid() and not _global_registry.choice_handler.is_valid():
		missing.append("on_choice")
	if not _scene_registry.condition_handler.is_valid() and not _global_registry.condition_handler.is_valid():
		missing.append("on_condition")
	if not _scene_registry.action_handler.is_valid() and not _global_registry.action_handler.is_valid():
		missing.append("on_action")
	if missing.size() > 0:
		assert(false, "Cannot start scene — missing required handler(s): %s.\nRegister all 4 handlers before starting:\n  engine.on_dialog(handler)\n  engine.on_choice(handler)\n  engine.on_condition(handler)\n  engine.on_action(handler)" % ", ".join(missing))

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

## Cancel the scene flow. All async tracks are cancelled, cleanup runs, on_scene_exit fires.
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

## Override the global on_scene_enter for this scene.
func on_enter(handler: Callable) -> void:
	_scene_registry.enter_handler = handler

## Override the global on_scene_exit for this scene.
func on_exit(handler: Callable) -> void:
	_scene_registry.exit_handler = handler

## Override a specific block by UUID. Takes highest priority over type handlers.
func on_block(block_uuid: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_uuid, handler)

## Override all DIALOG blocks for this scene (Tier 2).
func on_dialog(handler: Callable) -> void:
	_scene_registry.dialog_handler = handler

## Override all CHOICE blocks for this scene (Tier 2).
func on_choice(handler: Callable) -> void:
	_scene_registry.choice_handler = handler

## Override all CONDITION blocks for this scene (Tier 2).
func on_condition(handler: Callable) -> void:
	_scene_registry.condition_handler = handler

## Override all ACTION blocks for this scene (Tier 2).
func on_action(handler: Callable) -> void:
	_scene_registry.action_handler = handler

## Get the block currently being executed, or null.
func get_current_block() -> Variant:
	return _current_block

## Get UUIDs of all blocks visited so far, in order.
func get_visited_blocks() -> Array:
	return _visited

## Check if the scene flow is currently active.
func is_running() -> bool:
	return _running

## Get the number of async tracks currently running in parallel.
func get_active_tracks() -> int:
	var count: int = 0
	for track in _async_tracks:
		if track.is_running():
			count += 1
	return count

## Get the full choice history. Keys are block UUIDs, values are arrays of selected choice UUIDs.
func get_choice_history() -> Dictionary:
	return _choice_history

## Get the choice(s) selected at a specific block. Returns null if block never visited as choice.
func get_choice(block_uuid: String) -> Variant:
	return _choice_history.get(block_uuid)

## Evaluate a condition. Handles choice: conditions via internal choice history.
## Returns false for non-choice conditions (the engine cannot evaluate game state).
func evaluate_condition(condition: Dictionary) -> bool:
	return _evaluate_condition_with_history(condition, func(_c: Dictionary) -> bool: return false)

## Override character resolution for this scene. Defaults to engine-level resolver.
func on_resolve_character(resolver: Callable) -> void:
	_resolve_character = resolver

# ─── Internal API (used by AsyncTrack) ────────────────────────────────────

func _get_scene_registry() -> LsdeHandlerRegistry.SceneRegistry:
	return _scene_registry

func _get_global_registry() -> LsdeHandlerRegistry:
	return _global_registry

func _add_visited(uuid: String) -> void:
	if not _visited_set.has(uuid):
		_visited.append(uuid)
		_visited_set[uuid] = true

func _remove_track(track: Variant) -> void:
	var idx: int = _async_tracks.find(track)
	if idx >= 0:
		_async_tracks.remove_at(idx)

## Create the appropriate context for a block.
func _create_block_context(block: Dictionary) -> Variant:
	return _create_context(block)

## Record a choice selection in the history.
func _record_choice(block_uuid: String, choice_uuid: String) -> void:
	if not _choice_history.has(block_uuid):
		_choice_history[block_uuid] = []
	_choice_history[block_uuid].append(choice_uuid)

## Evaluate a condition with choice history support.
func _evaluate_condition_for_block(condition: Dictionary, fallback_evaluator: Callable) -> bool:
	return _evaluate_condition_with_history(condition, fallback_evaluator)

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

	# No handler → advance silently (handlers are validated at start())
	if not scene_handler.is_valid() and not global_handler.is_valid():
		_advance_to_next_block(block, context)
		return

	var state: Array = [false, true]  # [next_called, sync_phase]
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

	# Error boundary
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

# ─── Choice history condition evaluation ──────────────────────────────────

func _evaluate_condition_with_history(condition: Dictionary, fallback_evaluator: Callable) -> bool:
	var key: String = condition.get("key", "")
	if key.begins_with("choice:"):
		var block_uuid: String = key.substr(7)
		var history: Variant = _choice_history.get(block_uuid)
		if history == null:
			return condition.get("operator", "") == "!="
		var includes: bool = history.has(condition.get("value", ""))
		return not includes if condition.get("operator", "") == "!=" else includes
	return fallback_evaluator.call(condition)

# ─── Choice visibility tagging ────────────────────────────────────────────

func _tag_choice_visibility(choices: Array, filter: Callable) -> Array:
	var result: Array = []
	for choice in choices:
		var tagged: Dictionary = choice.duplicate()
		if not filter.is_valid():
			# No filter → no visible tag (treat as visible by default)
			result.append(tagged)
			continue
		var vis_conds: Array = choice.get("visibilityConditions", [])
		if vis_conds.size() == 0:
			tagged["visible"] = true
		else:
			tagged["visible"] = LsdeConditionEvaluator.evaluate_condition_chain(vis_conds, func(cond: Dictionary) -> bool:
				if cond.get("key", "").begins_with("choice:"):
					return _evaluate_condition_with_history(cond, func(_c: Dictionary) -> bool: return false)
				return filter.call(cond)
			)
		result.append(tagged)
	return result

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

# ─── Internal helpers ─────────────────────────────────────────────────────

## Returns the scene-level resolver if set, otherwise the engine-level resolver.
func _get_resolve_character_fn() -> Callable:
	if _resolve_character.is_valid():
		return _resolve_character
	if _callbacks.has("get_resolve_character"):
		return _callbacks["get_resolve_character"].call()
	return func(chars: Array) -> Variant: return chars[0] if chars.size() > 0 else null

func _create_context(block: Dictionary) -> Variant:
	var characters: Array = []
	var metadata: Variant = block.get("metadata")
	if metadata is Dictionary:
		characters = metadata.get("characters", [])
	var resolver_fn: Callable = _get_resolve_character_fn()
	var resolved_character: Variant = resolver_fn.call(characters) if resolver_fn.is_valid() else null

	match block.get("type", ""):
		"DIALOG":
			return LsdeBlockContext.create_dialog_context(block, resolved_character)
		"CHOICE":
			var choice_filter: Callable = Callable()
			if _callbacks.has("get_choice_filter"):
				choice_filter = _callbacks["get_choice_filter"].call()
			var tagged_choices: Array = _tag_choice_visibility(block.get("choices", []), choice_filter)
			var on_choice_selected: Callable = func(block_uuid: String, choice_uuid: String) -> void:
				_record_choice(block_uuid, choice_uuid)
			return LsdeBlockContext.create_choice_context(block, tagged_choices, resolved_character, on_choice_selected)
		"CONDITION":
			return LsdeBlockContext.create_condition_context(resolved_character)
		"ACTION":
			return LsdeBlockContext.create_action_context(resolved_character)
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

## Parallel execution branch spawned from async connections.
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

	## Called by the main track when it advances. Triggers pending follow-narrative advance.
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

		# No handler → advance silently (handlers are validated at start())
		if not scene_handler.is_valid() and not global_handler.is_valid():
			_advance_to_next_block(block, context)
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

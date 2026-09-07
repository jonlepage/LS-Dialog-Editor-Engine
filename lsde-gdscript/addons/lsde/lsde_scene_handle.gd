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
var _callbacks: Dictionary  # {on_scene_started, on_scene_ended, get_resolve_character, get_condition_resolver, get_card}

var _running: bool = false
var _cancelled: bool = false
var _current_block: Variant = null
var _previous_block: Variant = null
var _previous_character: Variant = null
var _visited: Array = []  # ordered list of visited UUIDs
var _visited_set: Dictionary = {}  # fast lookup
var _choice_history: Dictionary = {}  # {block_id: [option_id, ...]}
var _previous_cleanup: Callable
var _async_tracks: Array = []
var _next_track_id: int = 1
## Tracks - and the main flow - parked until a set of blocks has been visited.
##
## waitForBlocks is a property of the BLOCK: "the block waits for these before it advances", in the
## format's own words. Only AsyncTrack read it, so a designer who set it on a block of the main flow
## got nothing at all, silently, with the checkbox ticked in the editor.
var _pending_waits: Dictionary = {}  # {AsyncTrack | LsdeSceneHandle: [block_ids]}
## The main flow's own parked advance, when its block carries waitForBlocks.
var _pending_advance: Callable
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
	# on_condition is optional when on_resolve_condition is installed
	var cond_resolver: Callable = _callbacks.get("get_condition_resolver", Callable()).call() if _callbacks.has("get_condition_resolver") else Callable()
	if not _scene_registry.condition_handler.is_valid() and not _global_registry.condition_handler.is_valid() and not cond_resolver.is_valid():
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
	_pending_waits.clear()
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

## Override a specific block by id. Takes highest priority over type handlers.
func on_block(block_id: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_id, handler)

## Override a specific DIALOG block by id (type-safe convenience).
func on_dialog_id(block_id: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_id, handler)

## Override a specific CHOICE block by id (type-safe convenience).
func on_choice_id(block_id: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_id, handler)

## Override a specific CONDITION block by id (type-safe convenience).
func on_condition_id(block_id: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_id, handler)

## Override a specific ACTION block by id (type-safe convenience).
func on_action_id(block_id: String, handler: Callable) -> void:
	_scene_registry.set_block_handler(block_id, handler)

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

## Get detailed info for all currently running async tracks.
func get_track_infos() -> Array:
	var result: Array = []
	for track in _async_tracks:
		if track.is_running():
			result.append(track.get_track_info())
	return result

## Get the full choice history. Keys are block UUIDs, values are arrays of selected choice UUIDs.
func get_choice_history() -> Dictionary:
	return _choice_history

## Get the choice(s) selected at a specific block. Returns null if block never visited as choice.
func get_choice(block_id: String) -> Variant:
	return _choice_history.get(block_id)

## Evaluate a condition. Handles choice: conditions via internal choice history.
## Returns false for non-choice conditions (the engine cannot evaluate game state).
## Uses the unified resolver as fallback for non-choice conditions.
## Without a resolver, non-choice conditions default to false.
func evaluate_condition(condition: Dictionary) -> bool:
	var resolver: Callable = _callbacks.get("get_condition_resolver", Callable()).call() if _callbacks.has("get_condition_resolver") else Callable()
	if resolver.is_valid():
		return _evaluate_condition_with_history(condition, resolver)
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
	if _pending_waits.size() > 0:
		var satisfied: Array = []
		for waiter in _pending_waits:
			var required: Array = _pending_waits[waiter]
			var all_visited: bool = true
			for u in required:
				if not _visited_set.has(u):
					all_visited = false
					break
			if all_visited:
				satisfied.append(waiter)
		for waiter in satisfied:
			_pending_waits.erase(waiter)
			waiter.notify_wait_satisfied()

## Spawn a new async track in the flat pool. Returns the assigned track ID.
func _spawn_async_track(start_block: Dictionary, parent_track_id: int) -> int:
	var track_id: int = _next_track_id
	_next_track_id += 1
	var track: AsyncTrack = AsyncTrack.new(_scene_graph, self, start_block, track_id, parent_track_id)
	_async_tracks.append(track)
	track.start()
	return track_id

## Cancel a specific track by ID (used for parent->child cascade).
func _cancel_track(track_id: int) -> void:
	for track in _async_tracks:
		if track.id == track_id:
			track.cancel()
			return

## Register a track as waiting for specific block UUIDs to be visited.
## Park a track - or the main flow - until every listed block has been visited.
func _register_wait_for_blocks(waiter: Variant, block_ids: Array) -> void:
	_pending_waits[waiter] = block_ids


## Called once every block this flow was waiting on has been visited.
func notify_wait_satisfied() -> void:
	if not _running or _cancelled or not _pending_advance.is_valid():
		return
	var advance: Callable = _pending_advance
	_pending_advance = Callable()
	advance.call()

## Check if a block UUID has been visited in this scene.
## Run on_validate_next_block for a block, and on_invalidate_block when it refuses.
##
## Called by BOTH the main flow and every parallel track. It used to live inline in the main flow
## only, so a game using this hook as a gate - "do not enter this block unless the player has the
## keycard" - was bypassed the moment a branch was marked isAsync. Nothing in the hook's contract
## said it only applied to the flow the player was watching, and nothing on screen would have told
## anyone.
##
## Returns false when the caller must stop rather than dispatch the block.
func _run_validation(block: Dictionary, from_block: Variant, from_character: Variant) -> bool:
	if not _global_registry.validate_next_block_handler.is_valid():
		return true

	var from_ctx: Variant = {"character": from_character} if from_block != null else null
	var result: Dictionary = _global_registry.validate_next_block_handler.call({
		"nextBlock": block, "fromBlock": from_block,
		"nextContext": {"character": _resolve_cards_for(block).get("character")},
		"fromContext": from_ctx,
		"port": null
	})
	if result.get("valid", true):
		return true

	if _global_registry.invalidate_block_handler.is_valid():
		_global_registry.invalidate_block_handler.call({
			"scene": self, "reason": result.get("reason", "validation_failed")
		})
	return false


func _is_visited(uuid: String) -> bool:
	return _visited_set.has(uuid)

func _remove_track(track: Variant) -> void:
	var idx: int = _async_tracks.find(track)
	if idx >= 0:
		_async_tracks.remove_at(idx)

## Create the appropriate context for a block.
func _create_block_context(block: Dictionary) -> Variant:
	return _create_context(block)

## Record a choice selection in the history.
func _record_choice(block_id: String, option_id: String) -> void:
	if not _choice_history.has(block_id):
		_choice_history[block_id] = []
	_choice_history[block_id].append(option_id)

## Evaluate a condition with choice history support.
func _evaluate_condition_for_block(condition: Dictionary, fallback_evaluator: Callable) -> bool:
	return _evaluate_condition_with_history(condition, fallback_evaluator)

# ─── Traversal ────────────────────────────────────────────────────────────

func _process_block(starting_block: Dictionary) -> void:
	if not _running or _cancelled:
		return

	# Skip NOTE
	var skipped: Variant = LsdeSceneHandle._skip_notes(starting_block, _scene_graph)
	if skipped == null:
		_end_scene()
		return
	var block: Dictionary = skipped

	# Validate
	if not _run_validation(block, _previous_block, _previous_character):
		return

	if _cancelled:
		return

	_current_block = block
	_add_visited(block.get("id", ""))

	# onBeforeBlock
	if _global_registry.before_block_handler.is_valid():
		# GUARDED like next(): a delay timer that fires twice would otherwise dispatch
		# the same block twice. The flag lives in an Array because a lambda captures by
		# value, and an Array is the one capture GDScript lets us mutate from inside.
		var resolved_once: Array = [false]
		var resolve_fn: Callable = func() -> void:
			if resolved_once[0]:
				return
			resolved_once[0] = true
			_execute_block_handler(block)
		_global_registry.before_block_handler.call({
			"block": block, "scene": self,
			"context": {"nativeProperties": LsdeUtils.get_native_properties(block)},
			"resolve": resolve_fn
		})
	else:
		_execute_block_handler(block)

func _execute_block_handler(block: Dictionary) -> void:
	# `_running` and not just `_cancelled`: a resolve() kept in a closure and fired after
	# the scene ended on its own would otherwise restart traversal on a dead scene.
	if not _running or _cancelled:
		return

	var resolved: Dictionary = LsdeHandlerRegistry.resolve_handler(
		block.get("type", ""), block.get("id", ""), _scene_registry, _global_registry)

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
	var scene_cleanup: Variant
	var global_cleanup: Variant

	var next_fn: Callable = func() -> void:
		if state[0]:  # next_called
			return
		state[0] = true

		# waitForBlocks: park until every listed block has been visited. The main flow honours it
		# exactly like a parallel track - this is the join half of the fork isAsync opens.
		var wait_blocks: Array = LsdeUtils.get_native_properties(block).get("waitForBlocks", [])
		if wait_blocks.size() > 0:
			var all_visited: bool = true
			for wait_id in wait_blocks:
				if not _is_visited(wait_id):
					all_visited = false
					break
			if not all_visited:
				_pending_advance = func() -> void: _advance_to_next_block(block, context)
				_register_wait_for_blocks(self, wait_blocks)
				return

		if state[1]:  # sync_phase
			return
		_advance_to_next_block(block, context)

	var args: Dictionary = {"scene": self, "block": block, "context": context, "next": next_fn}

	# NOT an error boundary, unlike the other three runtimes: GDScript has no exceptions, so there
	# is nothing here to catch and nothing that can escape. A script error pushes to the Godot log
	# and the call returns null.
	if scene_handler.is_valid():
		scene_cleanup = scene_handler.call(args)
		if not context.global_prevented and global_handler.is_valid():
			global_cleanup = global_handler.call(args)
	elif global_handler.is_valid():
		global_cleanup = global_handler.call(args)

	_previous_cleanup = _combine_cleanups(scene_cleanup, global_cleanup)

	# Unless the block is parked on waitForBlocks: releasing it is notify_wait_satisfied's job.
	state[1] = false  # sync_phase = false
	if state[0] and not _pending_advance.is_valid():  # next_called
		_advance_to_next_block(block, context)

func _advance_to_next_block(block: Dictionary, context: Variant) -> void:
	if _cancelled:
		return

	_previous_block = block
	_previous_character = context.character if context != null else null

	var links: Array = _scene_graph.get_outgoing_links(block.get("id", ""))

	var input: Dictionary = {"block": block, "links": links}
	if context is LsdeBlockContext.ChoiceContext:
		input["selectedOptionId"] = context.selected_option_id
	if context is LsdeBlockContext.ConditionContext:
		input["conditionPort"] = context.condition_port
	if context is LsdeBlockContext.ActionContext:
		input["actionRejected"] = context.action_rejected
	if context is LsdeBlockContext.DialogContext:
		input["actorPort"] = context.actor_port

	var resolved_links: Array = LsdePortResolver.resolve_port(input)

	# Separate: first non-async = main, rest = async
	var main_link: Variant = null
	var async_links: Array = []

	for link in resolved_links:
		var target_block: Variant = _scene_graph.get_block(link.get("to", ""))
		if target_block == null:
			continue
		if main_link == null and not _is_async_block(target_block):
			main_link = link
		else:
			async_links.append(link)


	# Spawn async tracks
	for link in async_links:
		var target_block: Variant = _scene_graph.get_block(link.get("to", ""))
		if target_block != null:
			_spawn_async_track(target_block, -1)

	# Continue main track
	if main_link != null:
		var next_block: Variant = _scene_graph.get_block(main_link.get("to", ""))
		if next_block != null:
			var cleanup_to_run: Callable = _previous_cleanup
			_previous_cleanup = Callable()
			if cleanup_to_run.is_valid():
				cleanup_to_run.call()
			_process_block(next_block)
			return

	_end_scene()

func _end_scene() -> void:
	_pending_waits.clear()
	_pending_advance = Callable()
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

## Answer a test, taking the reserved "choice" dictionary on ourselves.
##
## { dict: "choice", entry: "CHOICE-001", value: "C1" } asks whether the player picked C1 at
## CHOICE-001 earlier IN THIS SCENE. The engine kept that history, so the question never reaches
## the game: it would otherwise have to mirror a record the engine already holds, and the two
## would drift. The memory starts and ends with the scene.
##
## A block that was never reached answers false for equals, and true for notEquals.
func _evaluate_condition_with_history(test: Dictionary, fallback_evaluator: Callable) -> bool:
	if test.get("dict", "") != LsdeTypes.DICT_CHOICE:
		return fallback_evaluator.call(test)

	var negated: bool = test.get("op", "") == LsdeTypes.OP_NOT_EQUALS
	var history: Variant = _choice_history.get(test.get("entry", ""))
	if history == null:
		return negated

	var picked: bool = history.has(test.get("value"))
	return not picked if negated else picked

## The evaluator that ROUTES a condition block. Always present.
##
## With no game resolver installed it still answers "choice" tests on its own, and says false to
## anything about game state — a scene that only asks about its own past answers therefore plays
## without a single line of game code, and one that asks about the world takes its default branch
## rather than stalling.
func _routing_evaluator() -> Callable:
	var resolver: Callable = Callable()
	if _callbacks.has("get_condition_resolver"):
		resolver = _callbacks["get_condition_resolver"].call()

	if not resolver.is_valid():
		return func(test: Dictionary) -> bool:
			if test.get("dict", "") != LsdeTypes.DICT_CHOICE:
				return false
			return _evaluate_condition_with_history(test, func(_t: Dictionary) -> bool: return false)

	return func(test: Dictionary) -> bool:
		return _evaluate_condition_with_history(test, resolver)

## The evaluator that TAGS option visibility, or null when there is no game resolver.
##
## Routing and tagging cannot share one answer here. Routing has to pick a branch, so an
## unanswerable test has to become false. An option has no such obligation: saying false about a
## question nobody could answer would HIDE an answer from the player. Null says unknown, and a game
## reading `visible != false` still offers it.
func _visibility_evaluator() -> Variant:
	var resolver: Callable = Callable()
	if _callbacks.has("get_condition_resolver"):
		resolver = _callbacks["get_condition_resolver"].call()
	if not resolver.is_valid():
		return null
	return func(test: Dictionary) -> bool:
		return _evaluate_condition_with_history(test, resolver)

## Look up the cards a block cites, and let the game pick which actor is speaking.
func _resolve_cards_for(block: Dictionary) -> Dictionary:
	var lookup: Callable = func(_id: String) -> Variant: return null
	if _callbacks.has("get_card"):
		lookup = _callbacks["get_card"]
	return LsdeBlockContext.resolve_cards(block, lookup, _get_resolve_character_fn())

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

# Cards are resolved fresh every time, never cached. This runs for the main track AND for async
# tracks (through _create_block_context), and a cache would leak the main track's actor into a
# track released later by waitForBlocks.
func _create_context(block: Dictionary) -> Variant:
	var cards: Dictionary = _resolve_cards_for(block)

	match block.get("type", ""):
		LsdeTypes.BLOCK_DIALOG:
			return LsdeBlockContext.DialogContext.new(block, cards)

		LsdeTypes.BLOCK_CHOICE:
			var options: Array = LsdeConditionEvaluator.tag_option_visibility(
				block.get("options", []), _visibility_evaluator())
			var on_choice_selected: Callable = func(block_id: String, option_id: String) -> void:
				_record_choice(block_id, option_id)
			return LsdeBlockContext.ChoiceContext.new(block, cards, options, on_choice_selected)

		LsdeTypes.BLOCK_CONDITION:
			var evaluate: Callable = _routing_evaluator()
			var natives: Dictionary = LsdeUtils.get_native_properties(block)
			var port_per_case: bool = natives.get("portPerCase", false) == true
			var raw_cases: Array = block.get("cases", [])

			# Every case is evaluated up front, so the handler is handed results rather than
			# questions. With a resolver installed the engine already knows where to go, which is
			# what makes on_condition optional: the handler becomes a log or override hook.
			var cases: Array = []
			for raw_case in raw_cases:
				cases.append({
					"port": raw_case.get("port", ""),
					"when": raw_case.get("when"),
					"result": LsdeConditionEvaluator.evaluate_condition_chain(raw_case.get("when"), evaluate),
				})

			# ONCE. The port is read off these same results rather than re-asking the game: each
			# test reaches on_resolve_condition exactly one time, whatever the mode and whichever
			# case matches.
			var results: Array = []
			for c in cases:
				results.append(c["result"] == true)

			var ctx := LsdeBlockContext.ConditionContext.new(block, cards, cases)
			ctx.condition_port = LsdeConditionEvaluator.pick_port_from_results(
				raw_cases, port_per_case, results)
			return ctx

		LsdeTypes.BLOCK_ACTION:
			return LsdeBlockContext.ActionContext.new(block, cards)

	return null

## Walk past NOTE blocks to the first block the engine actually dispatches.
##
## NOTE blocks are designer-only: they carry no handler and are never executed, so the
## traversal steps over them and follows their first outgoing link.
##
## Returns null when the walk runs out of links — and also when it comes back to a
## NOTE it already stepped over. A designer can wire a NOTE into a loop, and following it
## recursively overflowed the stack instead of ending the flow.
static func _skip_notes(block: Dictionary, scene_graph: LsdeGraph.SceneGraph) -> Variant:
	var current: Variant = block
	var seen: Dictionary = {}

	while current != null and current.get("type", "") == LsdeTypes.BLOCK_NOTE:
		var id: String = current.get("id", "")
		if seen.has(id):
			return null
		seen[id] = true

		var links: Array = scene_graph.get_outgoing_links(id)
		current = scene_graph.get_block(links[0].get("to", "")) if links.size() > 0 else null

	return current

## Is this block marked to run on a parallel track?
##
## The natives live in `props` alongside the writer's own properties. Ids cannot collide — LSDE
## refuses a project property that takes a native name — so this is a lookup, not a guess.
static func _is_async_block(block: Dictionary) -> bool:
	var props: Variant = block.get("props")
	return props is Dictionary and props.get("isAsync") == true

static func _safe_cleanup(v: Variant) -> Callable:
	return v if v is Callable and v.is_valid() else Callable()

static func _combine_cleanups(a: Variant, b: Variant) -> Callable:
	var ca: Callable = _safe_cleanup(a)
	var cb: Callable = _safe_cleanup(b)
	if ca.is_valid() and cb.is_valid():
		return func() -> void: ca.call(); cb.call()
	if ca.is_valid():
		return ca
	if cb.is_valid():
		return cb
	return Callable()

# ─── AsyncTrack ───────────────────────────────────────────────────────────

## Parallel execution branch spawned from async connections.
## Supports sub-track spawning, waitForBlocks synchronization, and cancel cascade.
class AsyncTrack extends RefCounted:
	var _running: bool = true
	var _current_block: Variant = null
	## The block this track came from, for on_validate_next_block. Its own, not the main flow's.
	var _previous_block: Variant = null
	var _previous_character: Variant = null
	var _previous_cleanup: Callable
	var _pending_advance: Callable
	var _child_track_ids: Array = []

	## Unique auto-incremented identifier for this track within the scene.
	var id: int
	## ID of the parent track (-1 = spawned by main).
	var parent_track_id: int
	## UUID of the block that started this track.
	var start_block_id: String

	var _start_block: Dictionary
	var _scene_graph: LsdeGraph.SceneGraph
	var _parent: LsdeSceneHandle

	func _init(scene_graph: LsdeGraph.SceneGraph, parent: LsdeSceneHandle, start_block: Dictionary, track_id: int, parent_id: int) -> void:
		_scene_graph = scene_graph
		_parent = parent
		_start_block = start_block
		id = track_id
		parent_track_id = parent_id
		start_block_id = start_block.get("id", "")

	## Begin track execution. Must be called after the track is added to the pool.
	func start() -> void:
		var natives: Dictionary = LsdeUtils.get_native_properties(_start_block)
		if true:
			var wait_blocks: Array = natives.get("waitForBlocks", [])
			if wait_blocks.size() > 0:
				var all_visited: bool = true
				for uuid in wait_blocks:
					if not _parent._is_visited(uuid):
						all_visited = false
						break
				if not all_visited:
					_pending_advance = func() -> void: _process_block(_start_block)
					_parent._register_wait_for_blocks(self, wait_blocks)
					return
		_process_block(_start_block)

	func cancel() -> void:
		if not _running:
			return
		_running = false
		if _previous_cleanup.is_valid():
			_previous_cleanup.call()
			_previous_cleanup = Callable()
		_current_block = null
		_pending_advance = Callable()
		for child_id in _child_track_ids:
			_parent._cancel_track(child_id)
		_child_track_ids.clear()

	func is_running() -> bool:
		return _running

	## Called by the parent handle when all waitForBlocks UUIDs have been visited.
	func notify_wait_satisfied() -> void:
		if not _running or not _pending_advance.is_valid():
			return
		var advance: Callable = _pending_advance
		_pending_advance = Callable()
		advance.call()

	## Build a read-only snapshot of this track's state for the public API.
	func get_track_info() -> Dictionary:
		return {
			"id": id,
			"parentTrackId": parent_track_id,
			"startBlockUuid": start_block_id,
			"currentBlockUuid": _current_block.get("id", "") if _current_block != null else "",
			"running": _running
		}

	func _process_block(starting_block: Dictionary) -> void:
		if not _running:
			return
		var skipped: Variant = LsdeSceneHandle._skip_notes(starting_block, _scene_graph)
		if skipped == null:
			_end_track()
			return
		var block: Dictionary = skipped

		# The same gate the main flow goes through. A parallel track is still the game's dialogue.
		if not _parent._run_validation(block, _previous_block, _previous_character):
			return

		_current_block = block
		_parent._add_visited(block.get("id", ""))

		# Fire onBeforeBlock — same gate pattern as SceneHandleImpl._process_block
		var registry: LsdeHandlerRegistry = _parent._get_global_registry()
		if registry.before_block_handler.is_valid():
			var resolved_once: Array = [false]
			var resolve_fn: Callable = func() -> void:
				if resolved_once[0]:
					return
				resolved_once[0] = true
				_execute_block_handler(block)
			registry.before_block_handler.call({
				"block": block, "scene": _parent,
				"context": {"nativeProperties": LsdeUtils.get_native_properties(block)},
				"resolve": resolve_fn
			})
		else:
			_execute_block_handler(block)

	func _execute_block_handler(block: Dictionary) -> void:
		if not _running:
			return
		var resolved: Dictionary = LsdeHandlerRegistry.resolve_handler(
			block.get("type", ""), block.get("id", ""), _parent._get_scene_registry(), _parent._get_global_registry())
		var context: Variant = _parent._create_block_context(block)
		if context == null:
			_advance_to_next_block(block, null)
			return

		var scene_handler: Callable = resolved["scene_handler"]
		var global_handler: Callable = resolved["global_handler"]

		if not scene_handler.is_valid() and not global_handler.is_valid():
			_advance_to_next_block(block, context)
			return

		var state: Array = [false, true, false]  # [next_called, sync_phase, has_pending]
		var scene_cleanup: Variant
		var global_cleanup: Variant

		var next_fn: Callable = func() -> void:
			if state[0]:
				return
			state[0] = true

			# waitForBlocks: defer advance until all required blocks are visited
			var natives: Dictionary = LsdeUtils.get_native_properties(block)
			if true:
				var wait_blocks: Array = natives.get("waitForBlocks", [])
				if wait_blocks.size() > 0:
					var all_visited: bool = true
					for uuid in wait_blocks:
						if not _parent._is_visited(uuid):
							all_visited = false
							break
					if not all_visited:
						_pending_advance = func() -> void: _advance_to_next_block(block, context)
						_parent._register_wait_for_blocks(self, wait_blocks)
						state[2] = true  # has_pending
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
		if state[0] and not state[2]:  # next_called and not has_pending
			_advance_to_next_block(block, context)

	func _advance_to_next_block(block: Dictionary, context: Variant) -> void:
		if not _running:
			return

		_previous_block = block
		_previous_character = context.character if context != null else null
		var links: Array = _scene_graph.get_outgoing_links(block.get("id", ""))
		var input: Dictionary = {"block": block, "links": links}
		if context is LsdeBlockContext.ChoiceContext:
			input["selectedOptionId"] = context.selected_option_id
		if context is LsdeBlockContext.ConditionContext:
			input["conditionPort"] = context.condition_port
		if context is LsdeBlockContext.ActionContext:
			input["actionRejected"] = context.action_rejected
		if context is LsdeBlockContext.DialogContext:
			input["actorPort"] = context.actor_port
		var resolved_links: Array = LsdePortResolver.resolve_port(input)

		# Separate main (first non-async) from async connections
		var main_link: Variant = null
		var async_links: Array = []

		for link in resolved_links:
			var target_block: Variant = _scene_graph.get_block(link.get("to", ""))
			if target_block == null:
				continue
			if main_link == null and not LsdeSceneHandle._is_async_block(target_block):
				main_link = link
			else:
				async_links.append(link)

		# Spawn sub-tracks
		for link in async_links:
			var target_block: Variant = _scene_graph.get_block(link.get("to", ""))
			if target_block != null:
				var track_id: int = _parent._spawn_async_track(target_block, self.id)
				_child_track_ids.append(track_id)

		if main_link != null:
			var next_block: Variant = _scene_graph.get_block(main_link.get("to", ""))
			if next_block != null:
				var cleanup_to_run: Callable = _previous_cleanup
				_previous_cleanup = Callable()
				if cleanup_to_run.is_valid():
					cleanup_to_run.call()
				_process_block(next_block)
				return
		_end_track()

	func _end_track() -> void:
		if _previous_cleanup.is_valid():
			_previous_cleanup.call()
			_previous_cleanup = Callable()
		# Child tracks survive — only explicit cancel() cascades
		_running = false
		_current_block = null
		_parent._remove_track(self)

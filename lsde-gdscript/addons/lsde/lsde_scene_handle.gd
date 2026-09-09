## LSDE Dialog Engine — SceneHandle: the scene and everything its tracks share
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

# ─── Shared by every track of this scene ──────────────────────────────────
var _visited: Array = []  # ordered list of visited block ids
var _visited_set: Dictionary = {}  # fast lookup

## Blocks this scene has FINISHED, which is not the same as blocks it reached.
##
## A block joins _visited_set when it is dispatched and _completed_set when the track leaves it:
## the game called next(), the exit port was resolved and the cleanup has run. The two answer two
## different questions, and only one of them is waitForBlocks. It used to be the visited set,
## which made the property nearly inert - a join is normally drawn onto blocks dispatched a
## fraction of a millisecond earlier, so the wait lifted in the very tick it was registered.
var _completed_set: Dictionary = {}
var _choice_history: Dictionary = {}  # {block_id: [option_id, ...]}

# ─── The tracks ───────────────────────────────────────────────────────────
## Every live track, the main flow first.
var _tracks: Array = []
## The flow the player is watching. Null until start().
var _main_track: Variant = null
## Auto-incremented track id. LsdeTrack.MAIN_TRACK_ID (0) belongs to the main flow.
var _next_track_id: int = LsdeTrack.MAIN_TRACK_ID + 1
## Tracks - and the main flow - parked until a set of blocks has FINISHED.
##
## waitForBlocks is a property of the BLOCK: "the block waits for these before it advances", in the
## format's own words. Only the parallel copy read it, so a designer who set it on a block of the main flow
## got nothing at all, silently, with the checkbox ticked in the editor.
var _pending_waits: Dictionary = {}  # {LsdeTrack: [block_ids]}
## Scene-level character resolver override.
var _resolve_character: Callable

func _init(scene_graph: LsdeGraph.SceneGraph, global_registry: LsdeHandlerRegistry, callbacks: Dictionary) -> void:
	_scene_graph = scene_graph
	_global_registry = global_registry
	_scene_registry = LsdeHandlerRegistry.SceneRegistry.new()
	_callbacks = callbacks

# ─── Public API ───────────────────────────────────────────────────────────

## Start the scene flow from the entry block.
## Asserts when a type handler the scene needs is missing. on_condition is optional once
## on_resolve_condition is installed, and a ROUTER block needs no handler at all.
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
		# push_error and refuse to start, not assert: assert() is STRIPPED from a Godot release
		# export, so a shipped game started the scene anyway — with no handler for any block type
		# the traversal walked the whole graph dispatching nothing. An invisible dialogue that
		# reported no error at all. The other three runtimes throw; here the scene simply does
		# not start, and says why.
		push_error("Cannot start scene — missing required handler(s): %s.\nRegister handlers before starting:\n  engine.on_dialog(handler)\n  engine.on_choice(handler)\n  engine.on_condition(handler)\n  engine.on_action(handler)\nNote: on_condition is optional when engine.on_resolve_condition() is installed." % ", ".join(missing))
		return

	_running = true
	if _callbacks.has("on_scene_started"):
		_callbacks["on_scene_started"].call(self)
	_fire_scene_enter()

	var start_block: Variant = _scene_graph.get_start_block()
	if start_block == null:
		_shutdown()
		return

	# The flow the player watches is a track like any other. The only thing that sets it apart is
	# what happens when it ends — see _track_ended.
	_main_track = LsdeTrack.new(self, start_block, LsdeTrack.MAIN_TRACK_ID, -1, LsdeTypes.PORT_IN)
	_tracks.append(_main_track)
	_main_track.start()

## Cancel the scene flow. All async tracks are cancelled, cleanup runs, on_scene_exit fires.
func cancel() -> void:
	if not _running:
		return
	_shutdown()

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
## The block the flow the player is watching is on. Parallel tracks have their own.
func get_current_block() -> Variant:
	return _main_track.get_current_block() if _main_track != null else null

## The id of every block visited so far in this scene, in order.
func get_visited_blocks() -> Array:
	return _visited

## Check if the scene flow is currently active.
func is_running() -> bool:
	return _running

## Get the number of async tracks currently running in parallel.
## How many PARALLEL tracks are running. The main flow is not one of them.
func get_active_tracks() -> int:
	return _parallel_tracks().size()

## Get detailed info for all currently running async tracks.
func get_track_infos() -> Array:
	var result: Array = []
	for track in _parallel_tracks():
		result.append(track.get_track_info())
	return result

## The full choice history. Keys are block ids, values are the option ids the player picked
## there, in order.
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

# ─── What a track asks the scene for ──────────────────────────────────────

func _get_scene_registry() -> LsdeHandlerRegistry.SceneRegistry:
	return _scene_registry

func _get_global_registry() -> LsdeHandlerRegistry:
	return _global_registry

func _get_scene_graph() -> LsdeGraph.SceneGraph:
	return _scene_graph

## Is the scene still playing? A track stops the moment its scene does.
func _is_scene_running() -> bool:
	return _running

## Mark a block reached. Nothing is released by this.
func _add_visited(block_id: String) -> void:
	if not _visited_set.has(block_id):
		_visited.append(block_id)
		_visited_set[block_id] = true


## Mark a block finished, and release anything that was waiting on it.
func _add_completed(block_id: String) -> void:
	_completed_set[block_id] = true
	if _pending_waits.size() > 0:
		# Collected before notifying: releasing a track re-enters the traversal, which can park or
		# release others, and mutating the dictionary mid-iteration would skip entries.
		var satisfied: Array = []
		for waiter in _pending_waits:
			var required: Array = _pending_waits[waiter]
			var all_completed: bool = true
			for u in required:
				if not _completed_set.has(u):
					all_completed = false
					break
			if all_completed:
				satisfied.append(waiter)
		for waiter in satisfied:
			_pending_waits.erase(waiter)
			waiter.notify_wait_satisfied()

## Open a parallel track, entered through entry_port. Returns its id.
func _spawn_track(start_block: Dictionary, parent_track_id: int, entry_port: String) -> int:
	var track_id: int = _next_track_id
	_next_track_id += 1
	# -1 when the main flow opened it — the convention get_track_infos publishes.
	var parent: int = -1 if parent_track_id == LsdeTrack.MAIN_TRACK_ID else parent_track_id
	var track: LsdeTrack = LsdeTrack.new(self, start_block, track_id, parent, entry_port)
	_tracks.append(track)
	track.start()
	return track_id

## Cancel a specific track by ID (used for parent->child cascade).
func _cancel_track(track_id: int) -> void:
	for track in _tracks:
		if track.id == track_id:
			track.cancel()
			return

## A track has nowhere left to go. Retire it, and close the scene once nothing is left that could
## still move.
##
## Every track is retired the same way, the main flow included. What ends the scene is the pool
## running out of tracks able to advance, not the main flow reaching its end.
##
## It used to be the main flow: _track_ended on track 0 called _shutdown(), which cancels every live
## track. That contradicted the promise LsdeTrack._end_flow makes — child tracks survive, only an
## explicit cancel() cascades — for the one track that opens most of them, and it made a whole port
## silently do nothing: a port whose targets are ALL isAsync leaves the main flow no continuation,
## so it ends the instant it has spawned them, and shutdown cancelled the branches born three lines
## earlier. They never got past on_before_block.
##
## A track parked on a waitForBlocks does NOT count as able to advance: it is waiting for another
## track to visit a block, so once every survivor is parked, nothing will ever visit anything again.
## Keeping the scene open on those would turn an unreachable wait into a scene that never closes.
##
## An explicit cancel() still tears the whole scene down at once — that is its job.
func _track_ended(track: Variant) -> void:
	_remove_track(track)
	for other in _tracks:
		if other.is_running() and not other.is_waiting_for_blocks():
			return
	_shutdown()

## Register a track as waiting for a set of block ids to be visited.
## Park a track - or the main flow - until every listed block has been visited.
func _register_wait_for_blocks(waiter: Variant, block_ids: Array) -> void:
	_pending_waits[waiter] = block_ids


## Check if a block id has been visited in this scene.
## Run on_validate_next_block for a block, and on_invalidate_block when it refuses.
##
## Called by BOTH the main flow and every parallel track. It used to live inline in the main flow
## only, so a game using this hook as a gate - "do not enter this block unless the player has the
## keycard" - was bypassed the moment a branch was marked isAsync. Nothing in the hook's contract
## said it only applied to the flow the player was watching, and nothing on screen would have told
## anyone.
##
## entry_port is the port the wire arrived on, and it is passed for one reason: under
## inPortPerCharacter the gate must be asked about the actor the DESIGNER wired, not about
## whichever one the whole cast would have produced. A gate reading "do not enter unless this
## character is here" would otherwise be answered about the wrong character.
##
## Returns false when the caller must stop rather than dispatch the block.
func _run_validation(block: Dictionary, entry_port: String, from_block: Variant, from_character: Variant) -> bool:
	if not _global_registry.validate_next_block_handler.is_valid():
		return true

	var from_ctx: Variant = {"character": from_character} if from_block != null else null
	var result: Dictionary = _global_registry.validate_next_block_handler.call({
		"nextBlock": block, "fromBlock": from_block,
		"nextContext": {"character": _resolve_cards_for(block, entry_port).get("character")},
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


func _is_visited(block_id: String) -> bool:
	return _visited_set.has(block_id)


func _is_completed(block_id: String) -> bool:
	return _completed_set.has(block_id)

func _remove_track(track: Variant) -> void:
	var idx: int = _tracks.find(track)
	if idx >= 0:
		_tracks.remove_at(idx)

func _parallel_tracks() -> Array:
	var result: Array = []
	for track in _tracks:
		if track.id != LsdeTrack.MAIN_TRACK_ID and track.is_running():
			result.append(track)
	return result

## Create the appropriate context for a block. entry_port is the port the wire arrived on — a CARD
## ID under inPortPerCharacter, "in" otherwise.
func _create_block_context(block: Dictionary, entry_port: String) -> Variant:
	return _create_context(block, entry_port)

## Record a choice selection in the history.
func _record_choice(block_id: String, option_id: String) -> void:
	if not _choice_history.has(block_id):
		_choice_history[block_id] = []
	_choice_history[block_id].append(option_id)

## Evaluate a condition with choice history support.
func _evaluate_condition_for_block(condition: Dictionary, fallback_evaluator: Callable) -> bool:
	return _evaluate_condition_with_history(condition, fallback_evaluator)

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
##
## With inPortPerCharacter, the wire that reached the block named the actor: entry_port holds a
## CARD ID instead of "in", and only that actor is offered to on_resolve_character. The game is
## still the one answering — it may say null — it simply cannot pick a different actor than the
## one the designer wired.
##
## Without the property, or when the block was entered through "in", entry_port is ignored and the
## whole cast is offered, exactly as before. That is what keeps every existing project — and every
## wire LSDE has ever written with toPort "in" — behaving identically.
func _resolve_cards_for(block: Dictionary, entry_port: String = LsdeTypes.PORT_IN) -> Dictionary:
	var lookup: Callable = func(_id: String) -> Variant: return null
	if _callbacks.has("get_card"):
		lookup = _callbacks["get_card"]
	var natives: Dictionary = LsdeUtils.get_native_properties(block)
	var designated: Variant = null
	if natives.get("inPortPerCharacter", false) == true and entry_port != LsdeTypes.PORT_IN:
		designated = entry_port
	return LsdeBlockContext.resolve_cards(block, lookup, _get_resolve_character_fn(), designated)


## Evaluate every case of a CONDITION or a ROUTER, before its context is built.
##
## The handler is then handed RESULTS rather than questions, and the exit port is read off these
## same results rather than re-asking the game: each test reaches on_resolve_condition exactly ONE
## time — whatever the block type, whatever the mode, whichever case matches. That is also what
## makes on_condition optional.
##
## Written ONCE for both block types on purpose. They ask the same question; only the reading of
## the answer differs, and that belongs to pick_port_from_results and pick_router_ports.
func _evaluate_cases(block: Dictionary) -> Array:
	var evaluate: Callable = _routing_evaluator()
	var cases: Array = []
	for raw_case in block.get("cases", []):
		cases.append({
			"port": raw_case.get("port", ""),
			"when": raw_case.get("when"),
			"result": LsdeConditionEvaluator.evaluate_condition_chain(raw_case.get("when"), evaluate),
		})
	return cases


static func _results_of(cases: Array) -> Array:
	var results: Array = []
	for c in cases:
		results.append(c["result"] == true)
	return results

# ─── Scene lifecycle ──────────────────────────────────────────────────────

func _fire_scene_enter() -> void:
	var handler: Callable = _scene_registry.enter_handler if _scene_registry.enter_handler.is_valid() else _global_registry.scene_enter_handler
	if handler.is_valid():
		handler.call({"scene": self, "context": {}})
	scene_entered.emit(self)

## Close the scene down: cancel every track, fire on_scene_exit, tell the engine.
##
## Reached from a dead end, from a note loop, from cancel() and from a scene with no entry block.
func _shutdown() -> void:
	_pending_waits.clear()

	# A copy: cancelling a track cascades to its children, and every track is cancelled. Leaving
	# live tracks behind on a closed scene is how a dialogue kept running after it ended.
	for track in _tracks.duplicate():
		track.cancel()
	_tracks.clear()

	_running = false
	_fire_scene_exit()
	if _callbacks.has("on_scene_ended"):
		_callbacks["on_scene_ended"].call(self)


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

# Cards are resolved fresh every time, never cached. This runs for every track, and a cache would
# leak one track's actor into another released later by waitForBlocks.
func _create_context(block: Dictionary, entry_port: String) -> Variant:
	var cards: Dictionary = _resolve_cards_for(block, entry_port)

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
			# Every case is evaluated up front, so the handler is handed results rather than
			# questions. With a resolver installed the engine already knows where to go, which is
			# what makes on_condition optional: the handler becomes a log or override hook.
			var cases: Array = _evaluate_cases(block)
			var port_per_case: bool = LsdeUtils.get_native_properties(block).get("portPerCase", false) == true
			var ctx := LsdeBlockContext.ConditionContext.new(block, cards, cases)
			ctx.condition_port = LsdeConditionEvaluator.pick_port_from_results(
				block.get("cases", []), port_per_case, _results_of(cases))
			return ctx

		LsdeTypes.BLOCK_ROUTER:
			# The same cases, read the opposite way: EVERY case counts, each true one launches its
			# port, and the tally picks then or catch. That difference lives entirely in
			# pick_router_ports — there is no second evaluator and no router-specific hook.
			var cases: Array = _evaluate_cases(block)
			var ctx := LsdeBlockContext.RouterContext.new(block, cards, cases)
			ctx.router_ports = LsdeConditionEvaluator.pick_router_ports(
				block.get("cases", []), _results_of(cases))
			return ctx

		LsdeTypes.BLOCK_ACTION:
			return LsdeBlockContext.ActionContext.new(block, cards)

	return null

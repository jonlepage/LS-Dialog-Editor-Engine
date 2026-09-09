class_name LsdeTrack
extends RefCounted

## LSDE Dialog Engine — one track walking the graph (GDScript port of track.ts)
##
## This is THE traversal. There is one of it, and every track uses it: the one the player is
## watching and every parallel branch isAsync opens. A track is a cursor — it knows which block it
## is on, what it still has to clean up, and whether it is parked. It does not know it is the main
## one; only the scene knows that, and only when the track ends.
##
## It used to be written twice. LsdeSceneHandle walked the graph itself for the main flow, and an
## inner AsyncTrack class walked it again for the parallel ones — the same five methods, side by
## side in one file. Then the two drifted, because a change to one is silent in the other:
##
##   waitForBlocks was added to the parallel copy      -> inert on the main flow, for months
##   on_validate_next_block was added to the main copy -> never fired on a parallel branch
##
## Both shipped in v1 and neither showed up at runtime. That is the whole argument for this file.
##
## The host (LsdeSceneHandle) keeps everything SHARED: the visited set, the choice history, the
## handler registries, the pending waits. A track owns only its own position.
##
## GDScript has no exceptions, so nothing here carries a fault the way the other three runtimes do.
## A script error is pushed to the Godot log and the call returns null.

## The id of the track the player is watching. Every other track is numbered from 1.
##
## A number and not a flag because the main track is not special: it is the first one, and the
## scene ends when it ends. That is the ONLY thing that sets it apart.
const MAIN_TRACK_ID: int = 0

## Unique within the scene.
var id: int
## The track that opened this one, or -1 when the main flow opened it.
var parent_track_id: int
## The block this track started on.
var start_block_id: String

var _host: Object          # LsdeSceneHandle — untyped to avoid a cyclic class reference
var _start_block: Dictionary
## Tracks this one opened. Only an explicit cancel() cascades to them.
var _child_track_ids: Array = []

var _running: bool = true
var _current_block: Variant = null
## Where this track came from, for on_validate_next_block. Its own, not another track's.
var _previous_block: Variant = null
var _previous_character: Variant = null
var _previous_cleanup: Callable
## What to resume when a waitForBlocks is satisfied.
var _pending_advance: Callable

## The wires this track still owes, in the order it will walk them.
##
## A port may carry several wires. The ones whose target is isAsync open their own track; the
## others are THIS track's to walk, one after the other — so they queue here, and the track picks
## the next one up when the branch it is on runs out of graph.
##
## New wires go in at the FRONT. A designer reading their own graph expects a branch to finish
## before its sibling starts: A to [B, C], and B to [D, E], plays B, D, E, then C — not B, D, C, E.
## Front insertion is what makes the walk depth-first, which is how the graph reads on screen.
var _queue: Array = []


func _init(host: Object, start_block: Dictionary, track_id: int, parent_id: int) -> void:
	_host = host
	_start_block = start_block
	id = track_id
	parent_track_id = parent_id
	start_block_id = start_block.get("id", "")


## Begin walking. Must be called after the track is in the scene's pool.
func start() -> void:
	_process_block(_start_block)


## Stop this track and every track it opened.
func cancel() -> void:
	if not _running:
		return
	_running = false

	var cleanup: Callable = _previous_cleanup
	_previous_cleanup = Callable()
	if cleanup.is_valid():
		cleanup.call()

	_current_block = null
	_pending_advance = Callable()
	_queue.clear()
	for child_id in _child_track_ids:
		_host._cancel_track(child_id)
	_child_track_ids.clear()


func is_running() -> bool:
	return _running


## Parked on a waitForBlocks — alive, but unable to move on its own.
##
## It is waiting for ANOTHER track to visit a block, so it cannot be what keeps a scene open: once
## every remaining track is parked like this, nothing will ever visit anything again. That is the
## deadlock LsdeSceneHandle._track_ended closes the scene on.
func is_waiting_for_blocks() -> bool:
	return _pending_advance.is_valid()


func get_current_block() -> Variant:
	return _current_block


## Called once every block this track was waiting on has been visited.
func notify_wait_satisfied() -> void:
	if not _running or not _host._is_scene_running() or not _pending_advance.is_valid():
		return
	var advance: Callable = _pending_advance
	_pending_advance = Callable()
	advance.call()


## A read-only snapshot, for a debug view.
func get_track_info() -> Dictionary:
	return {
		"id": id,
		"parentTrackId": parent_track_id,
		"startBlockId": start_block_id,
		"currentBlockId": _current_block.get("id", "") if _current_block != null else "",
		"running": _running
	}


# ─── The traversal ────────────────────────────────────────────────────────

## Take a block, and either park on it or dispatch it.
##
## The order matters and each step earns its place:
##
## 1. Step over NOTEs. They are designer-only and never dispatched.
## 2. Honour waitForBlocks. BEFORE anything else — see the note below.
## 3. Ask on_validate_next_block. The game's gate; a refusal stops this track.
## 4. Mark it current and visited, which may release another parked track.
## 5. Fire on_before_block, whose resolve() releases the type handler.
func _process_block(starting_block: Dictionary) -> void:
	if not _running or not _host._is_scene_running():
		return

	var scene_graph: LsdeGraph.SceneGraph = _host._get_scene_graph()

	var skipped: Variant = LsdeTrack.skip_notes(starting_block, scene_graph)
	if skipped == null:
		# The end of THIS branch, not of the track: whatever is queued is still owed.
		_end_branch()
		return
	var block: Dictionary = skipped

	# waitForBlocks holds the block BEFORE it is dispatched — the handler is never called, so the
	# game does not even learn the block exists until the wait lifts. That is the engine's
	# decision, not a rendering choice a game could make differently: the property is native, the
	# designer ticks it in LSDE, and the engine owes them the behaviour.
	#
	# It used to mean two different things depending on where the block sat: a track's FIRST block
	# was held before dispatch, any later one was dispatched and held before advancing. Same
	# checkbox, two meanings, and the second one showed the line early.
	# It waits on blocks that have FINISHED, not on blocks that have been reached. Reaching was
	# the old rule and it made the property nearly inert: a join is normally drawn onto blocks
	# dispatched a fraction of a millisecond earlier, so the wait lifted in the very tick it was
	# registered and the joining line spoke over the one it had been told to wait for.
	# MIGRATION-V2.md records the decision.
	var wait_blocks: Array = LsdeUtils.get_native_properties(block).get("waitForBlocks", [])
	if wait_blocks.size() > 0 and not _all_completed(wait_blocks):
		_pending_advance = func() -> void: _process_block(block)
		_host._register_wait_for_blocks(self, wait_blocks)
		return

	if not _host._run_validation(block, _previous_block, _previous_character):
		# A refusal is a dead end like any other, so it ENDS this track.
		#
		# There is no API to resume a refused track — no goto, no retry, and start() refuses a
		# running scene. Returning silently left the track alive and idle for good: on the main
		# flow that was the whole scene hung open, with no on_scene_exit, the handle still in the
		# engine's registry and is_running() answering true forever; on a parallel branch it was a
		# phantom track get_active_tracks() kept counting.
		#
		# Every other dead end here already does it: a NOTE loop, a port with no wire, a missing
		# target.
		_end_flow()
		return

	_current_block = block
	_host._add_visited(block.get("id", ""))

	var registry: LsdeHandlerRegistry = _host._get_global_registry()
	if registry.before_block_handler.is_valid():
		# GUARDED like next(): a delay timer that fires twice would otherwise dispatch the same
		# block twice. The flag lives in an Array because a lambda captures by value, and an Array
		# is the one capture GDScript lets us mutate from inside.
		var resolved_once: Array = [false]
		var resolve_fn: Callable = func() -> void:
			if resolved_once[0]:
				return
			resolved_once[0] = true
			_execute_block_handler(block)
		registry.before_block_handler.call({
			"block": block, "scene": _host,
			"context": {"nativeProperties": LsdeUtils.get_native_properties(block)},
			"resolve": resolve_fn
		})
	else:
		_execute_block_handler(block)


## Run the handlers for a block, then leave when the game says so.
##
## next() is guarded and deferred: called during the handler it only raises a flag, and the advance
## happens once both handlers have returned. Otherwise a scene handler calling next() would move
## the flow on before the global handler ever ran.
func _execute_block_handler(block: Dictionary) -> void:
	# `_running` and not just the scene's: a resolve() kept in a closure and fired after this track
	# ended would otherwise restart it on a dead flow.
	if not _running or not _host._is_scene_running():
		return

	var resolved: Dictionary = LsdeHandlerRegistry.resolve_handler(
		block.get("type", ""), block.get("id", ""),
		_host._get_scene_registry(), _host._get_global_registry())

	var context: Variant = _host._create_block_context(block)
	if context == null:
		_advance_to_next_block(block, null)
		return

	var scene_handler: Callable = resolved["scene_handler"]
	var global_handler: Callable = resolved["global_handler"]

	# No handler → advance silently. start() already refused a scene missing one.
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
		if state[1]:  # sync_phase
			return
		_advance_to_next_block(block, context)

	var args: Dictionary = {"scene": _host, "block": block, "context": context, "next": next_fn}

	# NOT an error boundary, unlike the other three runtimes: GDScript has no exceptions, so there
	# is nothing here to catch and nothing that can escape. A script error is pushed to the Godot
	# log and the call returns null.
	if scene_handler.is_valid():
		scene_cleanup = scene_handler.call(args)
		if not context.global_prevented and global_handler.is_valid():
			global_cleanup = global_handler.call(args)
	elif global_handler.is_valid():
		global_cleanup = global_handler.call(args)

	var cleanup: Callable = LsdeTrack.combine_cleanups(scene_cleanup, global_cleanup)

	# The handler may have closed the flow from inside itself — scene.cancel(), engine.stop(),
	# anything that ends this track. Storing the cleanup then hung it on a block nobody will ever
	# leave again, and whatever it held — a panel, an audio voice — was never released. The engine
	# HAS left the block, so the cleanup runs now.
	if not _running or not _host._is_scene_running():
		if cleanup.is_valid():
			cleanup.call()
		return

	# Stored BEFORE any advance runs, so leaving the block finds it.
	_previous_cleanup = cleanup

	state[1] = false  # sync_phase = false
	if state[0]:  # next_called
		_advance_to_next_block(block, context)


## Leave a block: open a track per parallel target, walk the rest one after the other.
##
## A port may carry several wires, and each one's TARGET says how it is walked: isAsync opens its
## own track and runs beside this one; anything else belongs to THIS track — the first becomes the
## continuation, the others queue up and are walked when the continuation runs out of graph.
##
## That second line is what isAsync used to be unable to say. Every wire but the first was detached
## whether the designer had ticked the box or not, so on a secondary wire the property was INERT.
## MIGRATION-V2.md records the whole decision.
func _advance_to_next_block(block: Dictionary, context: Variant) -> void:
	if not _running or not _host._is_scene_running():
		return

	_previous_block = block
	_previous_character = context.character if context != null else null

	var scene_graph: LsdeGraph.SceneGraph = _host._get_scene_graph()
	var links: Array = scene_graph.get_outgoing_links(block.get("id", ""))

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

	var continuation: Variant = null
	var detached: Array = []
	var queued: Array = []

	# Sorted first, acted on after. Opening a track runs its handler immediately, and a handler may
	# cancel the scene — so nothing here may depend on state a spawn could change.
	for link in resolved_links:
		var target_block: Variant = scene_graph.get_block(link.get("to", ""))
		# A wire to a block that is not in this scene: init() reports it as BROKEN_LINK, and the
		# traversal simply has nowhere to go.
		if target_block == null:
			continue
		if LsdeTrack.is_async_block(target_block):
			detached.append(link)
		elif continuation == null:
			continuation = link
		else:
			queued.append(link)

	# In front of what was already owed: this block's own siblings come before an ancestor's.
	for i in range(queued.size() - 1, -1, -1):
		_queue.insert(0, queued[i])

	for link in detached:
		var target_block: Variant = scene_graph.get_block(link.get("to", ""))
		if target_block != null:
			_child_track_ids.append(_host._spawn_track(target_block, id))

	# The block is now DONE, and this is the one place that says so.
	#
	# Its handler returned, its exit port is resolved and its cleanup has just run, so a bubble is
	# off the screen and an audio voice is stopped BEFORE anything waiting on this block is allowed
	# to speak. Marking it any earlier would let the joining line play over the one it was told to
	# wait for.
	#
	# The cleanup runs here rather than inside _end_branch for the same reason; _end_branch calls
	# it again and finds nothing, which is what makes that safe.
	_run_block_cleanup()
	_host._add_completed(block.get("id", ""))

	# Releasing a parked track re-enters the traversal immediately, and a handler there is allowed
	# to cancel the scene, so the guard is re-read rather than assumed.
	if not _running or not _host._is_scene_running():
		return

	if continuation != null:
		var next_block: Variant = scene_graph.get_block(continuation.get("to", ""))
		if next_block != null:
			_process_block(next_block)
			return

	_end_branch()


## This branch has nowhere left to go — hand over to the queue, or stop.
##
## The block's cleanup runs FIRST, before the next wire is picked up: leaving a block is leaving a
## block, whether the track carries on or not. Hanging on to it until the queue emptied would keep
## a panel open, or an audio voice alive, through everything that came after it.
func _end_branch() -> void:
	_run_block_cleanup()
	var scene_graph: LsdeGraph.SceneGraph = _host._get_scene_graph()

	while not _queue.is_empty():
		var link: Dictionary = _queue.pop_front()
		var target: Variant = scene_graph.get_block(link.get("to", ""))
		if target == null:
			continue
		_process_block(target)
		return

	_retire()


## Run the cleanup of the block this track is leaving, once.
func _run_block_cleanup() -> void:
	var cleanup: Callable = _previous_cleanup
	_previous_cleanup = Callable()
	if cleanup.is_valid():
		cleanup.call()


## Stop this track for good, DROPPING whatever it still owed.
##
## For the ends that are not a branch running out of graph: on_validate_next_block refusing a
## block, a handler failing. Both say the flow is over — the guide has always read
## on_invalidate_block as "the scene stops" — so the queue goes with it. Playing the next wire
## after the game refused this one would be answering a no with "then try that".
func _end_flow() -> void:
	_run_block_cleanup()
	_retire()


## The track is done. Its cleanup has already run; the scene decides what its ending means.
##
## Child tracks SURVIVE: they live independently in the pool, and only an explicit cancel()
## cascades to them.
func _retire() -> void:
	_running = false
	_current_block = null
	_pending_advance = Callable()
	_queue.clear()

	_host._track_ended(self)


func _all_completed(block_ids: Array) -> bool:
	for wait_id in block_ids:
		if not _host._is_completed(wait_id):
			return false
	return true


# ─── Shared reading helpers ───────────────────────────────────────────────

## Walk past NOTE blocks to the first block the engine actually dispatches.
##
## NOTE blocks are designer-only: they carry no handler and are never executed, so a track steps
## over them and follows their first outgoing link.
##
## Returns null when the walk runs out of connections — and also when it comes back to a NOTE it
## already stepped over. A designer can wire a NOTE into a loop, and following it recursively
## overflowed the stack instead of ending the flow.
static func skip_notes(block: Dictionary, scene_graph: LsdeGraph.SceneGraph) -> Variant:
	var current: Variant = block
	var seen: Dictionary = {}

	while current != null and current.get("type", "") == LsdeTypes.BLOCK_NOTE:
		var current_id: String = current.get("id", "")
		if seen.has(current_id):
			return null
		seen[current_id] = true

		var links: Array = scene_graph.get_outgoing_links(current_id)
		current = scene_graph.get_block(links[0].get("to", "")) if links.size() > 0 else null

	return current


## Does this block open a parallel track?
static func is_async_block(block: Dictionary) -> bool:
	return LsdeUtils.get_native_properties(block).get("isAsync", false) == true


## Combine a scene cleanup and a global one into the single cleanup a track keeps.
##
## BOTH always run. They release unrelated things — a scene handler's panel and a global handler's
## audio voice — so letting the first one skip the second leaked whatever the second owned.
static func combine_cleanups(a: Variant, b: Variant) -> Callable:
	var ca: Callable = a if a is Callable and (a as Callable).is_valid() else Callable()
	var cb: Callable = b if b is Callable and (b as Callable).is_valid() else Callable()

	if ca.is_valid() and cb.is_valid():
		return func() -> void:
			ca.call()
			cb.call()
	if ca.is_valid():
		return ca
	if cb.is_valid():
		return cb
	return Callable()

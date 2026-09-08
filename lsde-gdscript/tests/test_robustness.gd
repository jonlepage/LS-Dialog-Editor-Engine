## LSDE Dialog Engine — Robustness tests (port of robustness.test.ts)
##
## Every case here is something a game integration does by accident: a timer that fires twice, a
## resolve() kept in a closure past the end of the scene, a NOTE block a designer wired back on
## itself. The engine cannot prevent any of these; it can only refuse to make them worse.
##
## GDScript has no try/catch, so an exception from a handler already reaches the game — which is
## what the other three runtimes were changed to do. This runtime was right all along and nobody
## had noticed.
extends RefCounted

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

# ─── Helpers ──────────────────────────────────────────────────────────────

func _assert_eq(actual: Variant, expected: Variant, label: String) -> void:
	_total += 1
	if typeof(actual) == typeof(expected) and actual == expected:
		_passed += 1
	else:
		_failed += 1
		print("  FAIL: %s — expected %s got %s" % [label, str(expected), str(actual)])

func _assert_false(value: bool, label: String) -> void:
	_assert_eq(value, false, label)

## A block, with its wires. The port is a NAME: out, then, C1, K1, or a card id.
static func _block(id: String, type: String, next: Array = []) -> Dictionary:
	return {
		"id": id,
		"key": "__blueprints__.s1." + id,
		"type": type,
		"next": next,
	}

static func _dialog(id: String, next: Array = []) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_DIALOG, next)

static func _note(id: String, next: Array = []) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_NOTE, next)

static func _link(to: String, port: String = "out") -> Dictionary:
	return {"port": port, "to": to, "toPort": "in"}

## One scene, starting on its first block. The header is filled so it loads on its own.
static func _one_scene(blocks: Array) -> Dictionary:
	return {
		"format": LsdeTypes.SUPPORTED_FORMAT,
		"version": LsdeTypes.SUPPORTED_VERSION,
		"generator": {"app": "LSDE", "version": "2.0.3"},
		"exportedAt": "2026-09-07T00:00:00.000Z",
		"project": "Test",
		"locales": ["en"],
		"referenceLocale": "en",
		"dictionaries": [], "functions": [], "cards": [],
		"scenes": [{
			"scene": "s1",
			"id": "sc_test0001",
			"start": blocks[0]["id"] if blocks.size() > 0 else null,
			"blocks": blocks,
		}],
	}

static func _register_all_handlers(engine: LsdeDialogueEngine) -> void:
	engine.on_dialog(func(args: Dictionary) -> Variant:
		args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant:
		var options: Array = args["context"].options
		if options.size() > 0:
			args["context"].select_choice(options[0]["id"])
		args["next"].call(); return null)
	engine.on_condition(func(args: Dictionary) -> Variant:
		args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant:
		args["context"].resolve(); args["next"].call(); return null)

func _ready_engine(data: Dictionary) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	_register_all_handlers(engine)
	return engine

# ─── on_before_block resolve() called twice ───────────────────────────────

func _test_second_resolve_does_not_dispatch_twice() -> void:
	var dispatched: Array = []
	var engine := _ready_engine(_one_scene([
		_dialog("b1", [_link("b2")]),
		_dialog("b2"),
	]))

	engine.on_before_block(func(args: Dictionary) -> void:
		args["resolve"].call()
		args["resolve"].call())  # a timer that fired twice — must be ignored
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["id"]); args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(dispatched, ["b1", "b2"], "second resolve() does not dispatch twice")

# ─── A stale resolve() must not revive a finished scene ───────────────────

func _test_resolve_after_scene_ended_does_not_revive() -> void:
	var dispatched: Array = []
	var stale: Array = []
	var exits: Array = [0]

	var engine := _ready_engine(_one_scene([_dialog("b1")]))
	engine.on_scene_exit(func(_args: Dictionary) -> void: exits[0] += 1)
	engine.on_before_block(func(args: Dictionary) -> void:
		stale.append(args["resolve"])
		args["resolve"].call())
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["id"]); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_false(handle.is_running(), "scene ended")
	_assert_eq(dispatched.size(), 1, "one block dispatched")

	for resolve_fn in stale:
		resolve_fn.call()

	_assert_eq(dispatched.size(), 1, "stale resolve() dispatched nothing more")
	_assert_eq(exits[0], 1, "on_scene_exit fired exactly once")

	# A captured Callable holds the SceneHandle alive — drop it, or Godot reports leaked instances
	# at exit and every later run looks like it has a problem it does not have.
	stale.clear()

func _test_resolve_after_cancel_does_not_dispatch() -> void:
	var dispatched: Array = []
	var stale: Array = []

	var engine := _ready_engine(_one_scene([
		_dialog("b1", [_link("b2")]),
		_dialog("b2"),
	]))

	engine.on_before_block(func(args: Dictionary) -> void: stale.append(args["resolve"]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["id"]); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()
	handle.cancel()

	for resolve_fn in stale:
		resolve_fn.call()

	_assert_eq(dispatched.size(), 0, "resolve() after cancel() dispatched nothing")
	stale.clear()

# ─── A NOTE wired back on itself ──────────────────────────────────────────

func _test_note_wired_to_itself_ends_scene() -> void:
	var engine := _ready_engine(_one_scene([_note("n1", [_link("n1")])]))
	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_false(handle.is_running(), "self-wired NOTE ends the scene")

func _test_two_notes_in_a_loop_end_scene() -> void:
	var engine := _ready_engine(_one_scene([
		_note("n1", [_link("n2")]),
		_note("n2", [_link("n1")]),
	]))
	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_false(handle.is_running(), "NOTE loop ends the scene")

func _test_note_chain_reaches_the_real_block() -> void:
	var dispatched: Array = []
	var engine := _ready_engine(_one_scene([
		_note("n1", [_link("n2")]),
		_note("n2", [_link("b1")]),
		_dialog("b1"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["id"]); args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(dispatched, ["b1"], "NOTE chain reaches the block behind it")

# ─── next() kept for later ────────────────────────────────────────────────
#
# The normal way a game drives this engine: the handler shows the line, returns, and next() is
# called a frame later when the player presses a key. Nothing covered it in any of the four
# runtimes — and the C++ port was broken, because its next() read its guards off a stack frame
# that was already gone.

func _test_next_kept_for_later_still_advances() -> void:
	var seen: Array = []
	var kept: Array = []
	var engine := _ready_engine(_one_scene([
		_dialog("b1", [_link("b2")]),
		_dialog("b2", [_link("b3")]),
		_dialog("b3"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		seen.append(args["block"]["id"])
		if args["block"]["id"] == "b1":
			kept.append(args["next"])  # the game waits for the player
			return null
		args["next"].call()
		return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_eq(seen, ["b1"], "a kept next() leaves the flow on its block")
	_assert_eq(handle.is_running(), true, "the scene is still running, waiting")

	kept[0].call()

	_assert_eq(seen, ["b1", "b2", "b3"], "a kept next() still advances the flow")
	_assert_eq(handle.is_running(), false, "the scene ends once the flow runs out")

func _test_a_kept_next_called_twice_is_ignored() -> void:
	var seen: Array = []
	var kept: Array = []
	var engine := _ready_engine(_one_scene([
		_dialog("b1", [_link("b2")]),
		_dialog("b2", [_link("b3")]),
		_dialog("b3"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		seen.append(args["block"]["id"])
		if args["block"]["id"] == "b1":
			kept.append(args["next"])
			return null
		args["next"].call()
		return null)

	engine.scene("s1").start()
	kept[0].call()
	kept[0].call()  # a double-fired input event

	_assert_eq(seen, ["b1", "b2", "b3"], "the second call is ignored")

# ─── A teardown must finish, whatever throws ──────────────────────────────
#
# GDScript has no exceptions, so this runtime never had the short-circuit that stopped TypeScript
# and C# from cancelling the tracks after the first failing cleanup. The test is here so the port
# cannot drift into it, and so the four runtimes assert the same contract.

func _test_cancelling_a_scene_runs_every_track_cleanup() -> void:
	var cleaned: Array = []
	var side1 := _dialog("SIDE-1")
	side1["props"] = {"isAsync": true}
	var side2 := _dialog("SIDE-2")
	side2["props"] = {"isAsync": true}
	var engine := _ready_engine(_one_scene([
		_dialog("FORK", [_link("MAIN"), _link("SIDE-1"), _link("SIDE-2")]),
		_dialog("MAIN"),
		side1,
		side2,
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		var block_id: String = args["block"]["id"]
		if block_id == "FORK":
			args["next"].call()
			return null
		return func() -> void: cleaned.append(block_id))

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()
	_assert_eq(handle.get_active_tracks(), 2, "the fork opened two parallel tracks")

	handle.cancel()

	cleaned.sort()
	_assert_eq(cleaned, ["MAIN", "SIDE-1", "SIDE-2"], "every track cleanup ran")

# ─── The same scene opened twice ──────────────────────────────────────────
#
# The registry used to be keyed by the scene REFERENCE, so a second start evicted the first handle
# and it then played on with nothing able to see or stop it.

func _test_the_same_scene_opened_twice_is_tracked_twice() -> void:
	var engine := _ready_engine(_one_scene([_dialog("DIALOG-001")]))
	engine.on_dialog(func(_args: Dictionary) -> Variant: return null)

	var first: LsdeSceneHandle = engine.scene("s1")
	var second: LsdeSceneHandle = engine.scene("s1")
	first.start()
	second.start()

	_assert_eq(engine.get_active_scenes().size(), 2, "both runs are tracked")

	engine.stop()

	_assert_eq(first.is_running(), false, "stop() reaches the first run")
	_assert_eq(second.is_running(), false, "stop() reaches the second run")
	_assert_eq(engine.is_running(), false, "the engine is idle")

# ─── A refused block is a dead end, and dead ends end the flow ────────────
#
# on_validate_next_block returning valid:false made the track return silently, still marked
# running. Nothing can restart it — no goto, no retry, and start() refuses a running scene — so the
# main flow hung the whole scene open and a refused branch stayed counted as active.

func _test_a_refused_block_on_the_main_flow_closes_the_scene() -> void:
	var seen: Array = []
	var exits: Array = [0]
	var refused: Array = [""]
	var engine := _ready_engine(_one_scene([
		_dialog("DIALOG-001", [_link("DIALOG-002")]),
		_dialog("DIALOG-002"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		seen.append(args["block"]["id"])
		args["next"].call()
		return null)
	engine.on_scene_exit(func(_args: Dictionary) -> void: exits[0] += 1)
	engine.on_invalidate_block(func(args: Dictionary) -> void: refused[0] = args["reason"])
	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		if args["nextBlock"]["id"] == "DIALOG-002":
			return {"valid": false, "reason": "no_keycard"}
		return {"valid": true})

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_eq(seen, ["DIALOG-001"], "the refused block is never dispatched")
	_assert_eq(refused[0], "no_keycard", "on_invalidate_block got the reason")
	_assert_eq(handle.is_running(), false, "the scene closed instead of hanging open")
	_assert_eq(exits[0], 1, "on_scene_exit fired")
	_assert_eq(engine.is_running(), false, "the engine deregistered it")

func _test_a_refused_parallel_branch_stops_being_counted() -> void:
	var side := _dialog("SIDE")
	side["props"] = {"isAsync": true}
	var engine := _ready_engine(_one_scene([
		_dialog("FORK", [_link("MAIN"), _link("SIDE")]),
		_dialog("MAIN"),
		side,
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		if args["block"]["id"] == "MAIN":
			return null  # the main flow parks
		args["next"].call()
		return null)
	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		if args["nextBlock"]["id"] == "SIDE":
			return {"valid": false, "reason": "nope"}
		return {"valid": true})

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_eq(handle.is_running(), true, "the main flow is still parked")
	_assert_eq(handle.get_active_tracks(), 0, "the refused branch is gone")
	_assert_eq(handle.get_track_infos(), [], "and shows in no debug view")

# ─── A cleanup returned after the flow was closed still runs ──────────────
#
# scene.cancel() and engine.stop() are callable from inside a handler. The handler then returns its
# cleanup as usual, and the engine stored it for a departure that had already happened: the block
# was never left again, so whatever it held was never released.

func _test_a_handler_that_cancels_its_own_scene_still_gets_its_cleanup_run() -> void:
	var cleaned: Array = []
	var engine := _ready_engine(_one_scene([
		_dialog("DIALOG-001", [_link("DIALOG-002")]),
		_dialog("DIALOG-002"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		var block_id: String = args["block"]["id"]
		if block_id == "DIALOG-001":
			args["scene"].cancel()
		return func() -> void: cleaned.append(block_id))

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_eq(handle.is_running(), false, "the scene closed")
	_assert_eq(cleaned, ["DIALOG-001"], "the cleanup still ran")

func _test_the_same_through_engine_stop() -> void:
	var cleaned: Array = []
	var engine := _ready_engine(_one_scene([
		_dialog("DIALOG-001", [_link("DIALOG-002")]),
		_dialog("DIALOG-002"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		var block_id: String = args["block"]["id"]
		if block_id == "DIALOG-001":
			engine.stop()
		return func() -> void: cleaned.append(block_id))

	engine.scene("s1").start()

	_assert_eq(cleaned, ["DIALOG-001"], "the cleanup still ran")
	_assert_eq(engine.is_running(), false, "the engine is idle")

# ─── A file exported in the wrong naming convention says which one ────────
#
# LSDE can write camelCase, snake_case or PascalCase, and the choice renames the JSON fields. This
# runtime and TypeScript are handed the raw payload, so both can name the setting to change instead
# of leaving the reader with "not an LSDE blueprint" on a file that plainly is one. C# and C++
# validate a typed object and report INVALID_FORMAT for the same file.

func _test_a_snake_case_export_names_the_setting() -> void:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": {
		"exported_at": "2026-09-07T00:00:00.000Z",
		"reference_locale": "en",
		"scenes": [],
	}})
	_assert_eq(report["errors"].size(), 1, "one error")
	_assert_eq(report["errors"][0]["code"], "WRONG_NAMING_CONVENTION", "names the convention")

func _test_a_pascal_case_export_names_the_setting() -> void:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": {
		"ExportedAt": "2026-09-07T00:00:00.000Z",
		"Scenes": [],
	}})
	_assert_eq(report["errors"][0]["code"], "WRONG_NAMING_CONVENTION", "names the convention")

func _test_a_file_that_is_simply_not_a_blueprint_says_so() -> void:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": {"format": "something-else", "scenes": []}})
	_assert_eq(report["errors"][0]["code"], "INVALID_FORMAT", "not a convention problem")

# ─── The guards have to survive a release export ──────────────────────────
#
# assert() is STRIPPED from a Godot release build. Every guard in this runtime used to be one, so a
# shipped game got none of them: an unknown scene name built a handle over a null graph, an unknown
# locale was taken in silence, and a scene started with no handlers walked its whole graph
# dispatching nothing — an invisible dialogue that reported no error at all.
#
# They are push_error + a safe return now, which is also what makes them testable: an assert would
# halt this runner.

func _test_starting_without_handlers_refuses_instead_of_playing_blind() -> void:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": _one_scene([_dialog("b1")])})
	_assert_eq(report["errors"].size(), 0, "the payload is fine")
	# No on_dialog / on_choice / on_condition / on_action registered.

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_eq(handle.is_running(), false, "the scene refused to start")
	_assert_eq(engine.is_running(), false, "and nothing was registered as active")

func _test_an_unknown_scene_returns_null_rather_than_a_broken_handle() -> void:
	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _one_scene([_dialog("b1")])})

	_assert_eq(engine.scene("no_such_scene"), null, "an unknown scene name gives null")

func _test_scene_before_init_returns_null() -> void:
	var engine := LsdeDialogueEngine.new()

	_assert_eq(engine.scene("s1"), null, "no scene before init()")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Robustness Tests ──")
	_test_second_resolve_does_not_dispatch_twice()
	_test_resolve_after_scene_ended_does_not_revive()
	_test_resolve_after_cancel_does_not_dispatch()
	_test_note_wired_to_itself_ends_scene()
	_test_two_notes_in_a_loop_end_scene()
	_test_note_chain_reaches_the_real_block()
	_test_next_kept_for_later_still_advances()
	_test_a_kept_next_called_twice_is_ignored()
	_test_cancelling_a_scene_runs_every_track_cleanup()
	_test_the_same_scene_opened_twice_is_tracked_twice()
	_test_a_refused_block_on_the_main_flow_closes_the_scene()
	_test_a_refused_parallel_branch_stops_being_counted()
	_test_a_handler_that_cancels_its_own_scene_still_gets_its_cleanup_run()
	_test_the_same_through_engine_stop()
	_test_a_snake_case_export_names_the_setting()
	_test_a_pascal_case_export_names_the_setting()
	_test_a_file_that_is_simply_not_a_blueprint_says_so()
	_test_starting_without_handlers_refuses_instead_of_playing_blind()
	_test_an_unknown_scene_returns_null_rather_than_a_broken_handle()
	_test_scene_before_init_returns_null()
	return {"passed": _passed, "failed": _failed, "total": _total}

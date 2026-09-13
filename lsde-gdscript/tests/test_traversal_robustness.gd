## LSDE Dialog Engine — a scene is never left open with nothing able to move it
## (port of traversal-robustness.test.ts)
##
## Found during a Unity integration, and reproduced before a line was changed. Three of the five
## hold here:
##
##   - every synchronous next() added frames to the stack, and Godot caps the GDScript call stack:
##     a condition/action loop the game walks without waiting stopped dead a few hundred blocks in
##   - a deadlock was only noticed when a track ENDED, never when the last one PARKED
##   - nothing told on_scene_exit why the scene ended
##
## The other two are about exceptions — a fault on another track, a fault in a callback other than
## the type handler — and GDScript has none. Those tests live in the three other runtimes.
extends RefCounted

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

const PASSES := 10000

# ─── Helpers ──────────────────────────────────────────────────────────────

func _assert_eq(actual: Variant, expected: Variant, label: String) -> void:
	_total += 1
	if typeof(actual) == typeof(expected) and actual == expected:
		_passed += 1
	else:
		_failed += 1
		print("  FAIL: %s — expected %s got %s" % [label, str(expected), str(actual)])

static func _block(id: String, type: String, next: Array = [], extra: Dictionary = {}) -> Dictionary:
	var block: Dictionary = {
		"id": id,
		"key": "__blueprints__.s1." + id,
		"type": type,
		"next": next,
	}
	block.merge(extra)
	return block

static func _dialog(id: String, next: Array = [], props: Dictionary = {}) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_DIALOG, next, {"props": props} if not props.is_empty() else {})

static func _link(to: String, port: String = "out") -> Dictionary:
	return {"port": port, "to": to, "toPort": "in"}

static func _counter_case(port: String) -> Dictionary:
	return {"port": port, "when": [{"dict": "game", "entry": "counter", "op": "equals", "value": PASSES}]}

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

## A scene whose handlers advance at once, except the blocks listed in `hold`: those keep their
## next() for the test to call — the player clicking.
##
## Everything the test reads back lives in the returned Dictionary. A lambda captures by value, and a
## Dictionary is shared rather than copied, so the handlers can write into it.
func _setup(blocks: Array, hold: Array = [], configure: Callable = Callable()) -> Dictionary:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": _one_scene(blocks)})
	_assert_eq(report["errors"].size(), 0, "payload loads")

	var played: Dictionary = {"engine": engine, "exits": [], "cleaned": [], "held": {}}
	var dispatch: Callable = func(args: Dictionary) -> Variant:
		var block_id: String = args["block"]["id"]
		if args["context"] is LsdeBlockContext.ActionContext:
			args["context"].resolve()
		if hold.has(block_id):
			played["held"][block_id] = args["next"]
		else:
			args["next"].call()
		return func() -> void: played["cleaned"].append(block_id)

	engine.on_dialog(dispatch)
	engine.on_choice(dispatch)
	engine.on_action(dispatch)
	engine.on_resolve_condition(func(_test: Dictionary) -> bool: return true)
	engine.on_scene_exit(func(args: Dictionary) -> void: played["exits"].append(args["context"]))
	if configure.is_valid():
		configure.call(engine)

	played["handle"] = engine.scene("s1")
	return played

func _reasons(played: Dictionary) -> Array:
	var reasons: Array = []
	for context in played["exits"]:
		reasons.append(context.get("reason"))
	return reasons

# ─── The stack does not grow with the graph ───────────────────────────────

func _condition_loop(with_before_block: bool) -> Array:
	var counter: Array = [0]
	var played := _setup([
		_block("C", LsdeTypes.BLOCK_CONDITION, [_link("A", "out"), _link("END", "default")], {"cases": [_counter_case("out")]}),
		_block("A", LsdeTypes.BLOCK_ACTION, [_link("C", "then")], {"calls": []}),
		_dialog("END"),
	], [], func(engine: LsdeDialogueEngine) -> void:
		engine.on_resolve_condition(func(_test: Dictionary) -> bool: return counter[0] < PASSES)
		engine.on_action(func(args: Dictionary) -> Variant:
			counter[0] += 1
			args["context"].resolve()
			args["next"].call()
			return null)
		if with_before_block:
			engine.on_before_block(func(args: Dictionary) -> void: args["resolve"].call()))
	played["handle"].start()
	return [played, counter[0]]

func _test_a_condition_action_loop_of_ten_thousand_passes() -> void:
	var result: Array = _condition_loop(false)
	_assert_eq(result[1], PASSES, "a condition-action loop runs all its passes")
	_assert_eq(_reasons(result[0]), [LsdeTypes.SCENE_END_COMPLETED], "and the scene completes")

func _test_the_same_loop_with_an_on_before_block_that_resolves_at_once() -> void:
	var result: Array = _condition_loop(true)
	_assert_eq(result[1], PASSES, "the same loop through on_before_block runs all its passes")
	_assert_eq(_reasons(result[0]), [LsdeTypes.SCENE_END_COMPLETED], "and the scene completes")

func _test_a_queue_of_ten_thousand_wires_walked_in_turn() -> void:
	var wires: Array = []
	var blocks: Array = [null]
	for i in PASSES:
		wires.append(_link("Q%d" % i))
		blocks.append(_dialog("Q%d" % i))
	blocks[0] = _dialog("A", wires)
	var played := _setup(blocks)
	played["handle"].start()

	_assert_eq(played["cleaned"].size(), PASSES + 1, "every queued wire is walked and left")
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_COMPLETED], "and the scene completes")

func _test_a_router_loop_of_ten_thousand_passes() -> void:
	var counter: Array = [0]
	var played := _setup([
		_block("R", LsdeTypes.BLOCK_ROUTER, [_link("A", "K1"), _link("END", "catch")], {"cases": [_counter_case("K1")]}),
		_block("A", LsdeTypes.BLOCK_ACTION, [_link("R", "then")], {"calls": []}),
		_dialog("END"),
	], [], func(engine: LsdeDialogueEngine) -> void:
		engine.on_resolve_condition(func(_test: Dictionary) -> bool: return counter[0] < PASSES)
		engine.on_action(func(args: Dictionary) -> Variant:
			counter[0] += 1
			args["context"].resolve()
			args["next"].call()
			return null))
	played["handle"].start()

	_assert_eq(counter[0], PASSES, "a router loop runs all its passes")
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_COMPLETED], "and the scene completes")

# ─── A deadlock closes the scene, whichever track parks last ──────────────

func _test_a_single_track_parked_on_a_block_never_reached_closes_the_scene() -> void:
	var played := _setup([
		_dialog("D1", [_link("D2")]),
		_dialog("D2", [], {"waitForBlocks": ["NEVER"]}),
		_dialog("NEVER"),
	])
	played["handle"].start()

	_assert_eq(played["handle"].is_running(), false, "a single parked track closes the scene")
	_assert_eq(played["engine"].is_running(), false, "and the engine lets it go")
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_DEADLOCKED], "as deadlocked")
	_assert_eq(played["exits"][0].get("waitingFor"), ["NEVER"], "naming the block it waited for")

func _test_two_tracks_waiting_for_each_other_close_the_scene() -> void:
	var played := _setup([
		_dialog("D1", [_link("A"), _link("M")]),
		_dialog("A", [], {"isAsync": true, "waitForBlocks": ["M"]}),
		_dialog("M", [], {"waitForBlocks": ["A"]}),
	])
	played["handle"].start()

	_assert_eq(played["handle"].is_running(), false, "two tracks waiting for each other close the scene")
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_DEADLOCKED], "as deadlocked")
	_assert_eq(played["exits"][0].get("waitingFor"), ["M", "A"], "in the order the tracks parked")

func _test_a_track_parked_while_another_still_runs_is_not_a_deadlock() -> void:
	var played := _setup([
		_dialog("D1", [_link("J"), _link("BG")]),
		_dialog("J", [], {"waitForBlocks": ["BG"]}),
		_dialog("BG", [], {"isAsync": true}),
	], ["BG"])
	played["handle"].start()

	_assert_eq(played["handle"].is_running(), true, "a parked track beside a live one keeps the scene open")
	_assert_eq(played["exits"].size(), 0, "and nothing exits")

# ─── Why the scene ended ──────────────────────────────────────────────────

func _test_on_scene_exit_is_told_completed() -> void:
	var played := _setup([_dialog("D1")])
	played["handle"].start()
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_COMPLETED], "completed")

func _test_on_scene_exit_is_told_cancelled_by_the_handle() -> void:
	var played := _setup([_dialog("D1")], ["D1"])
	played["handle"].start()
	played["handle"].cancel()
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_CANCELLED], "cancelled, by the handle")

func _test_on_scene_exit_is_told_cancelled_by_engine_stop() -> void:
	var played := _setup([_dialog("D1")], ["D1"])
	played["handle"].start()
	played["engine"].stop()
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_CANCELLED], "cancelled, by engine.stop()")

func _test_on_scene_exit_is_told_invalidated() -> void:
	var played := _setup([_dialog("D1", [_link("D2")]), _dialog("D2")], [],
		func(engine: LsdeDialogueEngine) -> void:
			engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
				return {"valid": args["nextBlock"]["id"] != "D2"}))
	played["handle"].start()
	_assert_eq(_reasons(played), [LsdeTypes.SCENE_END_INVALIDATED], "invalidated, when the game refuses the next block")

func _test_on_scene_enter_is_not_told_a_reason() -> void:
	var entered: Array = []
	var played := _setup([_dialog("D1")], ["D1"], func(engine: LsdeDialogueEngine) -> void:
		engine.on_scene_enter(func(args: Dictionary) -> void: entered.append(args["context"])))
	played["handle"].start()
	_assert_eq(entered[0].has("reason"), false, "on_scene_enter is not told a reason")

# ─── Closing is not re-entrant ────────────────────────────────────────────

func _test_a_cleanup_that_cancels_the_scene_does_not_exit_twice() -> void:
	var played := _setup([_dialog("D1")], ["D1"])
	played["handle"].on_dialog_id("D1", func(args: Dictionary) -> Variant:
		var scene: LsdeSceneHandle = args["scene"]
		return func() -> void: scene.cancel())
	played["handle"].start()

	played["handle"].cancel()

	_assert_eq(played["exits"].size(), 1, "a cleanup that cancels its scene does not exit twice")
	_assert_eq(played["engine"].is_running(), false, "and the engine lets it go")

func _test_a_cleanup_that_stops_the_engine_does_not_exit_twice() -> void:
	var played := _setup([_dialog("D1")], ["D1"])
	var engine: LsdeDialogueEngine = played["engine"]
	played["handle"].on_dialog_id("D1", func(_args: Dictionary) -> Variant:
		return func() -> void: engine.stop())
	played["handle"].start()

	engine.stop()

	_assert_eq(played["exits"].size(), 1, "a cleanup that stops the engine does not exit twice")
	_assert_eq(engine.is_running(), false, "and the engine lets it go")

# ─── resolve() inside on_before_block is deferred, like next() ────────────

func _test_code_after_a_synchronous_resolve_runs_before_the_block_is_dispatched() -> void:
	var order: Array = []
	var played := _setup([_dialog("D1")], ["D1"], func(engine: LsdeDialogueEngine) -> void:
		engine.on_before_block(func(args: Dictionary) -> void:
			args["resolve"].call()
			order.append("after resolve"))
		engine.on_dialog(func(args: Dictionary) -> Variant:
			order.append("dispatched")
			return null))
	played["handle"].start()

	_assert_eq(order, ["after resolve", "dispatched"], "the block is dispatched once on_before_block returns")

# ─── Which scene ended ────────────────────────────────────────────────────

func _test_the_handle_names_its_scene() -> void:
	var played := _setup([_dialog("D1")], ["D1"])

	_assert_eq(played["handle"].get_scene_id(), "sc_test0001", "get_scene_id() is the stable id")
	_assert_eq(played["handle"].get_scene_path(), "s1", "get_scene_path() is the path a writer reads")

func _test_a_global_on_scene_exit_can_tell_two_scenes_apart() -> void:
	var data := _one_scene([_dialog("A1")])
	var second: Dictionary = data["scenes"][0].duplicate(true)
	second["scene"] = "second"
	second["id"] = "sc_second"
	second["blocks"] = [_dialog("B1")]
	second["start"] = "B1"
	data["scenes"][0]["scene"] = "first"
	data["scenes"][0]["id"] = "sc_first"
	data["scenes"].append(second)

	var engine := LsdeDialogueEngine.new()
	_assert_eq(engine.init({"data": data})["errors"].size(), 0, "two scenes load")
	engine.on_dialog(func(_args: Dictionary) -> Variant: return null)
	engine.on_choice(func(args: Dictionary) -> Variant:
		args["next"].call()
		return null)
	engine.on_action(func(args: Dictionary) -> Variant:
		args["next"].call()
		return null)
	engine.on_resolve_condition(func(_test: Dictionary) -> bool: return true)

	var ended: Array = []
	engine.on_scene_exit(func(args: Dictionary) -> void: ended.append(args["scene"].get_scene_id()))

	engine.scene("first").start()
	engine.scene("second").start()
	engine.stop()

	_assert_eq(ended, ["sc_first", "sc_second"], "a global on_scene_exit tells two scenes apart")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Traversal Robustness Tests ──")
	_test_the_handle_names_its_scene()
	_test_a_global_on_scene_exit_can_tell_two_scenes_apart()
	_test_a_condition_action_loop_of_ten_thousand_passes()
	_test_the_same_loop_with_an_on_before_block_that_resolves_at_once()
	_test_a_queue_of_ten_thousand_wires_walked_in_turn()
	_test_a_router_loop_of_ten_thousand_passes()
	_test_a_single_track_parked_on_a_block_never_reached_closes_the_scene()
	_test_two_tracks_waiting_for_each_other_close_the_scene()
	_test_a_track_parked_while_another_still_runs_is_not_a_deadlock()
	_test_on_scene_exit_is_told_completed()
	_test_on_scene_exit_is_told_cancelled_by_the_handle()
	_test_on_scene_exit_is_told_cancelled_by_engine_stop()
	_test_on_scene_exit_is_told_invalidated()
	_test_on_scene_enter_is_not_told_a_reason()
	_test_a_cleanup_that_cancels_the_scene_does_not_exit_twice()
	_test_a_cleanup_that_stops_the_engine_does_not_exit_twice()
	_test_code_after_a_synchronous_resolve_runs_before_the_block_is_dispatched()
	return {"passed": _passed, "failed": _failed, "total": _total}

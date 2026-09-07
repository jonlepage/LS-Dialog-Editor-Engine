## LSDE Dialog Engine — Robustness tests (port of robustness.test.ts)
##
## Every case here is something a game integration does by accident: a timer that fires
## twice, a resolve() kept in a closure past the end of the scene, a NOTE block a designer
## wired back on itself. The engine cannot prevent any of these; it can only refuse to
## make them worse than they are.
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

static func _make_export(scenes: Array) -> Dictionary:
	return {"version": "1.0.0", "exportDate": "2025-01-01", "locales": ["en"], "scenes": scenes}

static func _register_all_handlers(engine: LsdeDialogueEngine) -> void:
	engine.on_dialog(func(args: Dictionary) -> Variant:
		args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant:
		var choices: Array = args["context"].choices
		if choices.size() > 0:
			args["context"].select_choice(choices[0]["uuid"])
		args["next"].call(); return null)
	engine.on_condition(func(args: Dictionary) -> Variant:
		args["context"].resolve(true); args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant:
		args["context"].resolve(); args["next"].call(); return null)

static func _dialog(uuid: String, start: bool = false) -> Dictionary:
	return {"uuid": uuid, "type": "DIALOG", "properties": [], "isStartBlock": start}

static func _note(uuid: String, start: bool = false) -> Dictionary:
	return {"uuid": uuid, "type": "NOTE", "properties": [], "isStartBlock": start}

static func _conn(from_id: String, to_id: String, port: String = "out") -> Dictionary:
	return {"id": from_id + "-" + to_id, "fromId": from_id, "toId": to_id, "fromPort": port, "toPort": "in"}

static func _scene(blocks: Array, connections: Array) -> Dictionary:
	return {"uuid": "s1", "label": "S1", "date": "2025-01-01", "blocks": blocks, "connections": connections}

# ─── on_before_block resolve() called twice ───────────────────────────────

func _test_second_resolve_does_not_dispatch_twice() -> void:
	var dispatched: Array = []
	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_scene(
		[_dialog("b1", true), _dialog("b2")],
		[_conn("b1", "b2")])])})

	_register_all_handlers(engine)
	engine.on_before_block(func(args: Dictionary) -> void:
		args["resolve"].call()
		args["resolve"].call())  # a timer that fired twice — must be ignored
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["uuid"]); args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(dispatched, ["b1", "b2"], "second resolve() does not dispatch twice")

# ─── A stale resolve() must not revive a finished scene ───────────────────

func _test_resolve_after_scene_ended_does_not_revive() -> void:
	var dispatched: Array = []
	var stale: Array = []
	var exits: Array = [0]

	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_scene([_dialog("b1", true)], [])])})

	_register_all_handlers(engine)
	engine.on_scene_exit(func(_args: Dictionary) -> void: exits[0] += 1)
	engine.on_before_block(func(args: Dictionary) -> void:
		stale.append(args["resolve"])
		args["resolve"].call())
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["uuid"]); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_false(handle.is_running(), "scene ended")
	_assert_eq(dispatched.size(), 1, "one block dispatched")

	for resolve_fn in stale:
		resolve_fn.call()

	_assert_eq(dispatched.size(), 1, "stale resolve() dispatched nothing more")
	_assert_eq(exits[0], 1, "on_scene_exit fired exactly once")

	# A captured Callable holds the SceneHandle alive — drop it, or Godot reports leaked
	# instances at exit and every later run looks like it has a problem it does not have.
	stale.clear()

func _test_resolve_after_cancel_does_not_dispatch() -> void:
	var dispatched: Array = []
	var stale: Array = []

	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_scene(
		[_dialog("b1", true), _dialog("b2")],
		[_conn("b1", "b2")])])})

	_register_all_handlers(engine)
	engine.on_before_block(func(args: Dictionary) -> void: stale.append(args["resolve"]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["uuid"]); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()
	handle.cancel()

	for resolve_fn in stale:
		resolve_fn.call()

	_assert_eq(dispatched.size(), 0, "resolve() after cancel() dispatched nothing")
	stale.clear()

# ─── A NOTE wired back on itself ──────────────────────────────────────────

func _test_note_wired_to_itself_ends_scene() -> void:
	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_scene([_note("n1", true)], [_conn("n1", "n1")])])})
	_register_all_handlers(engine)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_false(handle.is_running(), "self-wired NOTE ends the scene")

func _test_two_notes_in_a_loop_end_scene() -> void:
	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_scene(
		[_note("n1", true), _note("n2")],
		[_conn("n1", "n2"), _conn("n2", "n1")])])})
	_register_all_handlers(engine)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	_assert_false(handle.is_running(), "NOTE loop ends the scene")

func _test_note_chain_reaches_the_real_block() -> void:
	var dispatched: Array = []
	var engine := LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_scene(
		[_note("n1", true), _note("n2"), _dialog("b1")],
		[_conn("n1", "n2"), _conn("n2", "b1")])])})
	_register_all_handlers(engine)
	engine.on_dialog(func(args: Dictionary) -> Variant:
		dispatched.append(args["block"]["uuid"]); args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(dispatched, ["b1"], "NOTE chain reaches the block behind it")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Robustness Tests ──")
	_test_second_resolve_does_not_dispatch_twice()
	_test_resolve_after_scene_ended_does_not_revive()
	_test_resolve_after_cancel_does_not_dispatch()
	_test_note_wired_to_itself_ends_scene()
	_test_two_notes_in_a_loop_end_scene()
	_test_note_chain_reaches_the_real_block()
	return {"passed": _passed, "failed": _failed, "total": _total}

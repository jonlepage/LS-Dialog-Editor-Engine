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
	return {"passed": _passed, "failed": _failed, "total": _total}

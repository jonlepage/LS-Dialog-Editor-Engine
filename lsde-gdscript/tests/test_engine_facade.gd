## LSDE Dialog Engine — the facade (port of the "init", "setLocale", "getSceneConnections" and
## "cleanups" suites of engine.test.ts and scene-handle.test.ts)
##
## GDScript has no exceptions: where the other three runtimes throw, this one pushes an error and
## returns null (scene) or leaves the state unchanged (set_locale). The push_error lines this suite
## prints are expected.
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

static func _dialog(id: String, next: Array = []) -> Dictionary:
	return {"id": id, "key": "__blueprints__.s1." + id, "type": LsdeTypes.BLOCK_DIALOG, "next": next}

static func _link(to: String) -> Dictionary:
	return {"port": "out", "to": to, "toPort": "in"}

static func _scene(path: String, blocks: Array) -> Dictionary:
	return {
		"scene": path, "id": "sc_" + path,
		"start": blocks[0]["id"] if blocks.size() > 0 else null,
		"blocks": blocks,
	}

static func _blueprint(scenes: Array) -> Dictionary:
	return {
		"format": LsdeTypes.SUPPORTED_FORMAT,
		"version": LsdeTypes.SUPPORTED_VERSION,
		"generator": {"app": "LSDE", "version": "2.0.3"},
		"exportedAt": "2026-09-07T00:00:00.000Z",
		"project": "Test",
		"locales": ["en"],
		"referenceLocale": "en",
		"dictionaries": [], "functions": [], "cards": [],
		"scenes": scenes,
	}

static func _one_scene(blocks: Array) -> Dictionary:
	return _blueprint([_scene("s1", blocks)])

static func _register_all(engine: LsdeDialogueEngine) -> void:
	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["next"].call(); return null)

func _ready_engine(data: Dictionary) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	_register_all(engine)
	return engine

# ─── get_scene_connections ────────────────────────────────────────────────

func _test_get_scene_connections_returns_the_wires_inside_a_scene() -> void:
	var engine := _ready_engine(_one_scene([
		_dialog("b1", [_link("b2"), _link("b3")]),
		_dialog("b2", [_link("b3")]),
		_dialog("b3"),
	]))

	var wires: Array = engine.get_scene_connections("s1")

	_assert_eq(wires.size(), 3, "three wires")
	if wires.size() != 3:
		return
	_assert_eq(wires[0]["from"], "b1", "each wire carries the block it leaves")
	_assert_eq(wires[0]["to"], "b2", "and where it goes")
	_assert_eq(wires[0]["port"], "out", "and its port")
	_assert_eq(wires[0]["toPort"], "in", "and the entry port")
	_assert_eq(wires[2]["from"], "b2", "in file order")

func _test_get_scene_connections_returns_nothing_for_a_scene_that_is_not_there() -> void:
	var engine := _ready_engine(_one_scene([_dialog("b1")]))
	_assert_eq(engine.get_scene_connections("nowhere"), [], "unknown scene → nothing")

func _test_get_scene_connections_returns_nothing_before_init() -> void:
	_assert_eq(LsdeDialogueEngine.new().get_scene_connections("s1"), [], "before init → nothing")

# ─── set_locale ───────────────────────────────────────────────────────────

func _test_set_locale_accepts_a_locale_the_project_declares() -> void:
	var engine := _ready_engine(_one_scene([_dialog("b1")]))
	engine.set_locale("en")
	_assert_eq(LsdeUtils.locale, "en", "the locale is synced to LsdeUtils")

func _test_set_locale_refuses_one_it_does_not() -> void:
	var engine := _ready_engine(_one_scene([_dialog("b1")]))
	engine.set_locale("en")
	# push_error, not an exception: the locale simply does not change.
	engine.set_locale("xx")
	_assert_eq(LsdeUtils.locale, "en", "an unknown locale is refused and the previous one stays")

# ─── init ─────────────────────────────────────────────────────────────────

func _test_a_second_init_replaces_the_data_cleanly() -> void:
	var engine := _ready_engine(_blueprint([_scene("sA", [_dialog("A")])]))
	var report: Dictionary = engine.init({"data": _blueprint([_scene("sB", [_dialog("B")])])})
	_assert_eq(report["errors"].size(), 0, "the second payload loads")

	# push_error and null, where the other three runtimes throw.
	_assert_eq(engine.scene("sA"), null, "the first payload is gone")
	_assert_eq(engine.scene("sB") != null, true, "the second one answers")

func _test_recovers_from_a_failed_init() -> void:
	var engine := LsdeDialogueEngine.new()
	var bad: Dictionary = engine.init({"data": {"format": "nope"}})
	_assert_eq(bad["errors"].size() > 0, true, "a bad payload is refused")
	_assert_eq(engine.scene("s1"), null, "no scene on a refused payload")

	var good: Dictionary = engine.init({"data": _one_scene([_dialog("b1")])})
	_assert_eq(good["errors"].size(), 0, "a good payload loads afterwards")
	_register_all(engine)
	_assert_eq(engine.scene("s1") != null, true, "and the scene answers")

# ─── Cleanups ─────────────────────────────────────────────────────────────

func _test_runs_the_cleanup_when_leaving_a_block_before_the_next_is_dispatched() -> void:
	var log: Array = []
	var engine := _ready_engine(_one_scene([
		_dialog("A", [_link("B"), _link("C")]),
		_dialog("B"),
		_dialog("C"),
	]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		var id: String = args["block"]["id"]
		log.append("dispatch " + id)
		args["next"].call()
		return func() -> void: log.append("cleanup " + id))

	engine.scene("s1").start()

	# Each block is released as the track walks off it — B and C are walked in turn from the
	# queue, and A's cleanup runs before B is dispatched, not when the queue empties.
	_assert_eq(log, ["dispatch A", "cleanup A", "dispatch B", "cleanup B", "dispatch C", "cleanup C"],
		"cleanup runs when the block is LEFT")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Engine Facade Tests ──")
	_test_get_scene_connections_returns_the_wires_inside_a_scene()
	_test_get_scene_connections_returns_nothing_for_a_scene_that_is_not_there()
	_test_get_scene_connections_returns_nothing_before_init()
	_test_set_locale_accepts_a_locale_the_project_declares()
	_test_set_locale_refuses_one_it_does_not()
	_test_a_second_init_replaces_the_data_cleanly()
	_test_recovers_from_a_failed_init()
	_test_runs_the_cleanup_when_leaving_a_block_before_the_next_is_dispatched()
	return {"passed": _passed, "failed": _failed, "total": _total}

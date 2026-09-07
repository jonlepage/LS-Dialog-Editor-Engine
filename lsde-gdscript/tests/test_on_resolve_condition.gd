## LSDE Dialog Engine — the condition resolver end to end (port of the TS suite).
##
## on_resolve_condition is the SINGLE game-state evaluator: it answers option visibility and it
## pre-evaluates the cases of a condition block. Once it is installed the engine already knows
## which port a condition leaves by, which is what makes on_condition optional.
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

func _assert_true(value: bool, label: String) -> void:
	_assert_eq(value, true, label)

func _assert_false(value: bool, label: String) -> void:
	_assert_eq(value, false, label)

static func _block(id: String, type: String, extra: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {"id": id, "key": "__blueprints__.s1." + id, "type": type, "next": []}
	b.merge(extra, true)
	return b

static func _dialog(id: String) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_DIALOG)

static func _link(to: String, port: String = "out") -> Dictionary:
	return {"port": port, "to": to, "toPort": "in"}

static func _test(entry: String) -> Dictionary:
	return {"dict": "switches", "entry": entry, "op": LsdeTypes.OP_EQUALS, "value": true}

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

## A condition in if mode: out when it holds, default when it does not.
static func _branching() -> Dictionary:
	var cond: Dictionary = _block("k1", LsdeTypes.BLOCK_CONDITION, {
		"cases": [{"port": LsdeTypes.PORT_OUT, "when": [_test("flag")]}],
		"next": [_link("yes", LsdeTypes.PORT_OUT), _link("no", LsdeTypes.PORT_DEFAULT)],
	})
	return _one_scene([cond, _dialog("yes"), _dialog("no")])

func _base_engine(data: Dictionary, with_condition: bool = true) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")

	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant:
		args["context"].resolve(); args["next"].call(); return null)
	if with_condition:
		engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	return engine

func _play(engine: LsdeDialogueEngine) -> Array:
	var visited: Array = []
	engine.on_dialog(func(args: Dictionary) -> Variant:
		visited.append(args["block"]["id"]); args["next"].call(); return null)
	engine.scene("s1").start()
	return visited

# ─── Routing ──────────────────────────────────────────────────────────────

func _test_routes_on_its_own_when_the_handler_only_calls_next() -> void:
	var engine := _base_engine(_branching())
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return true)
	_assert_eq(_play(engine), ["yes"], "routes to out when the case holds")

func _test_routes_to_default_when_the_case_does_not_hold() -> void:
	var engine := _base_engine(_branching())
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return false)
	_assert_eq(_play(engine), ["no"], "routes to default when it does not")

func _test_routes_with_no_on_condition_handler_at_all() -> void:
	var engine := _base_engine(_branching(), false)
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return true)
	_assert_eq(_play(engine), ["yes"], "on_condition is optional once a resolver is installed")

func _test_hands_the_handler_each_case_with_its_port_and_result() -> void:
	var seen: Array = []
	var engine := _base_engine(_branching())
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return true)
	engine.on_condition(func(args: Dictionary) -> Variant:
		for c in args["context"].cases:
			seen.append([c["port"], c["result"]])
		args["next"].call(); return null)

	_play(engine)

	_assert_eq(seen, [[LsdeTypes.PORT_OUT, true]], "cases carry their port and result")

func _test_the_handler_can_override_the_port() -> void:
	var engine := _base_engine(_branching())
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return true)
	engine.on_condition(func(args: Dictionary) -> Variant:
		args["context"].resolve(LsdeTypes.PORT_DEFAULT); args["next"].call(); return null)

	_assert_eq(_play(engine), ["no"], "resolve() overrides what the cases said")

func _test_routes_to_the_case_port_with_port_per_case() -> void:
	var cond: Dictionary = _block("k1", LsdeTypes.BLOCK_CONDITION, {
		"props": {"portPerCase": true},
		"cases": [
			{"port": "K1", "when": [_test("a")]},
			{"port": "K2", "when": [_test("b")]},
		],
		"next": [_link("first", "K1"), _link("second", "K2"), _link("none", LsdeTypes.PORT_DEFAULT)],
	})
	var engine := _base_engine(_one_scene([
		cond, _dialog("first"), _dialog("second"), _dialog("none")]))
	engine.on_resolve_condition(func(t: Dictionary) -> bool: return t["entry"] == "b")

	_assert_eq(_play(engine), ["second"], "portPerCase takes the first holding case port")

func _test_routes_to_default_with_port_per_case_when_none_holds() -> void:
	var cond: Dictionary = _block("k1", LsdeTypes.BLOCK_CONDITION, {
		"props": {"portPerCase": true},
		"cases": [{"port": "K1", "when": [_test("a")]}],
		"next": [_link("first", "K1"), _link("none", LsdeTypes.PORT_DEFAULT)],
	})
	var engine := _base_engine(_one_scene([cond, _dialog("first"), _dialog("none")]))
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return false)

	_assert_eq(_play(engine), ["none"], "portPerCase falls back to default")

# ─── Option visibility comes from the same resolver ───────────────────────

func _test_tags_option_visibility_from_the_same_resolver() -> void:
	var seen: Array = []
	var choice: Dictionary = _block("c1", LsdeTypes.BLOCK_CHOICE, {
		"options": [
			{"id": "C1", "key": "k1"},
			{"id": "C2", "key": "k2", "when": [_test("flag")]},
		],
	})
	var engine := _base_engine(_one_scene([choice]))
	engine.on_resolve_condition(func(_t: Dictionary) -> bool: return false)
	engine.on_choice(func(args: Dictionary) -> Variant:
		for o in args["context"].options:
			seen.append(o.get("visible"))
		args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(seen, [true, false], "the same resolver tags option visibility")

func _test_leaves_option_visibility_unknown_with_no_resolver() -> void:
	# Saying false about a question nobody could answer would HIDE an answer from the player.
	var seen: Array = []
	var choice: Dictionary = _block("c1", LsdeTypes.BLOCK_CHOICE, {
		"options": [{"id": "C1", "key": "k1", "when": [_test("flag")]}],
	})
	var engine := _base_engine(_one_scene([choice]))
	engine.on_choice(func(args: Dictionary) -> Variant:
		for o in args["context"].options:
			seen.append(o.has("visible"))
		args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(seen, [false], "no resolver → visible unset, not false")

# ─── The reserved choice dictionary ───────────────────────────────────────

func _test_a_choice_test_is_answered_from_the_scene_history() -> void:
	var asked: Array = []
	var choice: Dictionary = _block("c1", LsdeTypes.BLOCK_CHOICE, {
		"options": [{"id": "C1", "key": "k1"}, {"id": "C2", "key": "k2"}],
		"next": [_link("k1", "C1"), _link("k1", "C2")],
	})
	var cond: Dictionary = _block("k1", LsdeTypes.BLOCK_CONDITION, {
		"cases": [{"port": LsdeTypes.PORT_OUT, "when": [
			{"dict": LsdeTypes.DICT_CHOICE, "entry": "c1", "op": LsdeTypes.OP_EQUALS, "value": "C1"},
		]}],
		"next": [_link("yes", LsdeTypes.PORT_OUT), _link("no", LsdeTypes.PORT_DEFAULT)],
	})

	var engine := _base_engine(_one_scene([choice, cond, _dialog("yes"), _dialog("no")]))
	engine.on_resolve_condition(func(t: Dictionary) -> bool:
		asked.append(t["dict"]); return false)
	engine.on_choice(func(args: Dictionary) -> Variant:
		args["context"].select_choice("C1"); args["next"].call(); return null)

	_assert_eq(_play(engine), ["yes"], "the engine remembers the answer")
	_assert_eq(asked.size(), 0, "the game is never asked about a choice test")

func _test_evaluate_condition_answers_through_the_scene_handle() -> void:
	var engine := _base_engine(_branching())
	engine.on_resolve_condition(func(t: Dictionary) -> bool: return t["entry"] == "flag")
	var handle: LsdeSceneHandle = engine.scene("s1")

	_assert_true(handle.evaluate_condition(_test("flag")), "known entry is true")
	_assert_false(handle.evaluate_condition(_test("other")), "unknown entry is false")

func _test_evaluate_condition_is_false_with_no_resolver() -> void:
	var engine := _base_engine(_branching())
	_assert_false(engine.scene("s1").evaluate_condition(_test("flag")),
		"no resolver → game-state tests are false")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── onResolveCondition Tests ──")
	_test_routes_on_its_own_when_the_handler_only_calls_next()
	_test_routes_to_default_when_the_case_does_not_hold()
	_test_routes_with_no_on_condition_handler_at_all()
	_test_hands_the_handler_each_case_with_its_port_and_result()
	_test_the_handler_can_override_the_port()
	_test_routes_to_the_case_port_with_port_per_case()
	_test_routes_to_default_with_port_per_case_when_none_holds()
	_test_tags_option_visibility_from_the_same_resolver()
	_test_leaves_option_visibility_unknown_with_no_resolver()
	_test_a_choice_test_is_answered_from_the_scene_history()
	_test_evaluate_condition_answers_through_the_scene_handle()
	_test_evaluate_condition_is_false_with_no_resolver()
	return {"passed": _passed, "failed": _failed, "total": _total}

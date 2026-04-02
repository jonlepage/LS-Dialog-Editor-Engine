## LSDE Dialog Engine — Integration tests for on_resolve_condition
## Port of engine.test.ts §onResolveCondition (P0-2 excluded: assert non-catchable)
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

# ─── Shared Blueprints ───────────────────────────────────────────────────

static func _cond_scene() -> Dictionary:
	return {
		"uuid": "scene-rc", "label": "ResolveCondition", "date": "2025-01-01",
		"blocks": [
			{"uuid": "cond1", "type": "CONDITION", "properties": [], "isStartBlock": true,
				"conditions": [[{"uuid": "c1", "key": "flag", "operator": "=", "value": "true"}]]},
			{"uuid": "yes", "type": "DIALOG", "properties": []},
			{"uuid": "no", "type": "DIALOG", "properties": []},
		],
		"connections": [
			{"id": "ct", "fromId": "cond1", "toId": "yes", "fromPort": "true", "toPort": "in", "fromPortIndex": 0},
			{"id": "cf", "fromId": "cond1", "toId": "no", "fromPort": "false", "toPort": "in", "fromPortIndex": 1},
		],
	}

static func _switch_scene(uuid: String = "scene-sw") -> Dictionary:
	return {
		"uuid": uuid, "label": "Switch", "date": "2025-01-01",
		"blocks": [
			{"uuid": "cond", "type": "CONDITION", "properties": [], "isStartBlock": true,
				"conditions": [
					[{"uuid": "c1", "key": "x", "operator": "=", "value": "1"}],
					[{"uuid": "c2", "key": "y", "operator": "=", "value": "2"}],
				]},
			{"uuid": "case0", "type": "DIALOG", "properties": []},
			{"uuid": "case1", "type": "DIALOG", "properties": []},
			{"uuid": "default", "type": "DIALOG", "properties": []},
		],
		"connections": [
			{"id": "s0", "fromId": "cond", "toId": "case0", "fromPort": "case_0", "toPort": "in", "fromPortIndex": 0},
			{"id": "s1", "fromId": "cond", "toId": "case1", "fromPort": "case_1", "toPort": "in", "fromPortIndex": 1},
			{"id": "sd", "fromId": "cond", "toId": "default", "fromPort": "default", "toPort": "in", "fromPortIndex": 2},
		],
	}

static func _dispatch_scene() -> Dictionary:
	return {
		"uuid": "scene-disp", "label": "Dispatch", "date": "2025-01-01",
		"blocks": [
			{"uuid": "cond", "type": "CONDITION", "properties": [], "isStartBlock": true,
				"nativeProperties": {"enableDispatcher": true},
				"conditions": [
					[{"uuid": "c1", "key": "a", "operator": "=", "value": "1"}],
					[{"uuid": "c2", "key": "b", "operator": "=", "value": "2"}],
				]},
			{"uuid": "async0", "type": "DIALOG", "properties": [], "nativeProperties": {"isAsync": true}},
			{"uuid": "async1", "type": "DIALOG", "properties": [], "nativeProperties": {"isAsync": true}},
			{"uuid": "main", "type": "DIALOG", "properties": []},
		],
		"connections": [
			{"id": "d0", "fromId": "cond", "toId": "async0", "fromPort": "case_0", "toPort": "in", "fromPortIndex": 0},
			{"id": "d1", "fromId": "cond", "toId": "async1", "fromPort": "case_1", "toPort": "in", "fromPortIndex": 1},
			{"id": "dd", "fromId": "cond", "toId": "main", "fromPort": "default", "toPort": "in", "fromPortIndex": 2},
		],
	}

# ─── Run all tests ────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── OnResolveCondition Integration Tests ──")
	_test_p0_start_does_not_crash()
	_test_p0_auto_resolve_when_handler_does_not_call_resolve()
	_test_p0_auto_resolve_to_default_when_no_group_matches()
	_test_p0_auto_resolve_without_on_condition_handler()
	_test_p0_handler_receives_pre_evaluated_groups()
	_test_p0_handler_can_override_auto_resolve()
	_test_p1_switch_mode_routes_to_matching_case()
	_test_p1_switch_mode_routes_to_default()
	_test_p1_dispatcher_mode_spawns_async_tracks()
	_test_p1_evaluate_condition_uses_resolver()
	_test_p1_evaluate_condition_returns_false_without_resolver()
	_test_p1_set_choice_filter_alias()
	return {"passed": _passed, "failed": _failed, "total": _total}

# ─── P0: on_condition optionnel quand resolver installe ──────────────────

func _test_p0_start_does_not_crash() -> void:
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return true)
	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	# NO engine.on_condition()
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()
	_assert_true(true, "P0-1: start() does not crash when on_condition omitted but resolver installed")

# P0-2 (start throws when neither) SKIPPED: GDScript assert is non-catchable

# ─── P0: Auto-resolve sans resolve() ────────────────────────────────────

func _test_p0_auto_resolve_when_handler_does_not_call_resolve() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return true)
	engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null) # no resolve()
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()
	_assert_eq(visited, ["yes"], "P0-3: auto-resolve when handler does not call resolve()")

func _test_p0_auto_resolve_to_default_when_no_group_matches() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return false)
	engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()
	_assert_eq(visited, ["no"], "P0-4: auto-resolve to default when no group matches")

func _test_p0_auto_resolve_without_on_condition_handler() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return true)
	# No on_condition registered
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()
	_assert_eq(visited, ["yes"], "P0-5: auto-resolve without on_condition handler at all")

# ─── P0: pre-evaluated condition_groups ──────────────────────────────────

func _test_p0_handler_receives_pre_evaluated_groups() -> void:
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return true)

	var received_groups: Array = []
	engine.on_condition(func(args: Dictionary) -> Variant:
		var groups: Array = args["context"].condition_groups
		for g in groups:
			received_groups.append(g)
		args["next"].call(); return null)
	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()

	_assert_eq(received_groups.size(), 1, "P0-6: received 1 conditionGroup")
	if received_groups.size() > 0:
		_assert_eq(received_groups[0].get("port_index", -1), 0, "P0-6: portIndex = 0")
		_assert_true(received_groups[0].get("result", false), "P0-6: result = true")

func _test_p0_handler_can_override_auto_resolve() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return true) # would auto-route to 'yes'
	engine.on_condition(func(args: Dictionary) -> Variant:
		args["context"].resolve(false) # override → route to 'no'
		args["next"].call(); return null)
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()
	_assert_eq(visited, ["no"], "P0-7: handler can override auto-resolve with explicit resolve()")

# ─── P1: Switch mode integration ────────────────────────────────────────

func _test_p1_switch_mode_routes_to_matching_case() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_switch_scene()])})
	engine.on_resolve_condition(func(c: Dictionary) -> bool: return c.get("key", "") == "y")
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-sw").start()
	_assert_eq(visited, ["case1"], "P1-1: switch mode routes to matching case port")

func _test_p1_switch_mode_routes_to_default() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_switch_scene("scene-sw2")])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return false)
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-sw2").start()
	_assert_eq(visited, ["default"], "P1-3: switch mode routes to default when no case matches")

# ─── P1: Dispatcher mode integration ────────────────────────────────────

func _test_p1_dispatcher_mode_spawns_async_tracks() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_dispatch_scene()])})
	engine.on_resolve_condition(func(_c: Dictionary) -> bool: return true)
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-disp").start()
	visited.sort()
	_assert_eq(visited, ["async0", "async1", "main"], "P1-4: dispatcher mode spawns async tracks")

# ─── P1: evaluate_condition() uses resolver ──────────────────────────────

func _test_p1_evaluate_condition_uses_resolver() -> void:
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.on_resolve_condition(func(c: Dictionary) -> bool: return c.get("key", "") == "flag")
	_register_all_handlers(engine)

	var handle: LsdeSceneHandle = engine.scene("scene-rc")
	var eval_result: Array = [false]
	handle.on_condition(func(args: Dictionary) -> Variant:
		eval_result[0] = args["scene"].evaluate_condition({"uuid": "t", "key": "flag", "operator": "=", "value": ""})
		args["next"].call(); return null)
	handle.start()
	_assert_true(eval_result[0], "P1-5: evaluate_condition() uses resolver for non-choice conditions")

func _test_p1_evaluate_condition_returns_false_without_resolver() -> void:
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	_register_all_handlers(engine)

	var handle: LsdeSceneHandle = engine.scene("scene-rc")
	var eval_result: Array = [true] # init to true, expect false
	handle.on_condition(func(args: Dictionary) -> Variant:
		eval_result[0] = args["scene"].evaluate_condition({"uuid": "t", "key": "flag", "operator": "=", "value": ""})
		args["context"].resolve(true)
		args["next"].call(); return null)
	handle.start()
	_assert_false(eval_result[0], "P1-6: evaluate_condition() returns false without resolver")

# ─── P1: set_choice_filter backward compat alias ────────────────────────

func _test_p1_set_choice_filter_alias() -> void:
	var visited: Array = []
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	engine.init({"data": _make_export([_cond_scene()])})
	engine.set_choice_filter(func(_c: Dictionary) -> bool: return true) # alias
	engine.on_dialog(func(args: Dictionary) -> Variant: visited.append(args["block"]["uuid"]); args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	# No on_condition — should auto-resolve via set_choice_filter alias
	engine.on_action(func(args: Dictionary) -> Variant: args["context"].resolve(); args["next"].call(); return null)
	engine.scene("scene-rc").start()
	_assert_eq(visited, ["yes"], "P1-7: set_choice_filter still works as alias for on_resolve_condition")

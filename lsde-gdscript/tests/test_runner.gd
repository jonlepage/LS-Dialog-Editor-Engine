## Cross-language test runner — reads JSON test specs and executes against the GDScript engine.
extends SceneTree

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

func _init() -> void:
	_run_flow_tests("test-cases.json")
	_run_flow_tests("test-port-routing.json")
	_run_validation_tests("test-init-validation.json")

	# ── Native condition tests (unit + integration) ──
	var cond_eval_tests := preload("res://tests/test_condition_evaluator.gd").new()
	var cond_eval_result: Dictionary = cond_eval_tests.run()
	_passed += cond_eval_result["passed"]
	_failed += cond_eval_result["failed"]
	_total += cond_eval_result["total"]

	var resolve_tests := preload("res://tests/test_on_resolve_condition.gd").new()
	var resolve_result: Dictionary = resolve_tests.run()
	_passed += resolve_result["passed"]
	_failed += resolve_result["failed"]
	_total += resolve_result["total"]

	print("\n━━━ Results ━━━")
	print("Total: %d | Passed: %d | Failed: %d" % [_total, _passed, _failed])
	if _failed > 0:
		print("FAIL")
	else:
		print("ALL PASSED")
	quit(_failed)

# ─── Helpers ──────────────────────────────────────────────────────────────

func _load_test_file(filename: String) -> Dictionary:
	var path: String = "res://../../tests/" + filename
	if not FileAccess.file_exists(path):
		path = "res://tests/" + filename
	if not FileAccess.file_exists(path):
		var base: String = ProjectSettings.globalize_path("res://")
		path = base.path_join("../../tests/" + filename)
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		var abs_path: String = ProjectSettings.globalize_path("res://").get_base_dir().get_base_dir().path_join("tests/" + filename)
		file = FileAccess.open(abs_path, FileAccess.READ)
	assert(file != null, "Cannot open test file: " + filename)
	var json_text: String = file.get_as_text()
	var json: Variant = JSON.parse_string(json_text)
	assert(json is Dictionary, "Failed to parse: " + filename)
	return json

func _execute_action(action: Variant, context: Variant, next_fn: Callable) -> void:
	if action == null:
		return
	match action.get("type", ""):
		"next":
			next_fn.call()
		"selectChoice":
			context.select_choice(action["choiceUuid"])
			next_fn.call()
		"resolve":
			context.resolve(action.get("value", true))
			next_fn.call()
		"resolveAction":
			context.resolve()
			next_fn.call()
		"rejectAction":
			context.reject(action.get("error", "test error"))
			next_fn.call()
		"resolveCharacterPort":
			var cname: String = action.get("characterName", action.get("name", ""))
			context.resolve_character_port(cname)
			next_fn.call()

func _assert_eq(actual: Variant, expected: Variant, msg: String) -> bool:
	if actual != expected:
		print("  FAIL: %s — expected %s, got %s" % [msg, str(expected), str(actual)])
		return false
	return true

func _assert_contains(arr: Array, value: Variant, msg: String) -> bool:
	if not arr.has(value):
		print("  FAIL: %s — %s not found in %s" % [msg, str(value), str(arr)])
		return false
	return true

# ─── Flow Tests ───────────────────────────────────────────────────────────

func _run_flow_tests(filename: String) -> void:
	var test_file: Dictionary = _load_test_file(filename)
	for suite in test_file.get("suites", []):
		for tc in suite.get("cases", []):
			_total += 1
			var display_name: String = "%s/%s" % [suite["id"], tc["id"]]
			var ok: bool = _run_single_flow_test(suite, tc, display_name)
			if ok:
				_passed += 1
				print("  PASS: %s" % display_name)
			else:
				_failed += 1

func _run_single_flow_test(suite: Dictionary, tc: Dictionary, display_name: String) -> bool:
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": suite["blueprint"]})
	if report["errors"].size() > 0:
		print("  FAIL: %s — init errors: %s" % [display_name, str(report["errors"])])
		return false

	engine.set_locale(suite.get("locale", "en"))

	# Install choice filter if the suite has condition config
	var bridge_config: Variant = suite.get("stateBridge")
	if bridge_config is Dictionary and bridge_config.has("conditions"):
		var conditions: Dictionary = bridge_config["conditions"]
		engine.set_choice_filter(func(cond: Dictionary) -> bool:
			var key: String = cond.get("key", "")
			if conditions.has(key):
				return conditions[key]
			return true
		)

	var steps: Array = tc.get("steps", [])
	var step_index: Array = [0]
	var cleanup_calls: Array = [0]

	# All 4 handlers are mandatory — register them all
	engine.on_dialog(func(args: Dictionary) -> Callable:
		return _handle_step("DIALOG", args, steps, step_index, cleanup_calls)
	)

	engine.on_choice(func(args: Dictionary) -> Callable:
		var step: Variant = steps[step_index[0]] if step_index[0] < steps.size() else null
		if step != null and step["expect"]["type"] == "CHOICE":
			var expect: Dictionary = step["expect"]
			var block: Dictionary = args["block"]
			if not expect.has("blockUuid") or expect["blockUuid"] == null or expect["blockUuid"] == block.get("uuid", ""):
				if expect.has("visibleChoiceCount") and expect["visibleChoiceCount"] != null:
					var visible_count: int = 0
					for c in args["context"].choices:
						if c.get("visible") != false:
							visible_count += 1
					if visible_count != expect["visibleChoiceCount"]:
						print("  FAIL: %s — visibleChoiceCount expected %d, got %d" % [display_name, expect["visibleChoiceCount"], visible_count])
		return _handle_step("CHOICE", args, steps, step_index, cleanup_calls)
	)

	engine.on_condition(func(args: Dictionary) -> Callable:
		return _handle_step("CONDITION", args, steps, step_index, cleanup_calls, suite)
	)

	engine.on_action(func(args: Dictionary) -> Callable:
		return _handle_step("ACTION", args, steps, step_index, cleanup_calls)
	)

	var handle: LsdeSceneHandle = engine.scene(suite["sceneId"])
	handle.start()

	var ok: bool = true

	if handle.is_running():
		print("  FAIL: %s — scene still running" % display_name)
		ok = false

	if tc.has("expectedVisited") and tc["expectedVisited"].size() > 0:
		var visited: Array = handle.get_visited_blocks()
		var expected: Array = tc["expectedVisited"]
		if tc.get("orderIndependent", false):
			var v_sorted: Array = visited.duplicate()
			v_sorted.sort()
			var e_sorted: Array = expected.duplicate()
			e_sorted.sort()
			if not _assert_eq(v_sorted, e_sorted, display_name + " visited (order-independent)"):
				ok = false
		else:
			if not _assert_eq(visited, expected, display_name + " visited"):
				ok = false

	if tc.has("expectedCleanupCalls") and tc["expectedCleanupCalls"] != null:
		if not _assert_eq(cleanup_calls[0], tc["expectedCleanupCalls"], display_name + " cleanupCalls"):
			ok = false

	return ok

func _handle_step(block_type: String, args: Dictionary, steps: Array, step_index: Array, cleanup_calls: Array, suite: Variant = null) -> Callable:
	var step: Variant = steps[step_index[0]] if step_index[0] < steps.size() else null
	var block: Dictionary = args["block"]
	var context: Variant = args["context"]
	var next_fn: Callable = args["next"]

	if step != null and step["expect"]["type"] == block_type:
		var expect_uuid: Variant = step["expect"].get("blockUuid")
		if expect_uuid == null or expect_uuid == block.get("uuid", ""):
			step_index[0] += 1
			_execute_action(step.get("action"), context, next_fn)
			return func() -> void: cleanup_calls[0] += 1

	# Not the expected step — auto-advance
	if block_type == "CONDITION":
		var raw_groups: Array = block.get("conditions", [])
		var evaluator: Callable = func(cond: Dictionary) -> bool:
			if suite is Dictionary and suite.has("stateBridge") and suite["stateBridge"] is Dictionary:
				var conditions: Dictionary = suite["stateBridge"].get("conditions", {})
				if conditions.has(cond.get("key", "")):
					return conditions[cond.get("key", "")]
			return true
		var group_result: Variant = LsdeConditionEvaluator.evaluate_condition_groups(raw_groups, evaluator)
		context.resolve(group_result)
	elif block_type == "ACTION":
		context.resolve()
	next_fn.call()
	# No cleanup for auto-advanced blocks
	return Callable()

# ─── Validation Tests ─────────────────────────────────────────────────────

func _run_validation_tests(filename: String) -> void:
	var test_file: Dictionary = _load_test_file(filename)
	for suite in test_file.get("suites", []):
		for tc in suite.get("cases", []):
			_total += 1
			var display_name: String = "%s/%s" % [suite["id"], tc["id"]]
			var ok: bool = _run_single_validation_test(suite, tc, display_name)
			if ok:
				_passed += 1
				print("  PASS: %s" % display_name)
			else:
				_failed += 1

func _run_single_validation_test(suite: Dictionary, tc: Dictionary, display_name: String) -> bool:
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": suite["blueprint"]})
	var ok: bool = true

	if tc.has("expectedErrors"):
		var error_codes: Array = []
		for e in report["errors"]:
			error_codes.append(e["code"])
		for code in tc["expectedErrors"]:
			if not _assert_contains(error_codes, code, display_name + " error"):
				ok = false
		if tc["expectedErrors"].size() == 0 and report["errors"].size() > 0:
			print("  FAIL: %s — expected 0 errors, got %d" % [display_name, report["errors"].size()])
			ok = false

	if tc.has("expectedWarnings"):
		var warning_codes: Array = []
		for w in report["warnings"]:
			warning_codes.append(w["code"])
		for code in tc["expectedWarnings"]:
			if not _assert_contains(warning_codes, code, display_name + " warning"):
				ok = false
		if tc["expectedWarnings"].size() == 0 and report["warnings"].size() > 0:
			print("  FAIL: %s — expected 0 warnings, got %d" % [display_name, report["warnings"].size()])
			ok = false

	if tc.has("expectedStats") and tc["expectedStats"] != null:
		var stats: Dictionary = report["stats"]
		var expected: Dictionary = tc["expectedStats"]
		if not _assert_eq(stats["sceneCount"], expected["sceneCount"], display_name + " sceneCount"):
			ok = false
		if not _assert_eq(stats["blockCount"], expected["blockCount"], display_name + " blockCount"):
			ok = false
		if not _assert_eq(stats["connectionCount"], expected["connectionCount"], display_name + " connectionCount"):
			ok = false

	return ok

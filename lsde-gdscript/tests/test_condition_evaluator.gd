## LSDE Dialog Engine — Unit tests for LsdeConditionEvaluator
## Port of condition-evaluator.test.ts
extends RefCounted

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

# ─── Helpers ──────────────────────────────────────────────────────────────

func _cond(key: String, chain: String = "") -> Dictionary:
	var d: Dictionary = {"uuid": key, "key": key, "operator": "=", "value": "true"}
	if chain != "":
		d["chain"] = chain
	return d

## Evaluator: returns true if key starts with 't', false otherwise.
func _evaluator(cond: Dictionary) -> bool:
	return cond.get("key", "").begins_with("t")

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

# ─── Run all tests ────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── ConditionEvaluator Unit Tests ──")
	_test_chain()
	_test_groups_switch()
	_test_groups_dispatcher()
	_test_filter_visible_choices()
	return {"passed": _passed, "failed": _failed, "total": _total}

# ─── evaluateConditionChain ──────────────────────────────────────────────

func _test_chain() -> void:
	var eval: Callable = _evaluator

	# Empty conditions → true
	_assert_true(
		LsdeConditionEvaluator.evaluate_condition_chain([], eval),
		"chain: empty → true")

	# Single condition
	_assert_true(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("true1")], eval),
		"chain: single true")
	_assert_false(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("false1")], eval),
		"chain: single false")

	# AND: true & true = true
	_assert_true(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("true1"), _cond("true2", "&")], eval),
		"chain: AND true & true")

	# AND: true & false = false
	_assert_false(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("true1"), _cond("false1", "&")], eval),
		"chain: AND true & false")

	# OR: false | true = true
	_assert_true(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("false1"), _cond("true1", "|")], eval),
		"chain: OR false | true")

	# OR: false | false = false
	_assert_false(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("false1"), _cond("false2", "|")], eval),
		"chain: OR false | false")

	# Left-to-right: (true AND false) OR true = true
	_assert_true(
		LsdeConditionEvaluator.evaluate_condition_chain(
			[_cond("true1"), _cond("false1", "&"), _cond("true2", "|")], eval),
		"chain: left-to-right (true&false)|true")

	# Default AND when chain undefined
	_assert_false(
		LsdeConditionEvaluator.evaluate_condition_chain([_cond("true1"), _cond("false1")], eval),
		"chain: default AND when chain undefined")

# ─── evaluateConditionGroups — switch mode ───────────────────────────────

func _test_groups_switch() -> void:
	var eval: Callable = _evaluator

	# Empty groups → -1
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([], eval),
		-1, "switch: empty → -1")

	# Single group match → 0
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("true1")]], eval),
		0, "switch: single match → 0")

	# Single group no match → -1
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("false1")]], eval),
		-1, "switch: single no match → -1")

	# First of 2 matches → 0
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("true1")], [_cond("true2")]], eval),
		0, "switch: first of 2 → 0")

	# Second of 2 matches → 1
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("false1")], [_cond("true1")]], eval),
		1, "switch: second of 2 → 1")

	# None match → -1
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("false1")], [_cond("false2")]], eval),
		-1, "switch: none → -1")

	# Evaluates chains within groups: Group 0: false&true→false, Group 1: true→true → 1
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups(
			[[_cond("false1"), _cond("true1", "&")], [_cond("true2")]], eval),
		1, "switch: chains within groups → 1")

# ─── evaluateConditionGroups — dispatcher mode ──────────────────────────

func _test_groups_dispatcher() -> void:
	var eval: Callable = _evaluator

	# Empty → []
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([], eval, true),
		[], "dispatcher: empty → []")

	# Both match → [0, 1]
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("true1")], [_cond("true2")]], eval, true),
		[0, 1], "dispatcher: both → [0,1]")

	# None match → []
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("false1")], [_cond("false2")]], eval, true),
		[], "dispatcher: none → []")

	# Partial: 1st+3rd of 3 → [0, 2]
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups(
			[[_cond("true1")], [_cond("false1")], [_cond("true2")]], eval, true),
		[0, 2], "dispatcher: partial → [0,2]")

	# Single match → [0]
	_assert_eq(
		LsdeConditionEvaluator.evaluate_condition_groups([[_cond("true1")]], eval, true),
		[0], "dispatcher: single → [0]")

# ─── filterVisibleChoices ────────────────────────────────────────────────

func _test_filter_visible_choices() -> void:
	var eval: Callable = _evaluator

	# No visibilityConditions → kept
	var choices1: Array = [
		{"uuid": "c1", "structureKey": "c1"},
		{"uuid": "c2", "structureKey": "c2"},
	]
	_assert_eq(
		LsdeConditionEvaluator.filter_visible_choices(choices1, eval).size(),
		2, "filter: no conditions → kept")

	# Empty visibilityConditions → kept
	var choices2: Array = [{"uuid": "c1", "structureKey": "c1", "visibilityConditions": []}]
	_assert_eq(
		LsdeConditionEvaluator.filter_visible_choices(choices2, eval).size(),
		1, "filter: empty conditions → kept")

	# Filters out failing conditions
	var choices3: Array = [
		{"uuid": "visible", "structureKey": "v", "visibilityConditions": [_cond("true1")]},
		{"uuid": "hidden", "structureKey": "h", "visibilityConditions": [_cond("false1")]},
	]
	var visible: Array = LsdeConditionEvaluator.filter_visible_choices(choices3, eval)
	_assert_eq(visible.size(), 1, "filter: failing filtered out (count)")
	if visible.size() > 0:
		_assert_eq(visible[0]["uuid"], "visible", "filter: correct choice kept")

	# Evaluates chained conditions: false OR true = true → kept
	var choices4: Array = [
		{"uuid": "c1", "structureKey": "c1", "visibilityConditions": [_cond("false1"), _cond("true1", "|")]},
	]
	_assert_eq(
		LsdeConditionEvaluator.filter_visible_choices(choices4, eval).size(),
		1, "filter: chained conditions evaluated")

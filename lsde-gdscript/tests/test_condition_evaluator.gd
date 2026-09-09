## LSDE Dialog Engine — Condition evaluation (port of condition-evaluator.test.ts)
##
## The engine assembles answers, it never compares. Every test below feeds a fake evaluator and
## checks how the answers are combined — which is the whole of what this module owns.
extends RefCounted

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

# ─── Helpers ──────────────────────────────────────────────────────────────

## A test whose truth is written into its `entry`, so a case reads like what it asserts.
func _t(entry: String, join: String = "") -> Dictionary:
	var test: Dictionary = {
		"dict": "switches", "entry": entry,
		"op": LsdeTypes.OP_EQUALS, "value": true,
	}
	if join != "":
		test["join"] = join
	return test

## Answers by what the test asks for, so the chain logic is what is under test.
func _answer(test: Dictionary) -> bool:
	return test.get("entry", "").begins_with("T")

func _case(port: String, when: Variant = null) -> Dictionary:
	var c: Dictionary = {"port": port}
	if when != null:
		c["when"] = when
	return c

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

# ─── Chaining tests inside a case ─────────────────────────────────────────

func _test_no_tests_is_true() -> void:
	# This is how "always" is written in v2 — by the ABSENCE of `when`.
	_assert_true(LsdeConditionEvaluator.evaluate_condition_chain(null, _answer),
		"absent when is true")
	_assert_true(LsdeConditionEvaluator.evaluate_condition_chain([], _answer),
		"empty when is true")

func _test_single_test_stands_alone() -> void:
	_assert_true(LsdeConditionEvaluator.evaluate_condition_chain([_t("T1")], _answer), "T is true")
	_assert_false(LsdeConditionEvaluator.evaluate_condition_chain([_t("F1")], _answer), "F is false")

func _test_joins_with_and_by_default() -> void:
	_assert_true(LsdeConditionEvaluator.evaluate_condition_chain([_t("T1"), _t("T2")], _answer),
		"T and T")
	_assert_false(LsdeConditionEvaluator.evaluate_condition_chain([_t("T1"), _t("F1")], _answer),
		"T and F")

func _test_joins_with_or() -> void:
	_assert_true(LsdeConditionEvaluator.evaluate_condition_chain(
		[_t("F1"), _t("T1", LsdeTypes.JOIN_OR)], _answer), "F or T")
	_assert_false(LsdeConditionEvaluator.evaluate_condition_chain(
		[_t("F1"), _t("F2", LsdeTypes.JOIN_OR)], _answer), "F or F")

func _test_reads_left_to_right_with_no_precedence() -> void:
	# F AND T OR T → (F AND T) OR T = true.
	# With AND binding tighter it would be F AND (T OR T) = false. It does not.
	_assert_true(LsdeConditionEvaluator.evaluate_condition_chain(
		[_t("F1"), _t("T1", LsdeTypes.JOIN_AND), _t("T2", LsdeTypes.JOIN_OR)], _answer),
		"(F and T) or T")

	# T OR F AND F → (T OR F) AND F = false.
	_assert_false(LsdeConditionEvaluator.evaluate_condition_chain(
		[_t("T1"), _t("F1", LsdeTypes.JOIN_OR), _t("F2", LsdeTypes.JOIN_AND)], _answer),
		"(T or F) and F")

func _test_evaluates_every_test() -> void:
	# No short-circuit: the game's evaluator is also where a project logs and counts.
	var calls: Array = [0]
	var counting: Callable = func(test: Dictionary) -> bool:
		calls[0] += 1
		return _answer(test)

	LsdeConditionEvaluator.evaluate_condition_chain(
		[_t("F1"), _t("T1", LsdeTypes.JOIN_AND), _t("T2", LsdeTypes.JOIN_AND)], counting)

	_assert_eq(calls[0], 3, "every test evaluated, no short-circuit")

# ─── Picking a port ───────────────────────────────────────────────────────

func _test_if_mode_requires_every_case() -> void:
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases(
		[_case("out", [_t("T1")]), _case("out", [_t("T2")])], false, _answer),
		LsdeTypes.PORT_OUT, "if mode: all hold → out")
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases(
		[_case("out", [_t("T1")]), _case("out", [_t("F1")])], false, _answer),
		LsdeTypes.PORT_DEFAULT, "if mode: one fails → default")

func _test_no_cases_leaves_by_out() -> void:
	# Nothing was asked, so nothing failed.
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases([], false, _answer),
		LsdeTypes.PORT_OUT, "no cases → out")

func _test_switch_mode_takes_first_holding_case() -> void:
	var cases: Array = [
		_case("K1", [_t("F1")]),
		_case("K2", [_t("T1")]),
		_case("K3", [_t("T2")]),
	]
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases(cases, true, _answer),
		"K2", "switch mode: first holding case")

func _test_switch_mode_takes_default_when_none_holds() -> void:
	var cases: Array = [_case("K1", [_t("F1")]), _case("K2", [_t("F2")])]
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases(cases, true, _answer),
		LsdeTypes.PORT_DEFAULT, "switch mode: none holds → default")

func _test_catch_all_shadows_everything_below() -> void:
	# The reference export does exactly this: COND-001 K3 has no comparison at all.
	var cases: Array = [_case("K1", [_t("F1")]), _case("K2"), _case("K3", [_t("T1")])]
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases(cases, true, _answer),
		"K2", "a case with no when shadows the ones below")

func _test_switch_mode_stops_asking_once_a_case_holds() -> void:
	# Unlike the chain inside a case, cases DO short-circuit.
	var calls: Array = [0]
	var counting: Callable = func(test: Dictionary) -> bool:
		calls[0] += 1
		return _answer(test)

	LsdeConditionEvaluator.evaluate_condition_cases(
		[_case("K1", [_t("F1")]), _case("K2", [_t("T1")]), _case("K3", [_t("T2")])], true, counting)

	_assert_eq(calls[0], 2, "cases short-circuit")

func _test_the_dispatcher_is_gone() -> void:
	# v1 had a third mode firing EVERY matching case at once. Nothing here can produce it.
	var all_true: Array = [_case("K1", [_t("T1")]), _case("K2", [_t("T2")]), _case("K3", [_t("T3")])]
	_assert_eq(LsdeConditionEvaluator.evaluate_condition_cases(all_true, true, _answer),
		"K1", "one port, never several")

	# The need it served is covered: read the results, then use isAsync where it shows.
	_assert_eq(LsdeConditionEvaluator.evaluate_each_case(
		[_case("K1", [_t("T1")]), _case("K2", [_t("F1")]), _case("K3")], _answer),
		[true, false, true], "every case still readable")

# ─── Tagging options ──────────────────────────────────────────────────────

func _test_hands_back_every_option_tagged() -> void:
	var options: Array = [
		{"id": "C1", "key": "k1"},
		{"id": "C2", "key": "k2", "when": [_t("T1")]},
		{"id": "C3", "key": "k3", "when": [_t("F1")]},
	]
	var tagged: Array = LsdeConditionEvaluator.tag_option_visibility(options, _answer)

	_assert_eq(tagged.size(), 3, "every option handed back")
	_assert_eq(tagged[0].get("visible"), true, "no when → offered")
	_assert_eq(tagged[1].get("visible"), true, "when holds → offered")
	_assert_eq(tagged[2].get("visible"), false, "when fails → hidden")

func _test_leaves_visible_absent_with_no_evaluator() -> void:
	# Unknown, not hidden. Saying false about a question nobody could answer would HIDE an answer.
	var tagged: Array = LsdeConditionEvaluator.tag_option_visibility(
		[{"id": "C1", "key": "k1", "when": [_t("T1")]}], null)

	_assert_eq(tagged.size(), 1, "option still handed back")
	_assert_false(tagged[0].has("visible"), "no resolver → visible unset")

# ─── The router's reading of the same cases ───────────────────────────────

func _test_router_every_true_case_then_then_when_all_held() -> void:
	var cases: Array = [_case("K1"), _case("K2"), _case("K3")]
	_assert_eq(LsdeConditionEvaluator.pick_router_ports(cases, [true, true, true]),
		["K1", "K2", "K3", "then"], "every case, then then")

func _test_router_no_break_a_false_case_hides_nothing() -> void:
	var cases: Array = [_case("K1"), _case("K2"), _case("K3")]
	_assert_eq(LsdeConditionEvaluator.pick_router_ports(cases, [true, false, true]),
		["K1", "K3", "catch"], "K3 still counted after a false K2, exit is catch")
	_assert_eq(LsdeConditionEvaluator.pick_router_ports(cases, [false, false, false]),
		["catch"], "nothing held → catch alone")

func _test_router_no_cases_at_all_is_then() -> void:
	_assert_eq(LsdeConditionEvaluator.pick_router_ports([], []), ["then"],
		"the empty tally is then, like Promise.all of nothing")

# ─── The reserved choice dictionary ───────────────────────────────────────

func _test_recognises_a_choice_test() -> void:
	_assert_true(LsdeConditionEvaluator.is_choice_test(
		{"dict": "choice", "entry": "CHOICE-001", "op": "equals", "value": "C1"}),
		"choice dictionary recognised")
	_assert_false(LsdeConditionEvaluator.is_choice_test(_t("T1")),
		"a project dictionary is not a choice test")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Condition Evaluator Tests ──")
	_test_no_tests_is_true()
	_test_single_test_stands_alone()
	_test_joins_with_and_by_default()
	_test_joins_with_or()
	_test_reads_left_to_right_with_no_precedence()
	_test_evaluates_every_test()
	_test_if_mode_requires_every_case()
	_test_no_cases_leaves_by_out()
	_test_switch_mode_takes_first_holding_case()
	_test_switch_mode_takes_default_when_none_holds()
	_test_catch_all_shadows_everything_below()
	_test_switch_mode_stops_asking_once_a_case_holds()
	_test_the_dispatcher_is_gone()
	_test_router_every_true_case_then_then_when_all_held()
	_test_router_no_break_a_false_case_hides_nothing()
	_test_router_no_cases_at_all_is_then()
	_test_hands_back_every_option_tagged()
	_test_leaves_visible_absent_with_no_evaluator()
	_test_recognises_a_choice_test()
	return {"passed": _passed, "failed": _failed, "total": _total}

## LSDE Dialog Engine — Condition evaluation
##
## The engine never compares anything itself. It does not read a dictionary, does not know what
## "credits" holds, does not implement greaterOrEqual. It hands each test to the game's
## on_resolve_condition and only assembles the answers — which is why the v2 operator set going
## from a free string to six closed values changed nothing here.
##
## v2 replaced the 2D condition array with a flat list of cases that each carry their own port, so
## there is no index to derive any more. It also dropped the dispatcher mode entirely: a switch
## picks ONE path, a dispatcher took them all, and having both behind a checkbox on the same block
## meant a writer read three wires leaving a condition as a choice when it was three simultaneous
## launches. isAsync already covers that need, on any block, visibly.
class_name LsdeConditionEvaluator
extends RefCounted

## Evaluate a chain of tests left to right, [b]with no operator precedence[/b].
##
## "a AND b OR c" reads as "(a AND b) OR c", never as "a AND (b OR c)". That is deliberate: the
## editor draws a flat list, so the engine evaluates a flat list. A writer who needs grouping uses
## two condition blocks in a row, which is also what the reader of the graph sees.
##
## [code]join[/code] links a test to the one ABOVE it and is absent on the first. Missing means AND.
##
## [b]Every test is evaluated, even once the answer is settled.[/b] No short-circuit: the game's
## evaluator is also where a project logs, counts or displays what was asked, and skipping calls
## would make that log depend on the order the writer happened to use.
##
## No tests at all = true. That is how "always" is written in v2 — by the ABSENCE of `when`.
static func evaluate_condition_chain(tests: Variant, evaluator: Callable) -> bool:
	if tests == null:
		return true
	var list: Array = tests
	if list.size() == 0:
		return true

	var result: bool = evaluator.call(list[0])

	for i in range(1, list.size()):
		var test: Dictionary = list[i]
		var current: bool = evaluator.call(test)
		if test.get("join", "") == LsdeTypes.JOIN_OR:
			result = result or current
		else:
			result = result and current

	return result

## Pick the exit port of a condition block. There are two modes and only two.
##
## [codeblock]
##   portPerCase absent : every case must hold — "out" if they all do, "default" otherwise
##   portPerCase true   : the first case that holds takes its own port (K1…), "default" if none
## [/codeblock]
##
## A case with no [code]when[/code] is always true, and makes every case below it unreachable in
## portPerCase mode. That is the writer's drawing, not an error to report.
##
## A block with no cases at all leaves by "out": nothing was asked, so nothing failed.
static func evaluate_condition_cases(cases: Array, port_per_case: bool, evaluator: Callable) -> String:
	if cases.size() == 0:
		return LsdeTypes.PORT_OUT

	if port_per_case:
		for condition_case in cases:
			if evaluate_condition_chain(condition_case.get("when"), evaluator):
				# get("port", "") and NOT a fallback to "out": a case with no port is a malformed
				# payload, and the other three runtimes route it nowhere. Answering "out" here made
				# Godot alone follow a wire the others ignored.
				return condition_case.get("port", "")
		return LsdeTypes.PORT_DEFAULT

	# if mode: the cases share one exit, so they all have to hold to take it.
	for condition_case in cases:
		if not evaluate_condition_chain(condition_case.get("when"), evaluator):
			return LsdeTypes.PORT_DEFAULT
	return LsdeTypes.PORT_OUT

## Pick the exit port from case results that were ALREADY computed.
##
## Same rules as evaluate_condition_cases, same answer - it just does not ask again.
##
## The engine needs both halves for every condition block: a result per case, so the handler is
## handed answers rather than questions, and the port to leave by. Calling the two in a row asked
## the game's evaluator about the same test twice, and how many times depended on the mode and on
## which case matched - which broke the one promise this file makes, that a project can count and
## log what it was asked.
static func pick_port_from_results(cases: Array, port_per_case: bool, results: Array) -> String:
	if cases.size() == 0:
		return LsdeTypes.PORT_OUT

	if port_per_case:
		for i in range(cases.size()):
			if i < results.size() and results[i]:
				return cases[i].get("port", "")
		return LsdeTypes.PORT_DEFAULT

	# if mode: the cases share one exit, so they all have to hold to take it.
	for i in range(cases.size()):
		if i >= results.size() or not results[i]:
			return LsdeTypes.PORT_DEFAULT
	return LsdeTypes.PORT_OUT


## Evaluate every case on its own, without picking a port.
##
## Handed to a game that wants to show what matched without changing where the flow goes. The
## engine fills [code]cases[i].result[/code] with the same rule, then reads the exit port off those
## results with pick_port_from_results — never by calling this and deciding for itself.
static func evaluate_each_case(cases: Array, evaluator: Callable) -> Array:
	var results: Array = []
	for condition_case in cases:
		results.append(evaluate_condition_chain(condition_case.get("when"), evaluator))
	return results

## Tag every option of a choice with whether its [code]when[/code] holds.
##
## The engine hands over [b]all[/b] the options, tagged — never a shortened list. A game that wants
## only the offered ones filters on [code]visible != false[/code]; a game that wants to grey out
## the others, or show "[locked]", still has them. Filtering here would take that away.
##
## [code]visible[/code] is left absent when no evaluator is given: unknown, not hidden.
static func tag_option_visibility(options: Array, evaluator: Variant) -> Array:
	var tagged: Array = []
	for option in options:
		var item: Dictionary = option.duplicate(true)
		if evaluator != null:
			item["visible"] = evaluate_condition_chain(option.get("when"), evaluator)
		tagged.append(item)
	return tagged

## Is this test about what the player already answered, rather than about game state?
##
## "choice" is a reserved dictionary id — no project dictionary may take it. [code]entry[/code] is
## a CHOICE block id of this scene and [code]value[/code] an option id of that block. The engine
## answers these from the history it kept during the scene, so they never reach the game's
## evaluator: a game does not have to remember what it already told the engine.
static func is_choice_test(test: Dictionary) -> bool:
	return test.get("dict", "") == LsdeTypes.DICT_CHOICE

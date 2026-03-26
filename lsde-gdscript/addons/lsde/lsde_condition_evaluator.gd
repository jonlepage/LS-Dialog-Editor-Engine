## LSDE Dialog Engine — Condition chain evaluation (AND/OR)
class_name LsdeConditionEvaluator
extends RefCounted

## Evaluate a chain of conditions left-to-right with no operator precedence.
## Empty array returns true (no conditions = pass).
## First condition: standalone result. Subsequent: '&' = AND, '|' = OR with accumulated result.
## This means A AND B OR C evaluates as (A AND B) OR C, not A AND (B OR C).
static func evaluate_condition_chain(conditions: Array, evaluator: Callable) -> bool:
	if conditions.size() == 0:
		return true
	var result: bool = evaluator.call(conditions[0])
	for i in range(1, conditions.size()):
		var cond: Dictionary = conditions[i]
		var current: bool = evaluator.call(cond)
		if cond.get("chain", "") == "|":
			result = result or current
		else:
			result = result and current
	return result

## Filter choices by their visibilityConditions.
## Choices with no conditions are always visible.
## When scene is provided, choice: conditions are resolved automatically via the scene's
## internal choice history — the developer never sees them. Only non-choice conditions
## are delegated to the evaluator callback.
static func filter_visible_choices(choices: Array, evaluator: Callable, scene: Variant = null) -> Array:
	var result: Array = []
	for choice in choices:
		var vis_conds: Array = choice.get("visibilityConditions", [])
		if vis_conds.size() == 0:
			result.append(choice)
		elif evaluate_condition_chain(vis_conds, func(cond: Dictionary) -> bool:
			if scene != null and cond.get("key", "").begins_with("choice:"):
				return scene.evaluate_condition(cond)
			return evaluator.call(cond)
		):
			result.append(choice)
	return result

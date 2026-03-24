## LSDE Dialog Engine — Condition chain evaluation (AND/OR)
class_name LsdeConditionEvaluator
extends RefCounted

## Evaluate a chain of conditions left-to-right with no operator precedence.
## Empty array returns true (no conditions = pass).
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
static func filter_visible_choices(choices: Array, evaluator: Callable) -> Array:
	var result: Array = []
	for choice in choices:
		var vis_conds: Array = choice.get("visibilityConditions", [])
		if vis_conds.size() == 0 or evaluate_condition_chain(vis_conds, evaluator):
			result.append(choice)
	return result

## LSDE Dialog Engine — Context factory per block type
class_name LsdeBlockContext
extends RefCounted

class DialogContext extends RefCounted:
	var global_prevented: bool = false
	var character_port_index: Variant = null  # int or null
	var character: Variant = null  # Dictionary or null
	var _characters: Array = []

	func _init(block: Dictionary) -> void:
		character = LsdeUtils.get_first_character(block)
		var metadata: Variant = block.get("metadata")
		if metadata is Dictionary:
			_characters = metadata.get("characters", [])

	func resolve_character_port(character_name: String) -> void:
		for i in range(_characters.size()):
			if _characters[i].get("name", "") == character_name:
				character_port_index = i
				return
		character_port_index = null

	func prevent_global_handler() -> void:
		global_prevented = true

class ChoiceContext extends RefCounted:
	var global_prevented: bool = false
	var selected_choice_uuid: Variant = null  # String or null
	var choices: Array = []

	func _init(visible_choices: Array) -> void:
		choices = visible_choices

	func select_choice(choice_uuid: String) -> void:
		selected_choice_uuid = choice_uuid

	func prevent_global_handler() -> void:
		global_prevented = true

class ConditionContext extends RefCounted:
	var global_prevented: bool = false
	var condition_result: Variant = null  # bool or null

	func resolve(result: bool) -> void:
		condition_result = result

	func prevent_global_handler() -> void:
		global_prevented = true

class ActionContext extends RefCounted:
	var global_prevented: bool = false
	var action_rejected: bool = false

	func resolve() -> void:
		action_rejected = false

	func reject(_error: Variant = "") -> void:
		action_rejected = true

	func prevent_global_handler() -> void:
		global_prevented = true

## Factory functions
static func create_dialog_context(block: Dictionary) -> DialogContext:
	return DialogContext.new(block)

static func create_choice_context(block: Dictionary, evaluator: Callable) -> ChoiceContext:
	var choices: Array = block.get("choices", [])
	var visible: Array = LsdeConditionEvaluator.filter_visible_choices(choices, evaluator)
	return ChoiceContext.new(visible)

static func create_condition_context() -> ConditionContext:
	return ConditionContext.new()

static func create_action_context() -> ActionContext:
	return ActionContext.new()

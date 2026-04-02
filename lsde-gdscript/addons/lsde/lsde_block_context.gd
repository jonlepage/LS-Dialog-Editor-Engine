## LSDE Dialog Engine — Context factory per block type
class_name LsdeBlockContext
extends RefCounted

## Context for DIALOG block handlers.
## Exposes character resolution and port selection for portPerCharacter mode.
class DialogContext extends RefCounted:
	## When true, the global (Tier 1) handler will be skipped.
	var global_prevented: bool = false
	## Character port index selected via resolve_character_port(), or null if not set.
	var character_port_index: Variant = null  # int or null
	## Character resolved by on_resolve_character for this block, or null if none.
	var character: Variant = null  # Dictionary or null
	var _characters: Array = []

	func _init(block: Dictionary, resolved_character: Variant) -> void:
		character = resolved_character
		var metadata: Variant = block.get("metadata")
		if metadata is Dictionary:
			_characters = metadata.get("characters", [])

	## Resolve which character port to follow. Matches by UUID first, then by name as fallback.
	func resolve_character_port(character_uuid: String) -> void:
		# Match by uuid first
		for i in range(_characters.size()):
			if _characters[i].get("uuid", "") == character_uuid:
				character_port_index = i
				return
		# Fallback: match by name
		for i in range(_characters.size()):
			if _characters[i].get("name", "") == character_uuid:
				character_port_index = i
				return
		character_port_index = null

	## Prevent the global (Tier 1) handler from executing after this scene handler.
	func prevent_global_handler() -> void:
		global_prevented = true

## Context for CHOICE block handlers.
## Holds the tagged choices (with visible field) and tracks the player's selection.
class ChoiceContext extends RefCounted:
	## When true, the global (Tier 1) handler will be skipped.
	var global_prevented: bool = false
	## UUID of the selected choice, set by select_choice().
	var selected_choice_uuid: Variant = null  # String or null
	## All choices with optional visibility tags (each has a "visible" key when filter is installed).
	var choices: Array = []
	## Character resolved by on_resolve_character for this block, or null if none.
	var character: Variant = null
	var _block_uuid: String = ""
	var _on_choice_selected: Callable

	func _init(tagged_choices: Array, resolved_character: Variant, block_uuid: String, on_choice_selected: Callable = Callable()) -> void:
		choices = tagged_choices
		character = resolved_character
		_block_uuid = block_uuid
		_on_choice_selected = on_choice_selected

	## Select a choice by UUID. Records in choice history for condition evaluation.
	func select_choice(choice_uuid: String) -> void:
		selected_choice_uuid = choice_uuid
		if _on_choice_selected.is_valid():
			_on_choice_selected.call(_block_uuid, choice_uuid)

	## Prevent the global (Tier 1) handler from executing after this scene handler.
	func prevent_global_handler() -> void:
		global_prevented = true

## Context for CONDITION block handlers.
## Stores the evaluation result set by resolve().
class ConditionContext extends RefCounted:
	## When true, the global (Tier 1) handler will be skipped.
	var global_prevented: bool = false
	## Condition result set by resolve(). bool (legacy), int (switch), or Array (dispatcher).
	var condition_result: Variant = null
	## Pre-evaluated condition groups with port_index and result fields (when resolver is installed).
	var condition_groups: Array = []
	## Character resolved by on_resolve_character for this block, or null if none.
	var character: Variant = null

	func _init(resolved_character: Variant = null, groups: Array = []) -> void:
		character = resolved_character
		condition_groups = groups

	## Resolve the condition. Accepts bool (legacy), int (switch), or Array of int (dispatcher).
	func resolve(result: Variant) -> void:
		condition_result = result

	## Prevent the global (Tier 1) handler from executing after this scene handler.
	func prevent_global_handler() -> void:
		global_prevented = true

## Context for ACTION block handlers.
## Tracks whether the action was resolved (success) or rejected (failure).
class ActionContext extends RefCounted:
	## When true, the global (Tier 1) handler will be skipped.
	var global_prevented: bool = false
	## true if reject() was called, false if resolve() was called.
	var action_rejected: bool = false
	## Character resolved by on_resolve_character for this block, or null if none.
	var character: Variant = null

	func _init(resolved_character: Variant = null) -> void:
		character = resolved_character

	## Mark action as succeeded. Engine follows the "then" port.
	func resolve() -> void:
		action_rejected = false

	## Mark action as failed. Engine follows the "catch" port (fallback "then" if no catch port exists).
	func reject(_error: Variant = "") -> void:
		action_rejected = true

	## Prevent the global (Tier 1) handler from executing after this scene handler.
	func prevent_global_handler() -> void:
		global_prevented = true

# ─── Factory functions ───────────────────────────────────────────────────────

## Create a dialog context with character resolution from block metadata.
static func create_dialog_context(block: Dictionary, resolved_character: Variant) -> DialogContext:
	return DialogContext.new(block, resolved_character)

## Create a choice context with pre-tagged choices (from tag_choice_visibility).
static func create_choice_context(block: Dictionary, tagged_choices: Array, resolved_character: Variant, on_choice_selected: Callable = Callable()) -> ChoiceContext:
	return ChoiceContext.new(tagged_choices, resolved_character, block.get("uuid", ""), on_choice_selected)

## Create a condition context with optional pre-evaluated groups.
static func create_condition_context(resolved_character: Variant = null, groups: Array = []) -> ConditionContext:
	return ConditionContext.new(resolved_character, groups)

## Create an action context.
static func create_action_context(resolved_character: Variant = null) -> ActionContext:
	return ActionContext.new(resolved_character)

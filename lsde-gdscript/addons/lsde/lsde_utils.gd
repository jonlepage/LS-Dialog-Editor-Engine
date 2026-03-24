## LSDE Dialog Engine — Shared helpers
class_name LsdeUtils
extends RefCounted

static func is_dialog_block(block: Dictionary) -> bool:
	return block.get("type", "") == "DIALOG"

static func is_choice_block(block: Dictionary) -> bool:
	return block.get("type", "") == "CHOICE"

static func is_condition_block(block: Dictionary) -> bool:
	return block.get("type", "") == "CONDITION"

static func is_action_block(block: Dictionary) -> bool:
	return block.get("type", "") == "ACTION"

static func is_note_block(block: Dictionary) -> bool:
	return block.get("type", "") == "NOTE"

static func get_first_character(block: Dictionary) -> Variant:
	var metadata: Variant = block.get("metadata")
	if metadata is Dictionary:
		var characters: Variant = metadata.get("characters")
		if characters is Array and characters.size() > 0:
			return characters[0]
	return null

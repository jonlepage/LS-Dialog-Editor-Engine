## LSDE Dialog Engine — StateBridge base class (override methods in your game)
class_name LsdeStateBridge
extends RefCounted

func evaluate_condition(condition: Dictionary) -> bool:
	return true

func execute_action(action: Dictionary, signature: Variant = null) -> void:
	pass

func resolve_dictionary(group_label: String, row_key: String) -> Variant:
	return ""

## LSDE Dialog Engine — Port resolution (critical algorithm)
## Must be identical across all runtimes.
class_name LsdePortResolver
extends RefCounted

static func resolve_port(input: Dictionary) -> Array:
	var block: Dictionary = input.get("block", {})
	var connections: Array = input.get("connections", [])
	var block_type: String = block.get("type", "")

	match block_type:
		"DIALOG":
			return _resolve_dialog_port(connections, input.get("characterPortIndex"))
		"CHOICE":
			return _resolve_choice_port(connections, input.get("selectedChoiceUuid"))
		"CONDITION":
			return _resolve_condition_port(connections, input.get("conditionResult"))
		"ACTION":
			return _resolve_action_port(connections, input.get("actionRejected"))
		"NOTE":
			return connections.duplicate()
	return []

static func _resolve_dialog_port(connections: Array, character_port_index: Variant) -> Array:
	if character_port_index != null:
		var matches: Array = []
		for c in connections:
			if c.get("fromPortIndex") == character_port_index:
				matches.append(c)
		if matches.size() > 0:
			return matches
	return _filter_by_from_port(connections, "out")

static func _resolve_choice_port(connections: Array, selected_choice_uuid: Variant) -> Array:
	if selected_choice_uuid == null:
		return []
	return _filter_by_from_port(connections, selected_choice_uuid)

static func _resolve_condition_port(connections: Array, condition_result: Variant) -> Array:
	if condition_result == null:
		return []
	var target_index: int = 0 if condition_result else 1
	var matches: Array = []
	for c in connections:
		if c.get("fromPortIndex") == target_index:
			matches.append(c)
	return matches

static func _resolve_action_port(connections: Array, action_rejected: Variant) -> Array:
	if action_rejected == true:
		var catch_ports: Array = []
		for c in connections:
			if c.get("fromPort", "") == "catch":
				catch_ports.append(c)
		if catch_ports.size() > 0:
			return catch_ports
	return _filter_by_from_port(connections, "then")

static func _filter_by_from_port(connections: Array, port: String) -> Array:
	var matches: Array = []
	for c in connections:
		if c.get("fromPort", "") == port:
			matches.append(c)
	return matches

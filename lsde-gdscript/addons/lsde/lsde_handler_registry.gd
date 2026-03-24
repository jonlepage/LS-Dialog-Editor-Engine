## LSDE Dialog Engine — Handler registration + Tier 1/Tier 2 resolution
class_name LsdeHandlerRegistry
extends RefCounted

# Tier 1 — Global
var dialog_handler: Callable
var choice_handler: Callable
var condition_handler: Callable
var action_handler: Callable
var scene_enter_handler: Callable
var scene_exit_handler: Callable
var validate_next_block_handler: Callable
var invalidate_block_handler: Callable
var before_block_handler: Callable

func get_type_handler(block_type: String) -> Callable:
	match block_type:
		"DIALOG": return dialog_handler
		"CHOICE": return choice_handler
		"CONDITION": return condition_handler
		"ACTION": return action_handler
	return Callable()

# Tier 2 — Per-Scene
class SceneRegistry extends RefCounted:
	var dialog_handler: Callable
	var choice_handler: Callable
	var condition_handler: Callable
	var action_handler: Callable
	var enter_handler: Callable
	var exit_handler: Callable
	var _block_handlers: Dictionary = {}

	func set_block_handler(block_uuid: String, handler: Callable) -> void:
		_block_handlers[block_uuid] = handler

	func get_block_handler(block_uuid: String) -> Callable:
		return _block_handlers.get(block_uuid, Callable())

	func get_type_handler(block_type: String) -> Callable:
		match block_type:
			"DIALOG": return dialog_handler
			"CHOICE": return choice_handler
			"CONDITION": return condition_handler
			"ACTION": return action_handler
		return Callable()

## Resolve which handlers to call. Priority: onBlock(uuid) > scene.onType > engine.onType
static func resolve_handler(block_type: String, block_uuid: String, scene_registry: Variant, global_registry: LsdeHandlerRegistry) -> Dictionary:
	var global_handler: Callable = global_registry.get_type_handler(block_type)

	if scene_registry == null:
		return {"scene_handler": Callable(), "global_handler": global_handler}

	var block_override: Callable = scene_registry.get_block_handler(block_uuid)
	if block_override.is_valid():
		return {"scene_handler": block_override, "global_handler": global_handler}

	var scene_type_handler: Callable = scene_registry.get_type_handler(block_type)
	if scene_type_handler.is_valid():
		return {"scene_handler": scene_type_handler, "global_handler": global_handler}

	return {"scene_handler": Callable(), "global_handler": global_handler}

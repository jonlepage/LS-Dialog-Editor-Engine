## LSDE Dialog Engine — Graph indexing and lookups
class_name LsdeGraph
extends RefCounted

## Indexed representation of a single scene
class SceneGraph extends RefCounted:
	var _scene: Dictionary
	var _blocks_by_uuid: Dictionary = {}
	var _connections_by_from_id: Dictionary = {}

	func _init(scene: Dictionary) -> void:
		_scene = scene
		for block in scene.get("blocks", []):
			_blocks_by_uuid[block.get("uuid", "")] = block
		for conn in scene.get("connections", []):
			var from_id: String = conn.get("fromId", "")
			if not _connections_by_from_id.has(from_id):
				_connections_by_from_id[from_id] = []
			_connections_by_from_id[from_id].append(conn)

	func get_block(uuid: String) -> Variant:
		return _blocks_by_uuid.get(uuid)

	func get_outgoing_connections(block_uuid: String) -> Array:
		return _connections_by_from_id.get(block_uuid, [])

	func get_start_block() -> Variant:
		for block in _scene.get("blocks", []):
			if block.get("isStartBlock", false):
				return block
		var entry_id: Variant = _scene.get("entryBlockId")
		if entry_id is String and entry_id != "":
			return _blocks_by_uuid.get(entry_id)
		return null

	func get_scene() -> Dictionary:
		return _scene

## Indexed representation of an entire blueprint export
var _scene_graphs: Dictionary = {}
var _signatures_by_id: Dictionary = {}
var _dictionaries_by_label: Dictionary = {}
var _data: Dictionary

func _init(data: Dictionary) -> void:
	_data = data
	for scene in data.get("scenes", []):
		_scene_graphs[scene.get("uuid", "")] = SceneGraph.new(scene)
	for sig in data.get("signatures", []):
		_signatures_by_id[sig.get("id", "")] = sig
	for dict in data.get("dictionaries", []):
		var label: Variant = dict.get("label")
		if label is String and label != "":
			_dictionaries_by_label[label] = dict

func get_scene_graph(scene_uuid: String) -> Variant:
	return _scene_graphs.get(scene_uuid)

func get_signature(action_id: String) -> Variant:
	return _signatures_by_id.get(action_id)

func get_dictionary(group_label: String) -> Variant:
	return _dictionaries_by_label.get(group_label)

func get_all_scene_ids() -> Array:
	return _scene_graphs.keys()

func get_scene_connections(scene_uuid: String) -> Array:
	var sg: Variant = _scene_graphs.get(scene_uuid)
	if sg:
		return sg.get_scene().get("connections", [])
	return []

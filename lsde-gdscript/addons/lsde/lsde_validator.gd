## LSDE Dialog Engine — Init validation + diagnostic report
class_name LsdeValidator
extends RefCounted

static func validate_blueprint(options: Dictionary) -> Dictionary:
	var errors: Array = []
	var warnings: Array = []
	var data: Variant = options.get("data")
	var check: Variant = options.get("check")

	if data == null or not (data is Dictionary):
		errors.append({"code": "MISSING_DATA", "message": "Blueprint data is required."})
		return {"errors": errors, "warnings": warnings, "stats": {"sceneCount": 0, "blockCount": 0, "connectionCount": 0}}

	if data.get("version", "") == "":
		errors.append({"code": "MISSING_VERSION", "message": "Blueprint version is required."})

	var scenes: Array = data.get("scenes", [])
	if scenes.size() == 0:
		errors.append({"code": "NO_SCENES", "message": "Blueprint must contain at least one scene."})
		return {"errors": errors, "warnings": warnings, "stats": {"sceneCount": 0, "blockCount": 0, "connectionCount": 0}}

	var global_block_uuids: Dictionary = {}
	var total_blocks: int = 0
	var total_connections: int = 0

	for scene in scenes:
		_validate_scene(scene, global_block_uuids, errors, warnings)
		total_blocks += scene.get("blocks", []).size()
		total_connections += scene.get("connections", []).size()

	if check is Dictionary:
		_cross_validate(data, check, warnings)

	return {
		"errors": errors,
		"warnings": warnings,
		"stats": {
			"sceneCount": scenes.size(),
			"blockCount": total_blocks,
			"connectionCount": total_connections,
		}
	}

static func _validate_scene(scene: Dictionary, global_block_uuids: Dictionary, errors: Array, warnings: Array) -> void:
	if scene.get("uuid", "") == "":
		errors.append({"code": "MISSING_SCENE_UUID", "message": "Scene is missing a UUID."})
	if scene.get("label", "") == "":
		errors.append({"code": "MISSING_SCENE_LABEL", "message": "Scene is missing a label.", "sceneId": scene.get("uuid", "")})

	var scene_block_uuids: Dictionary = {}
	var start_block_count: int = 0
	var blocks: Array = scene.get("blocks", [])

	for block in blocks:
		var uuid: String = block.get("uuid", "")
		if scene_block_uuids.has(uuid):
			errors.append({"code": "DUPLICATE_BLOCK_UUID", "message": "Duplicate block UUID \"%s\" within scene \"%s\"." % [uuid, scene.get("label", "")], "sceneId": scene.get("uuid", ""), "blockId": uuid})
		scene_block_uuids[uuid] = true

		if global_block_uuids.has(uuid):
			errors.append({"code": "DUPLICATE_BLOCK_UUID_GLOBAL", "message": "Block UUID \"%s\" exists in multiple scenes." % uuid, "sceneId": scene.get("uuid", ""), "blockId": uuid})
		global_block_uuids[uuid] = true

		if block.get("isStartBlock", false):
			start_block_count += 1

	if start_block_count > 1:
		errors.append({"code": "MULTIPLE_START_BLOCKS", "message": "Scene \"%s\" has %d start blocks (expected at most 1)." % [scene.get("label", ""), start_block_count], "sceneId": scene.get("uuid", "")})

	var entry_block_id: Variant = scene.get("entryBlockId")
	if entry_block_id is String and entry_block_id != "" and not scene_block_uuids.has(entry_block_id):
		errors.append({"code": "INVALID_ENTRY_BLOCK", "message": "Scene \"%s\" entryBlockId \"%s\" does not reference an existing block." % [scene.get("label", ""), entry_block_id], "sceneId": scene.get("uuid", ""), "blockId": entry_block_id})

	var connections: Array = scene.get("connections", [])
	for conn in connections:
		if not scene_block_uuids.has(conn.get("fromId", "")):
			errors.append({"code": "BROKEN_CONNECTION_FROM", "message": "Connection \"%s\" fromId \"%s\" references a non-existent block." % [conn.get("id", ""), conn.get("fromId", "")], "sceneId": scene.get("uuid", "")})
		if not scene_block_uuids.has(conn.get("toId", "")):
			errors.append({"code": "BROKEN_CONNECTION_TO", "message": "Connection \"%s\" toId \"%s\" references a non-existent block." % [conn.get("id", ""), conn.get("toId", "")], "sceneId": scene.get("uuid", "")})

	# Fork validation
	var block_map: Dictionary = {}
	for block in blocks:
		block_map[block.get("uuid", "")] = block

	var port_groups: Dictionary = {}
	for conn in connections:
		var key: String
		if conn.has("fromPortIndex") and conn["fromPortIndex"] != null:
			key = "%s:idx:%s" % [conn.get("fromId", ""), str(conn["fromPortIndex"])]
		else:
			key = "%s:port:%s" % [conn.get("fromId", ""), conn.get("fromPort", "")]
		if not port_groups.has(key):
			port_groups[key] = []
		port_groups[key].append(conn.get("toId", ""))

	for key in port_groups:
		var targets: Array = port_groups[key]
		if targets.size() <= 1:
			continue
		var non_async_count: int = 0
		for to_id in targets:
			if block_map.has(to_id):
				var target: Dictionary = block_map[to_id]
				var np: Variant = target.get("nativeProperties")
				if np == null or not (np is Dictionary) or not np.get("isAsync", false):
					non_async_count += 1
		if non_async_count > 1:
			warnings.append({"code": "MULTIPLE_NON_ASYNC_FORK", "message": "A port has %d outgoing connections with %d non-async targets. Mark secondary targets as isAsync." % [targets.size(), non_async_count], "sceneId": scene.get("uuid", "")})

static func _cross_validate(data: Dictionary, check: Dictionary, warnings: Array) -> void:
	var check_sigs: Variant = check.get("signatures")
	if check_sigs is Array and check_sigs.size() > 0:
		var game_sigs: Dictionary = {}
		for s in check_sigs:
			game_sigs[s] = true
		for sig in data.get("signatures", []):
			if not game_sigs.has(sig.get("id", "")):
				warnings.append({"code": "UNKNOWN_SIGNATURE", "message": "Blueprint uses signature \"%s\" which is not declared in the game." % sig.get("id", "")})

	var check_dicts: Variant = check.get("dictionaries")
	if check_dicts is Dictionary:
		for dict in data.get("dictionaries", []):
			var label: String = dict.get("label", dict.get("uuid", ""))
			if not check_dicts.has(label):
				warnings.append({"code": "UNKNOWN_DICTIONARY_GROUP", "message": "Blueprint uses dictionary group \"%s\" which is not declared in the game." % label})
				continue
			var game_keys: Dictionary = {}
			for k in check_dicts[label]:
				game_keys[k] = true
			for row in dict.get("rows", []):
				if not game_keys.has(row.get("key", "")):
					warnings.append({"code": "UNKNOWN_DICTIONARY_KEY", "message": "Dictionary group \"%s\" uses key \"%s\" not declared in the game." % [label, row.get("key", "")]})

	var check_chars: Variant = check.get("characters")
	if check_chars is Array and check_chars.size() > 0:
		var game_chars: Dictionary = {}
		for c in check_chars:
			game_chars[c] = true
		var blueprint_chars: Dictionary = {}
		for scene in data.get("scenes", []):
			for block in scene.get("blocks", []):
				var metadata: Variant = block.get("metadata")
				if metadata is Dictionary:
					for ch in metadata.get("characters", []):
						blueprint_chars[ch.get("name", "")] = true
		for char_name in blueprint_chars:
			if not game_chars.has(char_name):
				warnings.append({"code": "UNKNOWN_CHARACTER", "message": "Blueprint uses character \"%s\" which is not declared in the game." % char_name})

## LSDE Dialog Engine — Init validation + diagnostic report
##
## The first thing this file does is refuse a payload it cannot read.
##
## It did not, before. The engine opened whatever it was handed and went straight to work, so a
## file written by a different exporter version produced no error at all — it produced a scene that
## stopped in the middle, silently, at the point where the flow needed a field that was not there.
## That is the worst failure a loader can have: the game ships, and the dialogue just ends early.
##
## So `format` and `version` are read before anything else, and a mismatch is fatal and named.
class_name LsdeValidator
extends RefCounted

## Fold the files of a per-scene export into one payload.
##
## Each file carries the whole header, so the first supplies it and the rest only add scenes.
## `project` and `exportedAt` are checked first: they are identical across the files of one export
## and different across two, which is the only way to catch someone passing pieces of two exports.
## Merging those would produce a payload whose dictionaries do not match its scenes, and nothing
## downstream would notice.
##
## Returns { data: Dictionary } or { error: Dictionary }.
static func merge_payloads(payloads: Array) -> Dictionary:
	var first: Dictionary = payloads[0]

	for i in range(1, payloads.size()):
		var next: Dictionary = payloads[i]
		if next.get("project") != first.get("project") \
			or next.get("exportedAt") != first.get("exportedAt"):
			return {"error": {
				"code": "MISMATCHED_EXPORTS",
				"message": "These files are not from the same export: \"%s\" (%s) and \"%s\" (%s). Pass the files of one export at a time." % [
					first.get("project", ""), first.get("exportedAt", ""),
					next.get("project", ""), next.get("exportedAt", ""),
				],
			}}

	var merged: Dictionary = first.duplicate()
	var scenes: Array = []
	for payload in payloads:
		scenes.append_array(payload.get("scenes", []))
	merged["scenes"] = scenes
	return {"data": merged}

## Validate a blueprint payload, and optionally cross-check it against what the game declares.
##
## Structural checks: the format header, scene paths, block id uniqueness [b]within a scene[/b],
## the entry block, link targets, and the fork rule (at most one non-async target per port). With
## `check`, also warns about functions, dictionaries and cards the game does not know.
##
## Errors mean the payload will not play correctly; warnings mean it will, but something looks
## wrong.
static func validate_blueprint(options: Dictionary) -> Dictionary:
	var errors: Array = []
	var warnings: Array = []
	var empty_stats := {"sceneCount": 0, "blockCount": 0, "connectionCount": 0}

	# ─── The header, before anything else ────────────────────────────────

	var payload: Variant = options.get("data")
	var files: Variant = options.get("files")

	if files is Array:
		if files.is_empty():
			errors.append({"code": "MISSING_DATA", "message": "Blueprint data is required."})
			return {"errors": errors, "warnings": warnings, "stats": empty_stats}

		# A per-scene export arrives as several self-contained files. Fold them before validating,
		# so everything below sees one payload and no rule has to know about split modes.
		var merged: Dictionary = merge_payloads(files)
		if merged.has("error"):
			errors.append(merged["error"])
			return {"errors": errors, "warnings": warnings, "stats": empty_stats}
		payload = merged["data"]

	if not payload is Dictionary:
		errors.append({"code": "MISSING_DATA", "message": "Blueprint data is required."})
		return {"errors": errors, "warnings": warnings, "stats": empty_stats}

	var format: Variant = payload.get("format")
	if format != LsdeTypes.SUPPORTED_FORMAT:
		errors.append({
			"code": "INVALID_FORMAT",
			"message": "Not an LSDE blueprint: expected format \"%s\", got %s." % [
				LsdeTypes.SUPPORTED_FORMAT,
				"nothing" if format == null else "\"%s\"" % str(format),
			],
		})
		return {"errors": errors, "warnings": warnings, "stats": empty_stats}

	# Godot's JSON parser has no integer type: it reads `"version": 1` as the float 1.0. Comparing
	# the VALUE rather than the type is what keeps this runtime agreeing with the other three —
	# the kind of divergence only the shared specs surface.
	var version: Variant = payload.get("version")
	var version_ok: bool = (version is int or version is float) and int(version) == LsdeTypes.SUPPORTED_VERSION
	if not version_ok:
		errors.append({
			"code": "UNSUPPORTED_FORMAT_VERSION",
			"message": "This engine reads blueprint format version %d, the file is version %s. Re-export from LSDE, or install the engine version that matches it." % [
				LsdeTypes.SUPPORTED_VERSION, str(version),
			],
		})
		return {"errors": errors, "warnings": warnings, "stats": empty_stats}

	# ─── Scenes ──────────────────────────────────────────────────────────

	var scenes: Array = payload.get("scenes", [])
	if scenes.size() == 0:
		errors.append({"code": "NO_SCENES", "message": "Blueprint must contain at least one scene."})
		return {"errors": errors, "warnings": warnings, "stats": empty_stats}

	var scene_paths: Dictionary = {}
	var total_blocks: int = 0
	var total_connections: int = 0

	for scene in scenes:
		var path: String = scene.get("scene", "")
		if scene_paths.has(path):
			errors.append({
				"code": "DUPLICATE_SCENE",
				"message": "Scene \"%s\" appears more than once. When loading a per-scene export, pass each file exactly once." % path,
				"sceneId": path,
			})
		scene_paths[path] = true

		_validate_scene(scene, errors, warnings)
		var blocks: Array = scene.get("blocks", [])
		total_blocks += blocks.size()
		for block in blocks:
			total_connections += block.get("next", []).size()

	var check: Variant = options.get("check")
	if check is Dictionary:
		_cross_validate(payload, check, warnings)

	return {
		"errors": errors,
		"warnings": warnings,
		"stats": {
			"sceneCount": scenes.size(),
			"blockCount": total_blocks,
			"connectionCount": total_connections,
		},
	}

static func _validate_scene(scene: Dictionary, errors: Array, warnings: Array) -> void:
	var path: String = scene.get("scene", "")
	if path == "":
		errors.append({"code": "MISSING_SCENE_PATH", "message": "Scene is missing its path."})

	# A payload can carry a scene with no blocks at all - a truncated file, or a scene the writer
	# has not filled in yet. get("blocks", []) normalises it, which is also what the other three
	# runtimes now do: "absent" and "empty" cannot be told apart in every language, and a scene with
	# no blocks already reports NO_START_BLOCK. It cannot play, which is the thing worth saying.
	#
	# A block id is unique inside its scene and nowhere else: the counter restarts at 1 in every
	# scene, so DIALOG-001 in two scenes is not a collision, it is the normal case.
	var block_ids: Dictionary = {}
	var blocks: Array = scene.get("blocks", [])

	for block in blocks:
		var id: String = block.get("id", "")
		if block_ids.has(id):
			errors.append({
				"code": "DUPLICATE_BLOCK_ID",
				"message": "Duplicate block id \"%s\" within scene \"%s\"." % [id, path],
				"sceneId": path,
				"blockId": id,
			})
		block_ids[id] = block

	# The scene names its own entry, so there is no such thing as two start blocks.
	var start: Variant = scene.get("start")
	if not (start is String) or start == "":
		warnings.append({
			"code": "NO_START_BLOCK",
			"message": "Scene \"%s\" has no start block and cannot play." % path,
			"sceneId": path,
		})
	elif not block_ids.has(start):
		errors.append({
			"code": "INVALID_START_BLOCK",
			"message": "Scene \"%s\" starts on \"%s\", which is not a block of this scene." % [path, start],
			"sceneId": path,
			"blockId": start,
		})

	for block in blocks:
		_validate_links(path, block, block_ids, errors, warnings)
		_validate_waits(path, block, block_ids, warnings)


## waitForBlocks names blocks OF THIS SCENE that must have been visited before this one advances.
##
## A name that is not in the scene can never be visited, so the block parks for good: on the main
## flow that is the whole dialogue stopping with no on_scene_exit, and on a parallel track it is a
## branch that silently never finishes. Neither shows up anywhere at runtime, which is why it is
## said here - a warning, not an error: the rest of the scene still plays.
static func _validate_waits(
	scene_path: String,
	block: Dictionary,
	block_ids: Dictionary,
	warnings: Array
) -> void:
	var waits: Variant = LsdeUtils.get_native_properties(block).get("waitForBlocks")
	if not (waits is Array):
		return

	for wait_id in waits:
		if not (wait_id is String) or block_ids.has(wait_id):
			continue
		warnings.append({
			"code": "UNKNOWN_WAIT_BLOCK",
			"message": "%s waits for \"%s\", which is not a block of scene \"%s\". It can never be visited, so this block never advances." % [
				_describe_block(block), wait_id, scene_path,
			],
			"sceneId": scene_path,
			"blockId": block.get("id", ""),
		})

static func _validate_links(
	scene_path: String,
	block: Dictionary,
	block_ids: Dictionary,
	errors: Array,
	warnings: Array
) -> void:
	var links: Array = block.get("next", [])
	if links.is_empty():
		return

	# A link's target is relative to the same scene — a wire has never crossed one.
	var by_port: Dictionary = {}

	for link in links:
		var to: String = link.get("to", "")
		var port: String = link.get("port", "")

		if not block_ids.has(to):
			errors.append({
				"code": "BROKEN_LINK",
				"message": "%s links from port \"%s\" to \"%s\", which is not a block of scene \"%s\"." % [
					_describe_block(block), port, to, scene_path,
				],
				"sceneId": scene_path,
				"blockId": block.get("id", ""),
			})

		if not by_port.has(port):
			by_port[port] = []
		by_port[port].append(to)

	# One port, several wires: the first non-async target becomes the main flow and the rest run as
	# parallel tracks. Two non-async targets on one port means the second silently never becomes
	# the main track — almost always a wiring mistake rather than an intent.
	for port in by_port.keys():
		var targets: Array = by_port[port]
		if targets.size() <= 1:
			continue

		var non_async: int = 0
		for to in targets:
			var target: Variant = block_ids.get(to)
			if target == null or not _is_async(target):
				non_async += 1

		if non_async > 1:
			warnings.append({
				"code": "MULTIPLE_NON_ASYNC_FORK",
				"message": "%s port \"%s\" has %d outgoing links with %d non-async targets. Mark the secondary ones isAsync." % [
					_describe_block(block), port, targets.size(), non_async,
				],
				"sceneId": scene_path,
				"blockId": block.get("id", ""),
			})

static func _is_async(block: Dictionary) -> bool:
	var props: Variant = block.get("props")
	if not props is Dictionary:
		return false
	return props.get("isAsync") == true

static func _cross_validate(data: Dictionary, check: Dictionary, warnings: Array) -> void:
	var known_functions: Variant = check.get("functions")
	if known_functions is Array:
		for fn in data.get("functions", []):
			if not fn.get("id", "") in known_functions:
				warnings.append({
					"code": "UNKNOWN_FUNCTION",
					"message": "Blueprint declares function \"%s\" which the game does not implement." % fn.get("id", ""),
				})

	var known_dicts: Variant = check.get("dictionaries")
	if known_dicts is Dictionary:
		for dict in data.get("dictionaries", []):
			var id: String = dict.get("id", "")
			if not known_dicts.has(id):
				warnings.append({
					"code": "UNKNOWN_DICTIONARY",
					"message": "Blueprint uses dictionary \"%s\" which the game does not declare." % id,
				})
				continue
			var known_entries: Array = known_dicts[id]
			for entry in dict.get("entries", []):
				if not entry in known_entries:
					warnings.append({
						"code": "UNKNOWN_DICTIONARY_ENTRY",
						"message": "Dictionary \"%s\" declares entry \"%s\" which the game does not know." % [id, entry],
					})

	# Cards — matched on the NAME the game gives them, not on the editor id.
	var known_cards: Variant = check.get("cards")
	if known_cards is Array:
		for card in data.get("cards", []):
			if not card.get("name", "") in known_cards:
				warnings.append({
					"code": "UNKNOWN_CARD",
					"message": "Blueprint declares card \"%s\" (%s) which the game does not know." % [
						card.get("name", ""), card.get("role", ""),
					],
				})

## How a block is named in a diagnostic.
##
## DIALOG-007 is already readable on its own — that is what replaced the v1 uuid, and it is why
## blocks carry no mandatory name. When the writer left a note, it says far more than any label
## would, so it is appended. A label wins over both when an export happens to carry one.
static func _describe_block(block: Dictionary) -> String:
	var id: String = block.get("id", "")
	var label: Variant = block.get("label")
	if label is String and label != "":
		return "Block %s (\"%s\")" % [id, label]
	var note: Variant = block.get("note")
	if note is String and note != "":
		var short: String = note if note.length() <= 60 else note.substr(0, 59) + "…"
		return "Block %s (\"%s\")" % [id, short]
	return "Block %s" % id

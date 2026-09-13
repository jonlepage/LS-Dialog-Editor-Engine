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
## the entry block, link targets, and the blocks a waitForBlocks names. Always, too: what the blocks
## USE — the functions and arguments an action calls, the dictionaries and entries a condition tests
## — against what the export declares. With `check`, also warns about functions, dictionaries and
## cards the game does not know.
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
		var convention: String = _detect_naming_convention(payload)
		if convention != "":
			errors.append({
				"code": "WRONG_NAMING_CONVENTION",
				"message": "This file is exported in %s; the engine reads camelCase — Project settings › Exporters › Naming convention." % convention,
			})
		else:
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

	var declared: Dictionary = _declared_by(payload)
	var scene_paths: Dictionary = {}
	# Stable id -> the path of the first scene that carried it.
	var scene_ids: Dictionary = {}
	var total_blocks: int = 0
	var total_connections: int = 0

	for scene in scenes:
		var path: String = scene.get("scene", "")
		var scene_id: String = _scene_id_of(scene)
		if scene_paths.has(path):
			errors.append({
				"code": "DUPLICATE_SCENE",
				"message": "Scene \"%s\" appears more than once. When loading a per-scene export, pass each file exactly once." % path,
				"sceneId": scene_id,
				"scenePath": path,
			})
		elif scene_id != "" and scene_ids.has(scene_id):
			# Two paths, one stable id: a scene file copied and renamed by hand. It used to load, and a
			# lookup by that id opened whichever of the two came last, without a word. The same scene
			# passed twice repeats its path as well, and is reported once, just above.
			errors.append({
				"code": "DUPLICATE_SCENE",
				"message": "Scenes \"%s\" and \"%s\" share the stable id \"%s\", so a lookup by that id cannot tell them apart." % [
					scene_ids[scene_id], path, scene_id,
				],
				"sceneId": scene_id,
				"scenePath": path,
			})
		scene_paths[path] = true
		if scene_id != "" and not scene_ids.has(scene_id):
			scene_ids[scene_id] = path

		_validate_scene(scene, declared, errors, warnings)
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

## Did the exporter write this file in another naming convention?
##
## LSDE can write camelCase (its default), snake_case or PascalCase, and the choice RENAMES the
## fields of the JSON. The engine reads camelCase only, so the point of this check is to say which
## setting to change instead of leaving the reader with "not an LSDE blueprint" on a file that
## plainly is one.
##
## format and version are single words and survive every convention, so the tell is a field that is
## not: exportedAt.
##
## Only this runtime and TypeScript can answer it: both are handed the raw payload, keys and all.
## C# and C++ validate a typed object the game already deserialized — the original key names are
## gone by then — so they report INVALID_FORMAT for the same file. The payload is refused either
## way; only the message differs.
static func _detect_naming_convention(raw: Dictionary) -> String:
	if raw.has("exported_at"):
		return "snake_case"
	if raw.has("ExportedAt"):
		return "PascalCase"
	return ""

## The stable id of a scene, or "" when it has none. Read loosely: a JSON null must not reach a typed
## String variable.
static func _scene_id_of(scene: Dictionary) -> String:
	var id: Variant = scene.get("id", "")
	return id if id is String else ""

## A list field of the payload, or an empty list. A JSON null must not reach a `for`: iterating Nil is a
## script error, and the report would stop halfway with nothing said.
static func _list_of(source: Dictionary, key: String) -> Array:
	var value: Variant = source.get(key)
	return value if value is Array else []

## What the header of the export declares, looked up by id — for the checks that read what the
## blocks USE. { functions: {id: definition}, dictionaries: {id: {entry: true}} }.
static func _declared_by(payload: Dictionary) -> Dictionary:
	var functions: Dictionary = {}
	for fn in _list_of(payload, "functions"):
		functions[fn.get("id", "")] = fn
	var dictionaries: Dictionary = {}
	for dict in _list_of(payload, "dictionaries"):
		var entries: Dictionary = {}
		for entry in _list_of(dict, "entries"):
			entries[entry] = true
		dictionaries[dict.get("id", "")] = entries
	return {"functions": functions, "dictionaries": dictionaries}

static func _validate_scene(scene: Dictionary, declared: Dictionary, errors: Array, warnings: Array) -> void:
	var path: String = scene.get("scene", "")
	var scene_id: String = _scene_id_of(scene)
	if path == "":
		# Named by its id: without a path, that is the one name left to find the scene by.
		errors.append({"code": "MISSING_SCENE_PATH", "message": "Scene is missing its path.", "sceneId": scene_id})

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
				"sceneId": scene_id,
				"scenePath": path,
				"blockId": id,
			})
		block_ids[id] = block

	# The scene names its own entry, so there is no such thing as two start blocks.
	var start: Variant = scene.get("start")
	if not (start is String) or start == "":
		warnings.append({
			"code": "NO_START_BLOCK",
			"message": "Scene \"%s\" has no start block and cannot play." % path,
			"sceneId": scene_id,
			"scenePath": path,
		})
	elif not block_ids.has(start):
		errors.append({
			"code": "INVALID_START_BLOCK",
			"message": "Scene \"%s\" starts on \"%s\", which is not a block of this scene." % [path, start],
			"sceneId": scene_id,
			"scenePath": path,
			"blockId": start,
		})

	for block in blocks:
		_validate_links(path, scene_id, block, block_ids, errors, warnings)
		_validate_waits(path, scene_id, block, block_ids, warnings)
		_validate_usage(path, scene_id, block, block_ids, declared, warnings)


## waitForBlocks names blocks OF THIS SCENE that must have FINISHED before this one advances.
##
## A name that is not in the scene can never finish, so the block parks for good. It used to hold the
## scene open with no on_scene_exit; the engine now closes it as deadlocked — either way the dialogue
## stops there, and nothing on screen says why, which is why it is said here. A warning, not an
## error: the rest of the scene still plays.
static func _validate_waits(
	scene_path: String,
	scene_id: String,
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
			"sceneId": scene_id,
			"scenePath": scene_path,
			"blockId": block.get("id", ""),
		})

# ─── What the blocks use ──────────────────────────────────────────────────

## What a block USES must be what the export DECLARES.
##
## An export carries two kinds of facts: the tables its header declares, and what its blocks use.
## `check` compares the first kind against the game; nothing read the second. So an action calling a
## function the export does not declare — a v1 id left behind in the project — loaded without a
## word, and failed in game, far from the cause.
##
## Always on, no `check` needed: the export contradicts ITSELF, whatever the game knows. Warnings,
## not errors — the scene still plays. The codes say UNDECLARED where the existing ones say UNKNOWN:
## those mean "the game does not know it".
##
## Left alone on purpose: a declared parameter with no argument (the format does not say which are
## optional), and the TYPE of a value (noisier than the defect it would catch).
static func _validate_usage(
	scene_path: String,
	scene_id: String,
	block: Dictionary,
	blocks_by_id: Dictionary,
	declared: Dictionary,
	warnings: Array
) -> void:
	var calls: Variant = block.get("calls")
	if calls is Array:
		for call in calls:
			_validate_call(scene_path, scene_id, block, call, declared, warnings)
	for test in _tests_of(block):
		_validate_test(scene_path, scene_id, block, test, blocks_by_id, declared, warnings)

## Every condition test a block carries: the cases of a condition or a router, and the options of a
## choice.
static func _tests_of(block: Dictionary) -> Array:
	var tests: Array = []
	var cases: Variant = block.get("cases")
	if cases is Array:
		for condition_case in cases:
			var when: Variant = condition_case.get("when")
			if when is Array:
				tests.append_array(when)
	var options: Variant = block.get("options")
	if options is Array:
		for option in options:
			var when: Variant = option.get("when")
			if when is Array:
				tests.append_array(when)
	return tests

static func _validate_call(
	scene_path: String,
	scene_id: String,
	block: Dictionary,
	call: Dictionary,
	declared: Dictionary,
	warnings: Array
) -> void:
	var where: String = "%s in scene \"%s\"" % [_describe_block(block), scene_path]

	# The contract allows it — "not picked yet" — but the game is then handed a call it cannot run.
	var fn_id: Variant = call.get("fn", "")
	if not (fn_id is String) or fn_id == "":
		warnings.append(_usage("EMPTY_FUNCTION", "%s has a call with no function picked." % where, scene_path, scene_id, block))
		return

	var functions: Dictionary = declared["functions"]
	if not functions.has(fn_id):
		warnings.append(_usage("UNDECLARED_FUNCTION",
			"%s calls \"%s\", which the export does not declare in its functions." % [where, fn_id], scene_path, scene_id, block))
		# Nothing more to say about its arguments: nobody knows what they should be.
		return

	var params: Dictionary = {}
	for param in _list_of(functions[fn_id], "params"):
		params[param.get("name", "")] = param

	var args: Variant = call.get("args")
	if not (args is Dictionary):
		return

	var dictionaries: Dictionary = declared["dictionaries"]
	for arg_name in args:
		if not params.has(arg_name):
			warnings.append(_usage("UNDECLARED_ARGUMENT",
				"%s calls \"%s\" with argument \"%s\", which \"%s\" does not declare." % [where, fn_id, arg_name, fn_id],
				scene_path, scene_id, block))
			continue

		var param: Dictionary = params[arg_name]
		if param.get("type", "") != "dictionaryKey":
			continue

		var value: String = _value_text(args[arg_name])
		var dictionary_id: Variant = param.get("dictionary")
		if not (dictionary_id is String) or not dictionaries.has(dictionary_id):
			warnings.append(_usage("UNDECLARED_DICTIONARY_KEY",
				"%s passes \"%s\" as \"%s\" of \"%s\", picked in dictionary \"%s\", which the export does not declare." % [
					where, value, arg_name, fn_id, dictionary_id if dictionary_id is String else "",
				], scene_path, scene_id, block))
		elif not dictionaries[dictionary_id].has(value):
			warnings.append(_usage("UNDECLARED_DICTIONARY_KEY",
				"%s passes \"%s\" as \"%s\" of \"%s\", which is not an entry of dictionary \"%s\"." % [
					where, value, arg_name, fn_id, dictionary_id,
				], scene_path, scene_id, block))

static func _validate_test(
	scene_path: String,
	scene_id: String,
	block: Dictionary,
	test: Dictionary,
	blocks_by_id: Dictionary,
	declared: Dictionary,
	warnings: Array
) -> void:
	var where: String = "%s in scene \"%s\"" % [_describe_block(block), scene_path]
	var dict_id: String = str(test.get("dict", ""))
	var entry: String = str(test.get("entry", ""))

	# The reserved "choice" dictionary is not declared anywhere: it reads the answers given IN THIS
	# SCENE, so its entry must be a CHOICE block of this scene and its value one of that block's
	# options.
	if dict_id == LsdeTypes.DICT_CHOICE:
		var target: Variant = blocks_by_id.get(entry)
		if target == null or target.get("type", "") != LsdeTypes.BLOCK_CHOICE:
			warnings.append(_usage("UNKNOWN_CHOICE_BLOCK",
				"%s tests the answer given at \"%s\", which is not a CHOICE block of this scene. The engine only remembers the answers given in the scene that is playing." % [where, entry],
				scene_path, scene_id, block))
			return
		var picked: String = _value_text(test.get("value"))
		var offered: bool = false
		for option in _list_of(target, "options"):
			if option.get("id", "") == picked:
				offered = true
				break
		if not offered:
			warnings.append(_usage("UNKNOWN_CHOICE_OPTION",
				"%s tests whether \"%s\" was picked at %s, which has no such option." % [where, picked, entry],
				scene_path, scene_id, block))
		return

	var dictionaries: Dictionary = declared["dictionaries"]
	if not dictionaries.has(dict_id):
		warnings.append(_usage("UNDECLARED_DICTIONARY",
			"%s tests dictionary \"%s\", which the export does not declare." % [where, dict_id], scene_path, scene_id, block))
		return
	if not dictionaries[dict_id].has(entry):
		warnings.append(_usage("UNDECLARED_ENTRY",
			"%s tests \"%s.%s\", an entry dictionary \"%s\" does not declare." % [where, dict_id, entry, dict_id],
			scene_path, scene_id, block))

static func _usage(code: String, message: String, scene_path: String, scene_id: String, block: Dictionary) -> Dictionary:
	return {"code": code, "message": message, "sceneId": scene_id, "scenePath": scene_path, "blockId": block.get("id", "")}

## A value as the text a dictionary entry or an option id is written in. Godot's JSON parser reads
## every number as a float, so 3 would print as "3.0" without the integer case.
static func _value_text(value: Variant) -> String:
	if value == null:
		return ""
	if value is bool:
		return "true" if value else "false"
	if value is float and value == floor(value):
		return str(int(value))
	return str(value)

static func _validate_links(
	scene_path: String,
	scene_id: String,
	block: Dictionary,
	block_ids: Dictionary,
	errors: Array,
	warnings: Array
) -> void:
	var links: Array = block.get("next", [])
	if links.is_empty():
		return

	# A link's target is relative to the same scene — a wire has never crossed one.
	#
	# Several wires on one port is NOT reported. It used to be, as MULTIPLE_NON_ASYNC_FORK:
	# "two non-async targets on one port, mark the secondary ones isAsync". The warning was right
	# about the engine of the day — every wire but the first was detached whatever the designer had
	# ticked — and it asked them to give up what they had drawn. The traversal now walks those
	# wires in turn, which is what the drawing said, so there is nothing left to warn about.
	for link in links:
		var to: String = link.get("to", "")
		var port: String = link.get("port", "")

		if not block_ids.has(to):
			errors.append({
				"code": "BROKEN_LINK",
				"message": "%s links from port \"%s\" to \"%s\", which is not a block of scene \"%s\"." % [
					_describe_block(block), port, to, scene_path,
				],
				"sceneId": scene_id,
				"scenePath": scene_path,
				"blockId": block.get("id", ""),
			})

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
			for entry in _list_of(dict, "entries"):
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

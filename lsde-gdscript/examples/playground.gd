## LSDE Dialog Engine — Playground (GDScript port of playground.ts)
##
## Loads a real LSDE v2 export and plays a scene. Read it as the shortest complete integration:
## init, a locale, the two resolvers, the four handlers. Everything the engine asks of a game is in
## here, and nothing else is needed.
extends SceneTree

# ─── The game's state ─────────────────────────────────────────────────────
#
# A real game reads its own save here. What matters is the SHAPE of the answer: the engine hands
# over a test and expects true or false. It never reads a dictionary itself, never implements an
# operator, never knows what "credits" holds.

const GAME_STATE := {
	"switches": {
		"door_unlocked": true, "oracle_awake": false, "reactor_stable": false,
		"met_vesk": true, "alarm_armed": true,
	},
	"variables": {"chapter": 3, "credits": 80, "trust_kael": 2, "alarm_level": 3},
	"items": {"plasma_cell": 1, "keycard": 0, "ration": 2},
	"flags": {"faction": "salvage", "last_port": "reactor_deck", "player_callsign": "Vane"},
}

func _resolve_condition(test: Dictionary) -> bool:
	var dict: Variant = GAME_STATE.get(test.get("dict", ""))
	if not dict is Dictionary:
		return false
	if not dict.has(test.get("entry", "")):
		return false

	var actual: Variant = dict[test["entry"]]
	var expected: Variant = test.get("value")

	match test.get("op", ""):
		LsdeTypes.OP_EQUALS: return actual == expected
		LsdeTypes.OP_NOT_EQUALS: return actual != expected
		LsdeTypes.OP_LESS_THAN: return float(actual) < float(expected)
		LsdeTypes.OP_LESS_OR_EQUAL: return float(actual) <= float(expected)
		LsdeTypes.OP_GREATER_THAN: return float(actual) > float(expected)
		LsdeTypes.OP_GREATER_OR_EQUAL: return float(actual) >= float(expected)
	return false

func _init() -> void:
	# ─── Load the payload ─────────────────────────────────────────────────

	var base: String = ProjectSettings.globalize_path("res://").get_base_dir().get_base_dir()
	var path: String = base.path_join("mock/blueprints/Engine-Conformance-Scene.blueprints.json")
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		print("Cannot open the export at: %s" % path)
		quit(1)
		return

	var blueprint: Variant = JSON.parse_string(file.get_as_text())
	if not (blueprint is Dictionary):
		print("Failed to parse the export")
		quit(1)
		return

	# ─── Init ─────────────────────────────────────────────────────────────

	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": blueprint})

	print("\n[init] %d errors, %d warnings" % [report["errors"].size(), report["warnings"].size()])
	for e in report["errors"]:
		print("   ERROR %s: %s" % [e["code"], e["message"]])
	for w in report["warnings"]:
		print("   WARN  %s: %s" % [w["code"], w["message"]])
	print("[stats] scenes=%d blocks=%d wires=%d" % [
		report["stats"]["sceneCount"], report["stats"]["blockCount"],
		report["stats"]["connectionCount"],
	])

	if report["errors"].size() > 0:
		quit(1)
		return

	engine.set_locale("fr")

	# Which actor of the block is the one speaking. `actors` is a CAST, and LSDE deliberately
	# refuses to say whether its order means "who speaks" or "who is present" — so the game
	# decides. Returning null is legitimate: nobody available can carry this line.
	engine.on_resolve_character(func(actors: Array) -> Variant:
		return actors[0] if actors.size() > 0 else null)

	# The single game-state evaluator. It answers option visibility AND condition cases. Tests on
	# the reserved "choice" dictionary never reach it — the engine answers those from its history.
	engine.on_resolve_condition(_resolve_condition)

	# ─── The four handlers ────────────────────────────────────────────────

	engine.on_dialog(func(args: Dictionary) -> Variant:
		var block: Dictionary = args["block"]
		var context: Variant = args["context"]

		# The engine hands the RAW string over and never looks inside it.
		var line: Variant = LsdeUtils.get_localized_text(block.get("text"))

		var names: Array = []
		for actor in context.actors:
			names.append(actor.get("name", ""))
		var who: String = " + ".join(names) if names.size() > 0 else "-"
		var tone: String = ""
		if context.emotion != null:
			tone = " (%s %s)" % [context.emotion.get("name", ""), str(context.intensity)]

		print("\n[dialog] %s  [%s]%s" % [block.get("id", ""), who, tone])
		print("   %s" % (line if line != null else "<no text in this export>"))

		args["next"].call()
		return null)

	engine.on_choice(func(args: Dictionary) -> Variant:
		var block: Dictionary = args["block"]
		var context: Variant = args["context"]

		print("\n[choice] %s" % block.get("id", ""))

		# Every option comes tagged. Filtering is the game's call — greying a locked answer out is
		# a perfectly good use of the ones that are not visible.
		var picked: Variant = null
		for option in context.options:
			var offered: bool = option.get("visible") != false
			var text: Variant = LsdeUtils.get_localized_text(option.get("text"))
			print("   %s %s  %s" % ["-" if offered else "x", option.get("id", ""), text if text != null else ""])
			if offered and picked == null:
				picked = option

		if picked == null:
			print("   (nothing to pick — the flow stops here)")
			args["next"].call()
			return null

		print("   -> picking %s" % picked["id"])
		context.select_choice(picked["id"])
		args["next"].call()
		return null)

	engine.on_condition(func(args: Dictionary) -> Variant:
		# Optional: with a resolver installed the engine already picked the port. This is where a
		# game logs what matched, or overrides it with context.resolve("K2").
		var context: Variant = args["context"]
		var summary: Array = []
		var matched: Array = []
		for c in context.cases:
			summary.append("%s=%s" % [c["port"], str(c["result"])])
			if c["result"]:
				matched.append(c["port"])

		print("\n[cond] %s  cases: %s" % [args["block"].get("id", ""), " ".join(summary)])
		print("   matched: %s" % (", ".join(matched) if matched.size() > 0 else "none -> default"))

		args["next"].call()
		return null)

	engine.on_action(func(args: Dictionary) -> Variant:
		var context: Variant = args["context"]
		print("\n[action] %s" % args["block"].get("id", ""))
		for call_entry in context.calls:
			# `fn` is empty when the writer has not picked a function yet. A draft, not an error.
			var fn: String = call_entry.get("fn", "")
			var arg_parts: Array = []
			for key in call_entry.get("args", {}).keys():
				arg_parts.append("%s=%s" % [key, str(call_entry["args"][key])])
			print("   %s(%s)" % [fn if fn != "" else "<no function picked>", ", ".join(arg_parts)])

		context.resolve()
		args["next"].call()
		return null)

	# ─── Lifecycle ────────────────────────────────────────────────────────

	engine.on_scene_enter(func(_args: Dictionary) -> void: print("\n[scene] entered"))
	engine.on_scene_exit(func(_args: Dictionary) -> void: print("\n[scene] exited"))

	# ─── Play ─────────────────────────────────────────────────────────────
	#
	# A scene opens by its path OR by the id that survives a rename. Store the id anywhere outside
	# the payload — a resource, a save file — because the path changes when someone renames it.

	var scenes: Array = blueprint.get("scenes", [])
	if scenes.is_empty():
		print("This export has no scene.")
		quit(1)
		return

	var scene_path: String = scenes[0]["scene"]
	var handle: LsdeSceneHandle = engine.scene(scene_path)
	handle.start()

	print("\n[end] visited %d blocks, %d wires in the scene" % [
		handle.get_visited_blocks().size(),
		engine.get_scene_connections(scene_path).size(),
	])

	quit(0)

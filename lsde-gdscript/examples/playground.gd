## LSDE Dialog Engine — Playground (GDScript)
extends SceneTree

func _init() -> void:
	# Load blueprint
	var path: String = ProjectSettings.globalize_path("res://").get_base_dir().get_base_dir().path_join("blueprints/blueprint.json")
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		print("Cannot open blueprint.json at: %s" % path)
		quit(1)
		return

	var blueprint: Variant = JSON.parse_string(file.get_as_text())
	if not (blueprint is Dictionary):
		print("Failed to parse blueprint.json")
		quit(1)
		return

	print("Loaded: blueprint.json")

	# Init engine
	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": blueprint})

	print("Init Errors: %d" % report["errors"].size())
	print("     Stats: %d scenes, %d blocks, %d connections" % [report["stats"]["sceneCount"], report["stats"]["blockCount"], report["stats"]["connectionCount"]])

	if report["errors"].size() > 0:
		for e in report["errors"]:
			print("  [%s] %s" % [e["code"], e["message"]])
		quit(1)
		return

	var locale: String = blueprint.get("primaryLanguage", "en")
	engine.set_locale(locale)

	# StateBridge
	var bridge: PlaygroundBridge = PlaygroundBridge.new()
	engine.set_state_bridge(bridge)

	# Handlers
	var choice_count: Array = [0]

	engine.on_dialog(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var ctx: Variant = args["context"]
		var ch: Variant = ctx.character
		var char_str: String = "%s (%s)" % [ch.get("name", "?"), ch.get("emotion", "?")] if ch != null else "(no character)"
		var text: String = block.get("dialogueText", {}).get(locale, block.get("content", "—"))
		var flags: Array = []
		var np: Variant = block.get("nativeProperties")
		if np is Dictionary:
			if np.get("portPerCharacter", false): flags.append("portPerCharacter")
			if np.get("isAsync", false): flags.append("async")
		var flag_str: String = "[%s]" % ", ".join(flags) if flags.size() > 0 else ""

		print("\n  DIALOG %s %s" % [block.get("label", block.get("uuid", "").left(8)), flag_str])
		print("         %s" % char_str)
		print("         \"%s\"" % text)

		if np is Dictionary and np.get("portPerCharacter", false) and ch != null:
			print("         -> resolveCharacterPort: %s" % ch.get("name", ""))
			ctx.resolve_character_port(ch.get("name", ""))
		args["next"].call()
		var lbl: String = block.get("label", block.get("uuid", "").left(8))
		return func() -> void: print("       [cleanup] %s" % lbl)
	)

	engine.on_choice(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var ctx: Variant = args["context"]
		choice_count[0] += 1
		print("\n  CHOICE %s %d visible:" % [block.get("label", block.get("uuid", "").left(8)), ctx.choices.size()])
		for c in ctx.choices:
			var lbl: String = c.get("label", c.get("uuid", "").left(8))
			var txt: String = c.get("dialogueText", {}).get(locale, "—")
			print("         > %s: \"%s\"" % [lbl, txt])
		var pick: Dictionary = ctx.choices[1] if ctx.choices.size() > 1 and choice_count[0] > 1 else ctx.choices[0]
		print("         -> selecting: %s" % pick.get("label", pick.get("uuid", "").left(8)))
		ctx.select_choice(pick["uuid"])
		args["next"].call()
		return Callable()
	)

	engine.on_condition(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var conds: Array = block.get("conditions", [])
		var result: bool = conds.size() > 0
		print("\n  CONDITION %s %d conditions -> %s" % [block.get("label", block.get("uuid", "").left(8)), conds.size(), "true" if result else "false"])
		args["context"].resolve(result)
		args["next"].call()
		return Callable()
	)

	engine.on_action(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var actions: Array = block.get("actions", [])
		print("\n  ACTION %s %d actions" % [block.get("label", block.get("uuid", "").left(8)), actions.size()])
		for a in actions:
			print("         > %s()" % a.get("actionId", ""))
		args["context"].resolve()
		args["next"].call()
		var lbl: String = block.get("label", block.get("uuid", "").left(8))
		return func() -> void: print("       [cleanup] %s" % lbl)
	)

	engine.on_scene_enter(func(_args: Dictionary) -> void:
		print("\n--- Scene Enter ---")
	)

	engine.on_scene_exit(func(_args: Dictionary) -> void:
		print("--- Scene Exit ---\n")
	)

	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		if args.get("fromBlock") != null:
			var from_label: String = args["fromBlock"].get("label", args["fromBlock"].get("uuid", "").left(8))
			var to_label: String = args["nextBlock"].get("label", args["nextBlock"].get("uuid", "").left(8))
			print("       [validate] %s -> %s" % [from_label, to_label])
		return {"valid": true}
	)

	# Launch first scene
	var scenes: Array = blueprint.get("scenes", [])
	if scenes.size() == 0:
		print("No scenes.")
		quit(0)
		return

	print("\nLaunching scene: %s (%s)" % [scenes[0].get("label", ""), scenes[0].get("uuid", "").left(12)])

	var handle: LsdeSceneHandle = engine.scene(scenes[0]["uuid"])
	handle.start()

	# Summary
	var visited_labels: Array = []
	for uuid in handle.get_visited_blocks():
		var lbl: String = uuid.left(8)
		for s in scenes:
			for b in s.get("blocks", []):
				if b.get("uuid", "") == uuid:
					lbl = b.get("label", lbl)
					break
		visited_labels.append(lbl)
	print("Visited: %s" % ", ".join(visited_labels))
	print("Engine: running=%s" % str(engine.is_running()))

	quit(0)

class PlaygroundBridge extends LsdeStateBridge:
	func evaluate_condition(condition: Dictionary) -> bool:
		print("       [bridge] eval: %s %s %s -> true" % [condition.get("key", ""), condition.get("operator", ""), condition.get("value", "")])
		return true

	func execute_action(action: Dictionary, signature: Variant = null) -> void:
		var label: String = signature.get("label", action.get("actionId", "")) if signature is Dictionary else action.get("actionId", "")
		print("       [bridge] exec: %s()" % label)

	func resolve_dictionary(group_label: String, row_key: String) -> Variant:
		return "%s.%s" % [group_label, row_key]

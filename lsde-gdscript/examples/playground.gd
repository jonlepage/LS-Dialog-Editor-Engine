## LSDE Dialog Engine — Playground (GDScript port of playground.ts)
## Loads a blueprint JSON, registers the new handler-based API, runs the first scene.
## Mirrors the TS playground exactly for cross-language validation.
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

	# ─── Init ─────────────────────────────────────────────────────────────

	var engine: LsdeDialogueEngine = LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": blueprint})

	print("\n🔧 Init — %d errors, %d warnings" % [report["errors"].size(), report["warnings"].size()])
	for w in report["warnings"]:
		print("   ⚠️  %s: %s" % [w["code"], w["message"]])
	print("📊 sceneCount=%d, blockCount=%d, connectionCount=%d" % [report["stats"]["sceneCount"], report["stats"]["blockCount"], report["stats"]["connectionCount"]])

	if report["errors"].size() > 0:
		for e in report["errors"]:
			print("   ❌ %s: %s" % [e["code"], e["message"]])
		quit(1)
		return

	# on peut changer les locales on the fly
	engine.set_locale("fr")

	# on ajoute l'algorithme de résolution de personnage
	engine.on_resolve_character(func(characters: Array) -> Variant:
		return characters[0] if characters.size() > 0 else null
	)

	# Unified condition resolver — evaluates game-state conditions for both choice visibility and condition blocks.
	# choice: conditions are handled internally by the engine via choice history.
	engine.on_resolve_condition(func(cond: Dictionary) -> bool:
		print("◽on_resolve_condition: %s %s %s" % [cond.get("key", ""), cond.get("operator", ""), cond.get("value", "")])
		var key: String = cond.get("key", "")
		var parts: PackedStringArray = key.split(".")
		if parts.size() == 2 and parts[0] == "VariableGlobal":
			match parts[1]:
				"key1": return true
				"key2": return false
		return true
	)

	# ─── 4 Required Handlers ──────────────────────────────────────────────

	engine.on_dialog(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var ctx: Variant = args["context"]
		var ch: Variant = ctx.character
		var text: Variant = LsdeUtils.get_localized_text(block.get("dialogueText"))

		print("\n💬 DIALOG  %s" % block.get("label", ""))
		print("   🎭 %s %s [%s]" % [
			ch.get("name", "") if ch != null else "",
			ch.get("id", "") if ch != null else "",
			ch.get("emotion", "") if ch != null else ""
		])
		print("   📝 \"%s\"" % (text if text != null else "—"))

		var np: Variant = block.get("nativeProperties")
		if np is Dictionary and np.get("portPerCharacter", false) and ch != null:
			print("   🔀 resolveCharacterPort: %s" % ch.get("uuid", ""))
			ctx.resolve_character_port(ch.get("uuid", ""))
		args["next"].call()
		var lbl: String = block.get("label", block.get("uuid", "").left(8))
		return func() -> void: print("   🧹 cleanup: %s" % lbl)
	)

	engine.on_choice(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var ctx: Variant = args["context"]
		var choices: Array = ctx.choices

		# choices are tagged with "visible" by the engine (set_choice_filter installed above)
		var visible: Array = []
		for c in choices:
			if c.get("visible") != false:
				visible.append(c)
		var timeout: Variant = null
		var np: Variant = block.get("nativeProperties")
		if np is Dictionary and np.has("timeout"):
			timeout = np.get("timeout")
		# le moteur de jeux decidera quel visible choix est actif par default
		var active: Variant = visible[0] if visible.size() > 0 else null

		print("\n❓ CHOICE  %s — %d/%d choices visible" % [block.get("label", ""), visible.size(), choices.size()])
		for choice in visible:
			var text: Variant = LsdeUtils.get_localized_text(choice.get("dialogueText"))
			var is_active: bool = (choice == active)
			var lbl: String = choice.get("label", choice.get("uuid", "").left(8))
			print("   👉 %s: \"%s\"%s" % [lbl, text if text != null else "—", " (active)" if is_active else ""])

		if timeout != null:
			print("💌timeout: %s" % str(timeout))
			if active != null:
				print("   ✅ selecting: %s" % active.get("label", active.get("uuid", "").left(8)))
				ctx.select_choice(active["uuid"])
			args["next"].call()
		else:
			if active != null:
				print("   ✅ selecting: %s" % active.get("label", active.get("uuid", "").left(8)))
				ctx.select_choice(active["uuid"])
			args["next"].call()

		var lbl: String = block.get("label", block.get("uuid", "").left(8))
		return func() -> void: print("   🧹 cleanup: %s" % lbl)
	)

	engine.on_condition(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var ctx: Variant = args["context"]
		var condition_groups: Array = ctx.condition_groups
		var np: Variant = block.get("nativeProperties")
		var is_dispatcher: bool = np is Dictionary and np.get("enableDispatcher", false)

		for i in range(condition_groups.size()):
			var g: Variant = condition_groups[i]
			for cond in g.get("conditions", []) if g is Dictionary else g.conditions:
				var port_idx: Variant = g.get("port_index", i) if g is Dictionary else g.port_index
				var res: Variant = g.get("result", null) if g is Dictionary else g.result
				print("   [case %d] %d key:%s %s %s → %s" % [i, port_idx, cond.get("key", ""), cond.get("operator", ""), cond.get("value", ""), str(res)])

		# Derive result from pre-evaluated groups
		var matched: Array = []
		for g in condition_groups:
			var res: Variant = g.get("result", false) if g is Dictionary else g.result
			var port_idx: Variant = g.get("port_index", 0) if g is Dictionary else g.port_index
			if res:
				matched.append(port_idx)

		var result: Variant = matched if is_dispatcher else (matched[0] if matched.size() > 0 else -1)

		print("\n🔀 CONDITION  %s — %d groups%s → %s" % [
			block.get("label", ""), condition_groups.size(),
			" [DISPATCHER]" if is_dispatcher else "", str(result)])
		ctx.resolve(result)
		args["next"].call()
		return Callable()
	)

	engine.on_action(func(args: Dictionary) -> Callable:
		var block: Dictionary = args["block"]
		var actions: Array = block.get("actions", [])
		print("\n⚡ ACTION  %s — %d actions" % [block.get("label", ""), actions.size()])
		for a in actions:
			var params_str: String = ", ".join(a.get("params", []).map(func(p: Variant) -> String: return str(p)))
			print("   🎯 %s(%s)" % [a.get("actionId", ""), params_str])
		args["context"].resolve()
		args["next"].call()
		var lbl: String = block.get("label", block.get("uuid", "").left(8))
		return func() -> void: print("   🧹 cleanup: %s" % lbl)
	)

	# ─── Optional Handlers ────────────────────────────────────────────────

	engine.on_before_block(func(args: Dictionary) -> void:
		var np: Variant = args["context"].get("nativeProperties")
		if np is Dictionary and np.has("delay"):
			print("   ⏳ before: %s delay=%ss" % [args["block"].get("label", ""), str(np["delay"])])
		args["resolve"].call()
	)

	engine.on_scene_enter(func(args: Dictionary) -> void:
		print("\n🟢 ━━━ Scene Enter ━━━  running=%s" % str(args["scene"].is_running()))
	)

	engine.on_scene_exit(func(_args: Dictionary) -> void:
		print("🔴 ━━━ Scene Exit ━━━\n")
	)

	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		if args.get("fromBlock") != null:
			var next_ctx: Variant = args.get("nextContext")
			var char_name: String = "none"
			if next_ctx is Dictionary and next_ctx.get("character") != null:
				char_name = next_ctx["character"].get("name", "none")
			print("   ✔️  validate: %s → %s (char: %s)" % [args["fromBlock"].get("label", ""), args["nextBlock"].get("label", ""), char_name])
		return {"valid": true}
	)

	engine.on_invalidate_block(func(args: Dictionary) -> void:
		print("   ❌ INVALIDATED: %s" % args["reason"])
		args["scene"].cancel()
	)

	# ─── Run ──────────────────────────────────────────────────────────────

	var scenes: Array = blueprint.get("scenes", [])
	if scenes.size() == 0:
		print("No scenes.")
		quit(0)
		return

	print("\n🚀 Launching scene: %s" % scenes[0].get("label", ""))

	var handle: LsdeSceneHandle = engine.scene(scenes[0]["uuid"])
	handle.start()

	# ─── Summary ──────────────────────────────────────────────────────────

	var visited_labels: Array = []
	for uuid in handle.get_visited_blocks():
		var lbl: String = uuid.left(8)
		for s in scenes:
			for b in s.get("blocks", []):
				if b.get("uuid", "") == uuid:
					lbl = b.get("label", lbl)
					break
		visited_labels.append(lbl)
	print("\n📋 Visited: %s" % ", ".join(visited_labels))

	# Choice history
	var history_entries: Array = []
	for block_uuid in handle.get_choice_history():
		history_entries.append("%s: [%s]" % [block_uuid, ", ".join(handle.get_choice_history()[block_uuid])])
	print("📊 Choice History: {%s}" % ", ".join(history_entries))
	print("🏁 Engine running: %s" % str(engine.is_running()))

	quit(0)

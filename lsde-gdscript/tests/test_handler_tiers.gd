## LSDE Dialog Engine — the three tiers of handlers (port of the "handler tiers" and "handlers"
## suites of scene-handle.test.ts and engine.test.ts)
##
##   handle.on_block(id) / on_dialog_id(id) …     most specific
##     ↓ unless context.prevent_global_handler()
##   handle.on_dialog / on_choice / …             Tier 2 — this scene
##     ↓ unless context.prevent_global_handler()
##   engine.on_dialog / on_choice / …             Tier 1 — global
##
## Without prevent_global_handler() both fire in sequence: scene first, then global. These rules
## were implemented in every runtime and pinned by the reference alone.
extends RefCounted

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

# ─── Helpers ──────────────────────────────────────────────────────────────

func _assert_eq(actual: Variant, expected: Variant, label: String) -> void:
	_total += 1
	if typeof(actual) == typeof(expected) and actual == expected:
		_passed += 1
	else:
		_failed += 1
		print("  FAIL: %s — expected %s got %s" % [label, str(expected), str(actual)])

static func _dialog(id: String, next: Array = []) -> Dictionary:
	return {"id": id, "key": "__blueprints__.s1." + id, "type": LsdeTypes.BLOCK_DIALOG, "next": next}

static func _link(to: String) -> Dictionary:
	return {"port": "out", "to": to, "toPort": "in"}

static func _one_scene(blocks: Array) -> Dictionary:
	return {
		"format": LsdeTypes.SUPPORTED_FORMAT,
		"version": LsdeTypes.SUPPORTED_VERSION,
		"generator": {"app": "LSDE", "version": "2.0.3"},
		"exportedAt": "2026-09-07T00:00:00.000Z",
		"project": "Test",
		"locales": ["en"],
		"referenceLocale": "en",
		"dictionaries": [], "functions": [], "cards": [],
		"scenes": [{
			"scene": "s1",
			"id": "sc_test0001",
			"start": blocks[0]["id"] if blocks.size() > 0 else null,
			"blocks": blocks,
		}],
	}

static func _two_lines() -> Dictionary:
	return _one_scene([_dialog("b1", [_link("b2")]), _dialog("b2")])

func _engine(data: Dictionary) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	return engine

# ─── The cases ────────────────────────────────────────────────────────────

func _test_runs_the_scene_handler_then_the_global_one() -> void:
	var order: Array = []
	var engine := _engine(_one_scene([_dialog("b1")]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		order.append("global"); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.on_dialog(func(args: Dictionary) -> Variant:
		order.append("scene"); args["next"].call(); return null)
	handle.start()

	_assert_eq(order, ["scene", "global"], "scene first, then global")

func _test_prevent_global_handler_stops_the_global_one() -> void:
	var order: Array = []
	var engine := _engine(_one_scene([_dialog("b1")]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		order.append("global"); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.on_dialog(func(args: Dictionary) -> Variant:
		order.append("scene")
		args["context"].prevent_global_handler()
		args["next"].call()
		return null)
	handle.start()

	_assert_eq(order, ["scene"], "the global handler is prevented")

func _test_on_block_beats_the_scene_type_handler() -> void:
	var order: Array = []
	var engine := _engine(_two_lines())
	engine.on_dialog(func(args: Dictionary) -> Variant:
		order.append("global:" + args["block"]["id"]); args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.on_dialog(func(args: Dictionary) -> Variant:
		order.append("scene:" + args["block"]["id"]); args["next"].call(); return null)
	handle.on_block("b1", func(args: Dictionary) -> Variant:
		order.append("block:" + args["block"]["id"]); args["next"].call(); return null)
	handle.start()

	# On b1 the block override IS the scene tier; the scene type handler does not run.
	_assert_eq(order, ["block:b1", "global:b1", "scene:b2", "global:b2"], "on_block wins on its block only")

func _test_on_dialog_id_targets_one_block_by_id() -> void:
	var hits: Array = []
	var engine := _engine(_two_lines())
	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.on_dialog_id("b2", func(args: Dictionary) -> Variant:
		_assert_eq(args["context"] is LsdeBlockContext.DialogContext, true, "a typed dialog context")
		hits.append(args["block"]["id"])
		args["next"].call()
		return null)
	handle.start()

	_assert_eq(hits, ["b2"], "only b2 hits the id handler")

func _test_the_last_registration_wins() -> void:
	var order: Array = []
	var engine := _engine(_one_scene([_dialog("b1")]))
	engine.on_dialog(func(args: Dictionary) -> Variant:
		order.append("first"); args["next"].call(); return null)
	engine.on_dialog(func(args: Dictionary) -> Variant:
		order.append("second"); args["next"].call(); return null)

	engine.scene("s1").start()

	_assert_eq(order, ["second"], "last-write-wins per slot")

func _test_tier2_on_enter_and_on_exit_override_the_global_ones() -> void:
	var fired: Array = []
	var engine := _engine(_one_scene([_dialog("b1")]))
	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_scene_enter(func(_args: Dictionary) -> void: fired.append("global-enter"))
	engine.on_scene_exit(func(_args: Dictionary) -> void: fired.append("global-exit"))

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.on_enter(func(_args: Dictionary) -> void: fired.append("scene-enter"))
	handle.on_exit(func(_args: Dictionary) -> void: fired.append("scene-exit"))
	handle.start()

	# An override, not a cascade: the global lifecycle hooks do not fire for this scene.
	_assert_eq(fired, ["scene-enter", "scene-exit"], "Tier 2 lifecycle overrides Tier 1")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Handler Tier Tests ──")
	_test_runs_the_scene_handler_then_the_global_one()
	_test_prevent_global_handler_stops_the_global_one()
	_test_on_block_beats_the_scene_type_handler()
	_test_on_dialog_id_targets_one_block_by_id()
	_test_the_last_registration_wins()
	_test_tier2_on_enter_and_on_exit_override_the_global_ones()
	return {"passed": _passed, "failed": _failed, "total": _total}

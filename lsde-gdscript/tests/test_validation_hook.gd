## LSDE Dialog Engine — on_validate_next_block and on_before_block (port of the
## "onValidateNextBlock" and "onBeforeBlock" suites of scene-handle.test.ts)
##
## The gate is asked about the RESOLVED character of the block about to run, and told about the
## one just left. The character comes from on_resolve_character, before the gate is invoked; a
## block that cites no actor has none.
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

static func _dialog(id: String, extra: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {"id": id, "key": "__blueprints__.s1." + id, "type": LsdeTypes.BLOCK_DIALOG}
	b.merge(extra)
	return b

static func _link(to: String) -> Dictionary:
	return {"port": "out", "to": to, "toPort": "in"}

static func _one_scene(blocks: Array, cards: Array = []) -> Dictionary:
	return {
		"format": LsdeTypes.SUPPORTED_FORMAT,
		"version": LsdeTypes.SUPPORTED_VERSION,
		"generator": {"app": "LSDE", "version": "2.0.3"},
		"exportedAt": "2026-09-07T00:00:00.000Z",
		"project": "Test",
		"locales": ["en"],
		"referenceLocale": "en",
		"dictionaries": [], "functions": [], "cards": cards,
		"scenes": [{
			"scene": "s1",
			"id": "sc_test0001",
			"start": blocks[0]["id"] if blocks.size() > 0 else null,
			"blocks": blocks,
		}],
	}

## b1 cites c1 and leads to b2, which cites nobody.
static func _with_cast() -> Dictionary:
	return _one_scene(
		[_dialog("b1", {"actors": ["c1"], "next": [_link("b2")]}), _dialog("b2")],
		[{"id": "c1", "name": "kael", "role": LsdeTypes.ROLE_CHARACTERS}])

func _engine(data: Dictionary) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	engine.on_dialog(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	return engine

static func _id_of(card: Variant) -> Variant:
	return card.get("id") if card != null else null

# ─── The cases ────────────────────────────────────────────────────────────

func _test_receives_the_resolved_character_of_the_next_block() -> void:
	var seen: Array = []
	var engine := _engine(_with_cast())
	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		seen.append(_id_of(args["nextContext"]["character"]))
		return {"valid": true})

	engine.scene("s1").start()

	# b1 cites c1; b2 cites nobody.
	_assert_eq(seen, ["c1", null], "the gate sees the resolved character")

func _test_from_context_is_null_on_the_first_block() -> void:
	var from_blocks: Array = []
	var from_contexts: Array = []
	var engine := _engine(_with_cast())
	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		var from_block: Variant = args["fromBlock"]
		from_blocks.append(from_block["id"] if from_block != null else null)
		from_contexts.append(args["fromContext"] != null)
		return {"valid": true})

	engine.scene("s1").start()

	_assert_eq(from_blocks, [null, "b1"], "fromBlock is null on the first block")
	_assert_eq(from_contexts, [false, true], "fromContext is null on the first block")

func _test_from_context_carries_the_character_of_the_block_just_left() -> void:
	var from_characters: Array = []
	var engine := _engine(_with_cast())
	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		if args["fromContext"] != null:
			from_characters.append(_id_of(args["fromContext"]["character"]))
		return {"valid": true})

	engine.scene("s1").start()

	_assert_eq(from_characters, ["c1"], "fromContext carries the previous character")

func _test_on_before_block_hands_over_the_native_properties() -> void:
	var natives: Array = [null]
	var engine := _engine(_one_scene([_dialog("b1", {
		"props": {"delay": 250, "timeout": 5000, "waitInput": true, "portraitSide": "left"},
	})]))
	engine.on_before_block(func(args: Dictionary) -> void:
		natives[0] = args["context"]["nativeProperties"]
		args["resolve"].call())

	engine.scene("s1").start()

	_assert_eq(natives[0] != null, true, "natives handed over")
	if natives[0] == null:
		return
	_assert_eq(natives[0].get("delay"), 250, "delay read out of props")
	_assert_eq(natives[0].get("timeout"), 5000, "timeout read out of props")
	_assert_eq(natives[0].get("waitInput"), true, "waitInput read out of props")
	_assert_eq(natives[0].has("isAsync"), false, "an unset native is absent")
	_assert_eq(natives[0].has("portraitSide"), false, "the writer's own property is not a native")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Validation Hook Tests ──")
	_test_receives_the_resolved_character_of_the_next_block()
	_test_from_context_is_null_on_the_first_block()
	_test_from_context_carries_the_character_of_the_block_just_left()
	_test_on_before_block_hands_over_the_native_properties()
	return {"passed": _passed, "failed": _failed, "total": _total}

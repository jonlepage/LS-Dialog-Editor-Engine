## LSDE Dialog Engine — inPortPerCharacter (port of in-port-per-character.test.ts)
##
## The wire names the actor, and BOTH places that ask the game about a character must be told
## which one: the handler's context, and the on_validate_next_block gate. Passing the entry port to
## only one of them is not a cosmetic slip — a game gating on "is this character here?" was
## answered about whichever actor the whole cast produced, which for a resolver written as
## `actors[0]` is the FIRST one, every single pass.
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

static func _block(id: String, type: String, extra: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {"id": id, "key": "__blueprints__.s1." + id, "type": type}
	b.merge(extra)
	return b

static func _test(entry: String) -> Dictionary:
	return {"dict": "party", "entry": entry, "op": LsdeTypes.OP_EQUALS, "value": true}

static func _blueprint(blocks: Array, start: String) -> Dictionary:
	return {
		"format": LsdeTypes.SUPPORTED_FORMAT,
		"version": LsdeTypes.SUPPORTED_VERSION,
		"generator": {"app": "LSDE", "version": "2.0.3"},
		"exportedAt": "2026-09-07T00:00:00.000Z",
		"project": "Test",
		"locales": ["en"],
		"referenceLocale": "en",
		"dictionaries": [], "functions": [],
		"cards": [
			{"id": "l1", "name": "bran", "role": LsdeTypes.ROLE_CHARACTERS},
			{"id": "l2", "name": "ada", "role": LsdeTypes.ROLE_CHARACTERS},
		],
		"scenes": [{"scene": "s1", "id": "sc_test0001", "start": start, "blocks": blocks}],
	}

## A router whose two routes reach the SAME block through two entry ports.
static func _payload() -> Dictionary:
	var router: Dictionary = _block("ROUTER-001", LsdeTypes.BLOCK_ROUTER, {
		"cases": [{"port": "K1", "when": [_test("l1")]}, {"port": "K2", "when": [_test("l2")]}],
		"next": [
			{"port": "K1", "to": "DIALOG-009", "toPort": "l1"},
			{"port": "K2", "to": "DIALOG-009", "toPort": "l2"},
		],
	})
	var line: Dictionary = _block("DIALOG-009", LsdeTypes.BLOCK_DIALOG, {
		"actors": ["l1", "l2"],
		"props": {"isAsync": true, "inPortPerCharacter": true},
	})
	return _blueprint([router, line], "ROUTER-001")

func _engine(data: Dictionary) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	engine.on_resolve_condition(func(_test: Dictionary) -> bool: return true)
	engine.on_resolve_character(func(actors: Array) -> Variant:
		return actors[0] if actors.size() > 0 else null)
	engine.on_choice(func(args: Dictionary) -> Variant:
		args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant:
		args["next"].call(); return null)
	return engine

static func _id_of(card: Variant) -> Variant:
	return card.get("id") if card != null else null

# ─── The cases ────────────────────────────────────────────────────────────

func _test_offers_the_wired_actor_to_the_gate_and_to_the_handler() -> void:
	var gate: Array = []
	var spoke: Array = []
	var engine := _engine(_payload())
	engine.on_validate_next_block(func(args: Dictionary) -> Dictionary:
		if args["nextBlock"]["id"] == "DIALOG-009":
			gate.append(_id_of(args["nextContext"]["character"]))
		return {"valid": true})
	engine.on_dialog(func(args: Dictionary) -> Variant:
		spoke.append(_id_of(args["context"].character))
		args["next"].call()
		return null)

	engine.scene("s1").start()

	_assert_eq(spoke, ["l1", "l2"], "each pass speaks as its wire says")
	_assert_eq(gate, ["l1", "l2"], "the gate is asked about the wired actor")

func _test_the_cast_stays_whole_only_the_character_follows_the_door() -> void:
	var casts: Array = []
	var engine := _engine(_payload())
	engine.on_dialog(func(args: Dictionary) -> Variant:
		casts.append(args["context"].actors.size())
		args["next"].call()
		return null)

	engine.scene("s1").start()

	# `actors` is the list posted on the block, unchanged by the door.
	_assert_eq(casts, [2, 2], "the whole cast on every pass")

func _test_entering_through_in_names_nobody() -> void:
	var offered: Array = []
	var spoke: Array = []
	var first: Dictionary = _block("DIALOG-001", LsdeTypes.BLOCK_DIALOG, {
		"next": [{"port": "out", "to": "DIALOG-009", "toPort": "in"}],
	})
	var line: Dictionary = _block("DIALOG-009", LsdeTypes.BLOCK_DIALOG, {
		"actors": ["l1", "l2"], "props": {"inPortPerCharacter": true},
	})
	var engine := _engine(_blueprint([first, line], "DIALOG-001"))
	engine.on_resolve_character(func(actors: Array) -> Variant:
		offered.append(actors.size())
		return actors[0] if actors.size() > 0 else null)
	engine.on_dialog(func(args: Dictionary) -> Variant:
		spoke.append(_id_of(args["context"].character))
		args["next"].call()
		return null)

	engine.scene("s1").start()

	# DIALOG-001 cites nobody (0 offered); DIALOG-009 was entered through "in", so the whole cast
	# (2) is offered and the default picks the first.
	_assert_eq(offered, [0, 2], "the whole cast is offered through in")
	_assert_eq(spoke, [null, "l1"], "the default resolver takes the first")

func _test_the_game_may_answer_that_the_character_does_not_exist() -> void:
	var spoke: Array = []
	var engine := _engine(_payload())
	engine.on_resolve_character(func(_actors: Array) -> Variant: return null)
	engine.on_dialog(func(args: Dictionary) -> Variant:
		spoke.append(_id_of(args["context"].character))
		args["next"].call()
		return null)

	engine.scene("s1").start()

	# The engine ASKS; it never decides on its own. Both passes still play.
	_assert_eq(spoke, [null, null], "no character, both passes still play")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── inPortPerCharacter Tests ──")
	_test_offers_the_wired_actor_to_the_gate_and_to_the_handler()
	_test_the_cast_stays_whole_only_the_character_follows_the_door()
	_test_entering_through_in_names_nobody()
	_test_the_game_may_answer_that_the_character_does_not_exist()
	return {"passed": _passed, "failed": _failed, "total": _total}

## LSDE Dialog Engine — LsdeUtils (port of lsde-utils.test.ts and utils.test.ts)
##
## Static helpers a game calls, never hooks the engine calls: naming a block, reading a line out of
## an inline text map or out of a separate locale file, and sorting a props bag into what the engine
## acts on and what belongs to the game.
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

static func _dialog(id: String, extra: Dictionary = {}) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_DIALOG, extra)

static func _choice_test(block_id: String, option_id: String) -> Dictionary:
	return {"dict": "choice", "entry": block_id, "op": LsdeTypes.OP_EQUALS, "value": option_id}

static func _game_test(dict: String, entry: String) -> Dictionary:
	return {"dict": dict, "entry": entry, "op": LsdeTypes.OP_EQUALS, "value": true}

const LINE := {"en": "Hello", "fr": "Bonjour"}

const TABLE := {
	"reactor_breach": {
		"DIALOG-001": "Sealed.",
		"CHOICE-001": {"C1": "Open it", "C2": "Leave"},
	},
}

# ─── Naming a block ───────────────────────────────────────────────────────

func _test_uses_the_label_when_an_export_carries_one() -> void:
	_assert_eq(LsdeUtils.get_block_label(_dialog("DIALOG-007", {"label": "Vesk speaks", "note": "a note too"})),
		"Vesk speaks", "the label wins")

func _test_falls_back_to_the_designer_note() -> void:
	_assert_eq(LsdeUtils.get_block_label(_dialog("DIALOG-007", {"note": "Vesk se cache derrière le réservoir."})),
		"Vesk se cache derrière le réservoir.", "the note says more than a name would")

func _test_falls_back_to_the_id() -> void:
	_assert_eq(LsdeUtils.get_block_label(_dialog("DIALOG-007")), "DIALOG-007", "the id is already readable")

# ─── Inline texts ─────────────────────────────────────────────────────────

func _test_picks_the_locale_the_engine_was_set_to() -> void:
	LsdeUtils.locale = "fr"
	_assert_eq(LsdeUtils.get_localized_text(LINE), "Bonjour", "the engine locale")
	LsdeUtils.locale = ""

func _test_takes_a_locale_override() -> void:
	LsdeUtils.locale = "fr"
	_assert_eq(LsdeUtils.get_localized_text(LINE, "en"), "Hello", "the override wins")
	LsdeUtils.locale = ""

func _test_returns_nothing_for_a_locale_the_text_does_not_carry() -> void:
	_assert_eq(LsdeUtils.get_localized_text(LINE, "de"), null, "no such locale")

func _test_returns_nothing_when_the_block_carries_no_text() -> void:
	_assert_eq(LsdeUtils.get_localized_text(null, "en"), null, "no text at all")

func _test_answers_nothing_when_no_locale_was_ever_set() -> void:
	# push_error, where the other three runtimes throw — and nothing is read against "".
	LsdeUtils.locale = ""
	_assert_eq(LsdeUtils.get_localized_text(LINE), null, "no locale → nothing, and an error logged")

func _test_hands_the_string_over_untouched() -> void:
	# {{@a1}}, {:a2}, {{#ui.hud.label}} are the GAME's markers, in the game's own keys. The engine
	# reads structure, never the content of a text.
	_assert_eq(LsdeUtils.get_localized_text({"en": "{{@a1}} says {:a2} — {{#ui.hud.label}}"}, "en"),
		"{{@a1}} says {:a2} — {{#ui.hud.label}}", "markers and all")

# ─── Texts kept in a separate locale file ─────────────────────────────────

func _test_reads_a_line_by_scene_and_block() -> void:
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "reactor_breach", "DIALOG-001"), "Sealed.", "a plain line")

func _test_reads_one_option_of_a_choice() -> void:
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "reactor_breach", "CHOICE-001", "C2"), "Leave", "one option")

func _test_returns_nothing_for_what_is_not_there() -> void:
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "nowhere", "DIALOG-001"), null, "unknown scene")
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "reactor_breach", "DIALOG-999"), null, "unknown block")
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "reactor_breach", "CHOICE-001", "C9"), null, "unknown option")

func _test_does_not_hand_back_the_block_line_when_an_option_was_asked_for() -> void:
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "reactor_breach", "DIALOG-001", "C1"), null, "a miss, not the line")

func _test_does_not_hand_back_an_option_map_when_the_line_was_asked_for() -> void:
	_assert_eq(LsdeUtils.get_text_from_table(TABLE, "reactor_breach", "CHOICE-001"), null, "a miss, not the map")

func _test_survives_a_table_that_was_never_loaded() -> void:
	_assert_eq(LsdeUtils.get_text_from_table(null, "reactor_breach", "DIALOG-001"), null, "no table")

func _test_builds_the_key_of_a_block_and_of_one_of_its_options() -> void:
	var b: Dictionary = _block("CHOICE-001", LsdeTypes.BLOCK_CHOICE)
	_assert_eq(LsdeUtils.get_text_key(b), "__blueprints__.s1.CHOICE-001", "the block key")
	_assert_eq(LsdeUtils.get_text_key(b, "C1"), "__blueprints__.s1.CHOICE-001.C1", "the option key")

# ─── Sorting the props bag ────────────────────────────────────────────────

static func _mixed() -> Dictionary:
	return _dialog("DIALOG-001", {"props": {
		"isAsync": true, "delay": 1000, "timeout": 5000, "debug": true,
		"portraitSide": "left", "typewriterSpeed": 60, "journalEntry": "note de scène",
	}})

func _test_pulls_out_what_the_engine_acts_on() -> void:
	_assert_eq(LsdeUtils.get_native_properties(_mixed()),
		{"isAsync": true, "delay": 1000, "timeout": 5000, "debug": true}, "the natives")

func _test_leaves_the_designer_their_own_properties() -> void:
	_assert_eq(LsdeUtils.get_custom_properties(_mixed()),
		{"portraitSide": "left", "typewriterSpeed": 60, "journalEntry": "note de scène"}, "the rest")

func _test_handles_a_block_with_no_props_at_all() -> void:
	_assert_eq(LsdeUtils.get_native_properties(_dialog("DIALOG-002")), {}, "no natives")
	_assert_eq(LsdeUtils.get_custom_properties(_dialog("DIALOG-002")), {}, "no custom")

func _test_knows_wait_for_blocks_is_a_native_even_though_it_holds_a_list() -> void:
	var waiting: Dictionary = _dialog("DIALOG-003", {"props": {"waitForBlocks": ["DIALOG-012"]}})
	_assert_eq(LsdeUtils.get_native_properties(waiting).get("waitForBlocks"), ["DIALOG-012"], "a list native")
	_assert_eq(LsdeUtils.get_custom_properties(waiting), {}, "nothing custom")

func _test_knows_the_ten_natives_and_nothing_else() -> void:
	var all: Dictionary = _dialog("DIALOG-004", {"props": {
		"isAsync": true, "delay": 1, "timeout": 2, "waitInput": true, "debug": true,
		"portPerCharacter": true, "inPortPerCharacter": true, "skipIfMissingActor": true,
		"portPerCase": true, "waitForBlocks": ["X"],
		"somethingElse": "mine",
	}})
	_assert_eq(LsdeUtils.get_native_properties(all).size(), 10, "ten natives")
	_assert_eq(LsdeTypes.NATIVE_PROPERTY_IDS.size(), 10, "ten ids")
	_assert_eq(LsdeUtils.get_custom_properties(all), {"somethingElse": "mine"}, "one custom")

# ─── Condition helpers ────────────────────────────────────────────────────

func _test_recognises_a_test_that_reads_a_past_answer() -> void:
	_assert_eq(LsdeUtils.is_choice_condition(_choice_test("CHOICE-001", "C1")), true, "a choice test")
	_assert_eq(LsdeUtils.is_choice_condition(_game_test("switches", "door_unlocked")), false, "a game test")

func _test_names_the_choice_block_a_choice_test_reads() -> void:
	_assert_eq(LsdeUtils.get_choice_condition_block_id(_choice_test("CHOICE-001", "C1")), "CHOICE-001", "the block")
	_assert_eq(LsdeUtils.get_choice_condition_block_id(_game_test("switches", "x")), null, "nothing for a game test")

func _test_re_exposes_the_evaluation_helpers() -> void:
	var always: Callable = func(_t: Dictionary) -> bool: return true
	_assert_eq(LsdeUtils.evaluate_condition_chain(null, always), true, "chain")
	_assert_eq(LsdeUtils.evaluate_condition_cases([{"port": "K1"}], true, always), "K1", "cases")
	_assert_eq(LsdeUtils.evaluate_each_case([{"port": "K1"}], always), [true], "each case")
	_assert_eq(LsdeUtils.tag_option_visibility([{"id": "C1", "key": "k"}], always)[0].get("visible"), true, "tagging")

func _test_re_exposes_the_router_reading_of_the_same_cases() -> void:
	# Every true case, then the continuation LAST: then when they all held, catch otherwise.
	var cases: Array = [{"port": "K1"}, {"port": "K2"}]
	_assert_eq(LsdeUtils.pick_router_ports(cases, [true, true]), ["K1", "K2", "then"], "all held → then")
	_assert_eq(LsdeUtils.pick_router_ports(cases, [true, false]), ["K1", "catch"], "one did not → catch")
	_assert_eq(LsdeUtils.pick_router_ports([], []), ["then"], "no case → then")

# ─── Type guards ──────────────────────────────────────────────────────────

func _test_the_guards_narrow_by_the_lowercase_type_name() -> void:
	_assert_eq(LsdeUtils.is_dialog_block(_dialog("DIALOG-001")), true, "dialog")
	_assert_eq(LsdeUtils.is_choice_block(_block("CHOICE-001", LsdeTypes.BLOCK_CHOICE)), true, "choice")
	_assert_eq(LsdeUtils.is_condition_block(_block("COND-001", LsdeTypes.BLOCK_CONDITION)), true, "condition")
	_assert_eq(LsdeUtils.is_router_block(_block("ROUTER-001", LsdeTypes.BLOCK_ROUTER)), true, "router")
	_assert_eq(LsdeUtils.is_action_block(_block("ACTION-001", LsdeTypes.BLOCK_ACTION)), true, "action")
	_assert_eq(LsdeUtils.is_note_block(_block("NOTE-001", LsdeTypes.BLOCK_NOTE)), true, "note")

	# A router carries the same cases as a condition and is NOT one.
	_assert_eq(LsdeUtils.is_condition_block(_block("ROUTER-001", LsdeTypes.BLOCK_ROUTER)), false, "a router is not a condition")
	_assert_eq(LsdeUtils.is_router_block(_block("COND-001", LsdeTypes.BLOCK_CONDITION)), false, "a condition is not a router")
	_assert_eq(LsdeUtils.is_dialog_block(_block("CHOICE-001", LsdeTypes.BLOCK_CHOICE)), false, "a choice is not a dialog")

func _test_matches_no_guard_for_a_v1_uppercase_type() -> void:
	var v1: Dictionary = _block("DIALOG-001", "DIALOG")
	_assert_eq(LsdeUtils.is_dialog_block(v1), false, "DIALOG is not dialog")
	_assert_eq(LsdeUtils.is_note_block(v1), false, "nor anything else")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── LsdeUtils Tests ──")
	_test_uses_the_label_when_an_export_carries_one()
	_test_falls_back_to_the_designer_note()
	_test_falls_back_to_the_id()
	_test_picks_the_locale_the_engine_was_set_to()
	_test_takes_a_locale_override()
	_test_returns_nothing_for_a_locale_the_text_does_not_carry()
	_test_returns_nothing_when_the_block_carries_no_text()
	_test_answers_nothing_when_no_locale_was_ever_set()
	_test_hands_the_string_over_untouched()
	_test_reads_a_line_by_scene_and_block()
	_test_reads_one_option_of_a_choice()
	_test_returns_nothing_for_what_is_not_there()
	_test_does_not_hand_back_the_block_line_when_an_option_was_asked_for()
	_test_does_not_hand_back_an_option_map_when_the_line_was_asked_for()
	_test_survives_a_table_that_was_never_loaded()
	_test_builds_the_key_of_a_block_and_of_one_of_its_options()
	_test_pulls_out_what_the_engine_acts_on()
	_test_leaves_the_designer_their_own_properties()
	_test_handles_a_block_with_no_props_at_all()
	_test_knows_wait_for_blocks_is_a_native_even_though_it_holds_a_list()
	_test_knows_the_ten_natives_and_nothing_else()
	_test_recognises_a_test_that_reads_a_past_answer()
	_test_names_the_choice_block_a_choice_test_reads()
	_test_re_exposes_the_evaluation_helpers()
	_test_re_exposes_the_router_reading_of_the_same_cases()
	_test_the_guards_narrow_by_the_lowercase_type_name()
	_test_matches_no_guard_for_a_v1_uppercase_type()
	return {"passed": _passed, "failed": _failed, "total": _total}

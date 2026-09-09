## LSDE Dialog Engine — Public utilities for game developers
##
## Static helpers, never hooks. Nothing here is called by the engine: a game calls them, with data
## it already has. That distinction is the whole point of the file — the engine reads STRUCTURE and
## never the content of a text, so anything to do with reading a line lives out here.
##
## Which is also why an on_resolve_text callback does not exist and will not. A callback is how the
## engine ASKS for something it needs; it never needs a line. It does not display it, measure it or
## validate it. The handler already has the block — it looks its text up wherever it keeps it.
class_name LsdeUtils
extends RefCounted

## Active locale code, synced by engine.set_locale(). Used as the default by the text helpers.
static var locale: String = ""

# ─── Type Guards ─────────────────────────────────────────────────────────────
#
# v2 block types are LOWERCASE strings. A payload still carrying "DIALOG" matches no guard at all,
# which is the point: a casing mismatch used to route silently, a name does not.

static func is_dialog_block(block: Dictionary) -> bool:
	return block.get("type", "") == LsdeTypes.BLOCK_DIALOG

static func is_choice_block(block: Dictionary) -> bool:
	return block.get("type", "") == LsdeTypes.BLOCK_CHOICE

static func is_condition_block(block: Dictionary) -> bool:
	return block.get("type", "") == LsdeTypes.BLOCK_CONDITION

static func is_router_block(block: Dictionary) -> bool:
	return block.get("type", "") == LsdeTypes.BLOCK_ROUTER

static func is_action_block(block: Dictionary) -> bool:
	return block.get("type", "") == LsdeTypes.BLOCK_ACTION

static func is_note_block(block: Dictionary) -> bool:
	return block.get("type", "") == LsdeTypes.BLOCK_NOTE

# ─── Display Helpers ─────────────────────────────────────────────────────────

## How to name a block on screen or in a log.
##
## There is no mandatory block name in v2, and none is needed: DIALOG-007 already reads better than
## the uuid it replaced. A writer's note says far more than a three-word label would, so it comes
## next; a label wins when an export carries one.
static func get_block_label(block: Dictionary) -> String:
	var label: Variant = block.get("label")
	if label is String and label != "":
		return label
	var note: Variant = block.get("note")
	if note is String and note != "":
		return note
	return block.get("id", "")

## Pick a locale out of an inline text map — block.text, or an option's.
##
## Only works when texts were exported INSIDE the payload. With the separate mode the blocks carry
## no text at all and get_text_from_table() is the one to use.
static func get_localized_text(text: Variant, locale_override: String = "") -> Variant:
	var resolved: String = locale_override if locale_override != "" else locale
	if resolved == "":
		# push_error, not assert: assert() is STRIPPED from a Godot release export, and a
		# shipped game then read every text against an empty locale and found none, with
		# nothing logged at all.
		push_error("No locale set. Call engine.set_locale() first or pass a locale parameter.")
	if text is Dictionary:
		return text.get(resolved)
	return null

## Read a line out of a loaded localization/<locale>/__blueprints__.json, for the separate text
## mode — which is what most integrations want: keeping every locale inline forces a game to load
## twenty languages to play one.
##
## The game loads the file; the engine does no IO, ever. Pass the block's scene and id, plus an
## option id for one answer of a choice.
static func get_text_from_table(
	table: Variant,
	scene: String,
	block_id: String,
	option_id: String = ""
) -> Variant:
	if not table is Dictionary:
		return null
	var blocks: Variant = table.get(scene)
	if not blocks is Dictionary:
		return null
	var entry: Variant = blocks.get(block_id)
	if entry == null:
		return null

	if entry is String:
		# A plain line. Asking for an option of a block that has none is a miss, not that line.
		return entry if option_id == "" else null

	if entry is Dictionary and option_id != "":
		return entry.get(option_id)

	return null

## The i18n key of a block, or of one option of a choice.
##
## The key is already in the payload (block.key), so this only builds the option variant — useful
## for a voice file, whose name is derived from the key.
static func get_text_key(block: Dictionary, option_id: String = "") -> String:
	var key: String = block.get("key", "")
	return key if option_id == "" else key + "." + option_id

# ─── Properties ──────────────────────────────────────────────────────────────

## The properties the ENGINE acts on, pulled out of a block's props.
##
## v2 puts natives and the writer's own properties in one bag, keyed by bare id, and ids cannot
## collide — LSDE refuses a project property that takes a native name. So this is a lookup against
## LsdeTypes.NATIVE_PROPERTY_IDS, not a guess.
##
## [b]delay and timeout are MILLISECONDS.[/b] They were seconds in v1 and nothing reports the
## change at runtime: a migrated project turns a 3-second pause into 3 ms.
static func get_native_properties(block: Dictionary) -> Dictionary:
	var props: Variant = block.get("props")
	var natives: Dictionary = {}
	if not props is Dictionary:
		return natives
	for id in LsdeTypes.NATIVE_PROPERTY_IDS:
		if props.has(id):
			natives[id] = props[id]
	return natives

## The properties the WRITER declared, with the natives taken out — everything the game is free to
## give its own meaning to.
static func get_custom_properties(block: Dictionary) -> Dictionary:
	var props: Variant = block.get("props")
	var custom: Dictionary = {}
	if not props is Dictionary:
		return custom
	for key in props.keys():
		if not key in LsdeTypes.NATIVE_PROPERTY_IDS:
			custom[key] = props[key]
	return custom

# ─── Condition Helpers ───────────────────────────────────────────────────────

## Does this test read a past answer of the player rather than game state?
##
## "choice" is a reserved dictionary id that no project dictionary may take: entry is a CHOICE
## block id of this scene, value an option id of that block. The engine answers these from its own
## history, so a game never has to remember what it already told the engine.
static func is_choice_condition(test: Dictionary) -> bool:
	return LsdeConditionEvaluator.is_choice_test(test)

## The CHOICE block a "choice" test reads, or null for any other test.
static func get_choice_condition_block_id(test: Dictionary) -> Variant:
	if test.get("dict", "") == LsdeTypes.DICT_CHOICE:
		return test.get("entry")
	return null

## Evaluate a chain of tests left to right, with NO operator precedence.
## Absent or empty means true — which is how "always" is written in v2.
static func evaluate_condition_chain(tests: Variant, evaluator: Callable) -> bool:
	return LsdeConditionEvaluator.evaluate_condition_chain(tests, evaluator)

## The exit port of a condition block: "out"/"default" in if mode, K1… with portPerCase.
## Replaces the v1 evaluate_condition_groups, which returned an index and had a third, dispatcher
## mode that no longer exists.
static func evaluate_condition_cases(cases: Array, port_per_case: bool, evaluator: Callable) -> String:
	return LsdeConditionEvaluator.evaluate_condition_cases(cases, port_per_case, evaluator)

## Each case on its own, in order — to show what matched without changing where the flow goes.
static func evaluate_each_case(cases: Array, evaluator: Callable) -> Array:
	return LsdeConditionEvaluator.evaluate_each_case(cases, evaluator)

## The exits of a ROUTER, from case results already computed: the port of every true case, then
## "then" when they all held or "catch" when one did not — always last. The router's reading of
## the same cases a condition carries.
static func pick_router_ports(cases: Array, results: Array) -> Array:
	return LsdeConditionEvaluator.pick_router_ports(cases, results)

## Tag every option of a choice with whether its `when` holds, returning them ALL.
## Replaces the v1 filter_visible_choices, which shortened the list and took away the ability to
## show a locked answer.
static func tag_option_visibility(options: Array, evaluator: Variant) -> Array:
	return LsdeConditionEvaluator.tag_option_visibility(options, evaluator)

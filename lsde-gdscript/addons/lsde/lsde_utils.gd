## LSDE Dialog Engine — Public utilities for game developers
class_name LsdeUtils
extends RefCounted

## Active locale code, synced by engine.set_locale().
## Used as default by get_localized_text().
static var locale: String = ""

# ─── Type Guards ─────────────────────────────────────────────────────────────

## Returns true if the block is a DIALOG block.
static func is_dialog_block(block: Dictionary) -> bool:
	return block.get("type", "") == "DIALOG"

## Returns true if the block is a CHOICE block.
static func is_choice_block(block: Dictionary) -> bool:
	return block.get("type", "") == "CHOICE"

## Returns true if the block is a CONDITION block.
static func is_condition_block(block: Dictionary) -> bool:
	return block.get("type", "") == "CONDITION"

## Returns true if the block is an ACTION block.
static func is_action_block(block: Dictionary) -> bool:
	return block.get("type", "") == "ACTION"

## Returns true if the block is a NOTE block.
static func is_note_block(block: Dictionary) -> bool:
	return block.get("type", "") == "NOTE"

# ─── Display Helpers ─────────────────────────────────────────────────────────

## Returns the block's label, or the first 8 characters of its UUID as fallback.
static func get_block_label(block: Dictionary) -> String:
	var lbl: Variant = block.get("label")
	if lbl is String and lbl != "":
		return lbl
	var uuid: String = block.get("uuid", "")
	return uuid.left(8) if uuid.length() >= 8 else uuid

## Looks up a localized text value from a dialogueText dictionary.
## Works with both DialogBlock.dialogueText and ChoiceItem.dialogueText.
## Uses the engine locale (set via set_locale()) by default.
## Returns null if not found. Asserts if no locale is set.
static func get_localized_text(dialogue_text: Variant, locale_override: String = "") -> Variant:
	var resolved_locale: String = locale_override if locale_override != "" else locale
	assert(resolved_locale != "", "No locale set. Call engine.set_locale() first or pass a locale parameter.")
	if dialogue_text is Dictionary:
		return dialogue_text.get(resolved_locale)
	return null

# ─── Condition Helpers ───────────────────────────────────────────────────────

## Returns true if the condition references a previous choice selection.
## Choice conditions use the key format "choice:<blockUuid>".
static func is_choice_condition(condition: Dictionary) -> bool:
	return condition.get("key", "").begins_with("choice:")

## Extracts the referenced choice block UUID from a choice condition.
## Returns null if not a choice condition.
static func get_choice_condition_block_uuid(condition: Dictionary) -> Variant:
	var key: String = condition.get("key", "")
	if key.begins_with("choice:"):
		return key.substr(7)
	return null

## Evaluates a chain of conditions with & (AND) / | (OR) chaining.
## Left-to-right evaluation, no operator precedence. Empty array returns true.
static func evaluate_condition_chain(conditions: Array, evaluator: Callable) -> bool:
	return LsdeConditionEvaluator.evaluate_condition_chain(conditions, evaluator)

## Evaluate 2D condition groups. Returns int (switch) or Array of int (dispatcher).
static func evaluate_condition_groups(groups: Array, evaluator: Callable, dispatcher: bool = false) -> Variant:
	return LsdeConditionEvaluator.evaluate_condition_groups(groups, evaluator, dispatcher)

## Filters choice items by their visibility conditions.
## Choices without conditions are always visible.
## When scene is provided, choice: conditions are resolved automatically via the scene's
## internal choice history — the developer never sees them. Only non-choice conditions
## are delegated to the evaluator callback.
static func filter_visible_choices(choices: Array, evaluator: Callable, scene: Variant = null) -> Array:
	return LsdeConditionEvaluator.filter_visible_choices(choices, evaluator, scene)

## LSDE Dialog Engine — Context factory per block type
##
## A context is what a handler is handed alongside its block: the resolved cards, and the few
## methods that let the game answer back. Everything the engine needs to hear from a handler comes
## back through here, which is why each context keeps its answer in a field the traversal reads
## once the handler returns.
##
## Two v1 habits are gone from this file:
##
## [b]Actors are card ids now.[/b] A block cites ["var1"], not a copy of the character. The ids are
## resolved through the export's cards table before the context is built, and the WHOLE list is
## handed over — the engine does not elect a first one, because LSDE deliberately refuses to say
## whether the order means "who speaks" or "who is present". That belongs to the game.
##
## [b]The emotion belongs to the block.[/b] It used to sit on each character, so two actors saying
## one sentence meant writing the same feeling twice, with nothing stopping them from drifting
## apart.
class_name LsdeBlockContext
extends RefCounted

## Look up a block's actors and emotion in the export's card table.
##
## An id with no card is dropped rather than reported: a payload citing a card that is not in its
## own tables is an exporter bug, and the traversal is not where a game should learn about it —
## init() is.
##
## inPortPerCharacter: when the wire named ONE actor, [code]designated_actor_id[/code] is that card
## id and it is the only one offered to [code]pick_character[/code]. The game is still asked — it
## may answer null, which says the character does not exist — but it cannot pick a different one,
## and [code]actors[/code] stays the whole cast either way.
##
## Returns { actors: Array, emotion: Variant, character: Variant }.
static func resolve_cards(
	block: Dictionary,
	lookup: Callable,
	pick_character: Variant,
	designated_actor_id: Variant = null
) -> Dictionary:
	var actors: Array = []
	for id in block.get("actors", []):
		var card: Variant = lookup.call(id)
		if card != null:
			actors.append(card)

	var emotion: Variant = null
	var emotion_id: Variant = block.get("emotion")
	if emotion_id is String and emotion_id != "":
		emotion = lookup.call(emotion_id)

	var character: Variant = null
	if pick_character is Callable and pick_character.is_valid():
		var offered: Array = actors
		if designated_actor_id != null:
			offered = []
			for card in actors:
				if card.get("id") == designated_actor_id:
					offered.append(card)
		character = pick_character.call(offered)

	return {"actors": actors, "emotion": emotion, "character": character}

## What every context carries, whatever the block type.
class BaseContext extends RefCounted:
	## When true, the global (Tier 1) handler will be skipped.
	var global_prevented: bool = false
	## The actor on_resolve_character picked for this block, or null.
	var character: Variant = null
	## Every card the block cites, resolved through the cards table, in file order.
	var actors: Array = []
	## The emotion of the BLOCK, resolved through cards — the tone of the line, not of a speaker.
	var emotion: Variant = null
	## How strongly, when the writer set an emotion. Passed through untouched.
	var intensity: Variant = null

	func _init(block: Dictionary, cards: Dictionary) -> void:
		character = cards.get("character")
		actors = cards.get("actors", [])
		emotion = cards.get("emotion")
		intensity = block.get("intensity")

	## Stop the global (Tier 1) handler from running after this scene handler.
	func prevent_global_handler() -> void:
		global_prevented = true

## Context for DIALOG block handlers.
class DialogContext extends BaseContext:
	## The card id whose port to take, or null for "out".
	var actor_port: Variant = null
	var _cited: Array = []

	func _init(block: Dictionary, cards: Dictionary) -> void:
		super(block, cards)
		# The port of an actor IS its card id — var1, the same string block.actors lists. Only an
		# id the block actually cites can pick a port; anything else falls through to "out".
		_cited = block.get("actors", [])

	## With portPerCharacter, name the actor whose port the flow should take.
	## Takes a CARD ID (var1), never an index.
	func resolve_character_port(card_id: String) -> void:
		actor_port = card_id if card_id in _cited else null

## Context for CHOICE block handlers.
class ChoiceContext extends BaseContext:
	## The option id the player picked. It is also the port the flow leaves by.
	var selected_option_id: Variant = null
	## EVERY option of the block, tagged. Not a shortened list.
	var options: Array = []
	var _block_id: String = ""
	var _on_choice_selected: Callable

	func _init(
		block: Dictionary,
		cards: Dictionary,
		tagged_options: Array,
		on_choice_selected: Callable = Callable()
	) -> void:
		super(block, cards)
		options = tagged_options
		_block_id = block.get("id", "")
		_on_choice_selected = on_choice_selected

	## Pick an option by its id (C1). That id is also the port the flow leaves by.
	func select_choice(option_id: String) -> void:
		selected_option_id = option_id
		# Recorded even for an option that does not exist: the history is what the reserved
		# "choice" dictionary reads back, and silently dropping an answer would make a later
		# condition lie about what the player did.
		if _on_choice_selected.is_valid():
			_on_choice_selected.call(_block_id, option_id)

## Context for CONDITION block handlers.
class ConditionContext extends BaseContext:
	## The exit port. Pre-filled from the cases; a handler may override it with resolve().
	var condition_port: Variant = null
	## The block's cases, each with its port and its pre-evaluated result.
	var cases: Array = []

	func _init(block: Dictionary, cards: Dictionary, runtime_cases: Array) -> void:
		super(block, cards)
		cases = runtime_cases

	## Override the exit port. Takes a PORT NAME: "out", "default", or a case port (K1).
	##
	## v1 took a bool, an int or an Array — three shapes for one method, the third being the
	## dispatcher. Both are gone: a condition picks one path.
	func resolve(port: String) -> void:
		condition_port = port

## Context for ROUTER block handlers.
##
## No resolve. By the time a handler could speak, every true case has launched its port and the
## continuation is picked — there is no single exit left to override. The handler is an
## observation point, which is why the type requires none at all: the engine dispatches nothing and
## advances on its own. A game that wants to watch one router still can, through on_block(id).
class RouterContext extends BaseContext:
	## Every port the block leaves by, the continuation last. See pick_router_ports.
	var router_ports: Variant = null
	## The block's cases, each with its port and its pre-evaluated result. ALL of them ran.
	var cases: Array = []

	func _init(block: Dictionary, cards: Dictionary, runtime_cases: Array) -> void:
		super(block, cards)
		cases = runtime_cases

## Context for ACTION block handlers.
class ActionContext extends BaseContext:
	## true if reject() was called, false if resolve() was called.
	var action_rejected: bool = false
	## The calls the block asks the game to run, in order, with their arguments BY NAME.
	var calls: Array = []

	func _init(block: Dictionary, cards: Dictionary) -> void:
		super(block, cards)
		calls = block.get("calls", [])

	## The calls went through. The flow leaves by "then".
	func resolve() -> void:
		action_rejected = false

	## A call failed. The flow leaves by "catch", or by "then" when no error branch was drawn.
	##
	## The error is OPTIONAL and the engine does nothing with it: routing only needs to know that
	## the call failed. Pass one if it reads better next to your own logging — nothing here reads
	## it, forwards it or logs it.
	func reject(_error: Variant = null) -> void:
		action_rejected = true

## LSDE Dialog Engine — Port resolution (critical algorithm)
##
## This function decides where the flow goes next, and it is the one piece of the engine that must
## behave identically in all four runtimes — a divergence here does not throw, it sends a player
## down the wrong branch.
##
## It routes on PORT NAMES. In v1 it routed on fromPortIndex, a position in a list, and that is the
## single change that broke the loudest: a v1 engine on a v2 payload found no connection at all on
## a dialog with per-character ports, on the true branch of a condition, on every switch case. The
## scene stopped where the player expected a branch, and nothing was logged.
##
## The ports, per block type:
## [codeblock]
##   dialog     "out", or one port per actor CARD ID with portPerCharacter — "out" is the fallback
##   choice     the picked option's id (C1…) — there is no "out" on a choice
##   condition  "out" (true) and "default" (false), or K1… per case with portPerCase
##   action     "then", and "catch" when a call failed
##   note       never dispatched; the traversal steps over it
## [/codeblock]
##
## The block decides WHICH port; this file only finds the wires on it. A port the writer left
## unwired resolves to nothing, and nothing is a legitimate end of flow — "default" is the fallback
## for "no case matched", not for "that exit has no wire".
class_name LsdePortResolver
extends RefCounted

## Pick the outgoing links to follow, given a block and what happened while it ran.
##
## Returns EVERY matching link. Deciding which one is the main track and which run in parallel
## belongs to the traversal, not here.
static func resolve_port(input: Dictionary) -> Array:
	var block: Dictionary = input.get("block", {})
	var links: Array = input.get("links", [])
	var block_type: String = block.get("type", "")

	match block_type:
		LsdeTypes.BLOCK_DIALOG:
			return _resolve_dialog_port(links, input.get("actorPort"))
		LsdeTypes.BLOCK_CHOICE:
			return _resolve_choice_port(links, input.get("selectedOptionId"))
		LsdeTypes.BLOCK_CONDITION:
			return _resolve_condition_port(links, input.get("conditionPort"))
		LsdeTypes.BLOCK_ACTION:
			return _resolve_action_port(links, input.get("actionRejected"))
		LsdeTypes.BLOCK_NOTE:
			return links.duplicate()

	# A block type this engine does not know — a v1 payload, say — routes nowhere rather than to
	# the wrong handler.
	return []

## A dialog leaves by "out".
##
## With portPerCharacter it grows one port per actor instead, named by the actor's CARD ID (var1,
## var2) — the same id [code]block.actors[/code] lists. "out" stays as the "else" exit: a dialog
## whose actor has no port of its own still goes somewhere.
static func _resolve_dialog_port(links: Array, actor_port: Variant) -> Array:
	if actor_port != null:
		var matches: Array = _on_port(links, actor_port)
		if matches.size() > 0:
			return matches
		# The actor has no port of its own — fall through to "out".
	return _on_port(links, LsdeTypes.PORT_OUT)

## A choice leaves by the id of the option the player picked — C1, C2. That id IS the port.
##
## There is no "out" and no fallback: until an option is picked there is nowhere to go, and an
## option the writer left unwired ends the flow. Both are the drawing, not an error.
static func _resolve_choice_port(links: Array, selected_option_id: Variant) -> Array:
	if selected_option_id == null:
		return []
	return _on_port(links, selected_option_id)

## A condition leaves by the port its cases picked — "out" or "default" in if mode, K1… or
## "default" with portPerCase.
##
## Which port that is was decided before we got here, by the condition evaluator: it is the only
## thing that knows the two modes and the game's answers. This function does not re-derive it.
## [code]null[/code] means nothing was decided, so nowhere to go.
static func _resolve_condition_port(links: Array, condition_port: Variant) -> Array:
	if condition_port == null:
		return []
	return _on_port(links, condition_port)

## An action leaves by "then" once its calls went through, and by "catch" when one failed.
##
## A failure with no "catch" wired falls back to "then": the writer who drew no error branch meant
## the flow to carry on, and stopping the scene on an unhandled failure would strand the player
## mid-dialogue.
static func _resolve_action_port(links: Array, action_rejected: Variant) -> Array:
	if action_rejected == true:
		var caught: Array = _on_port(links, LsdeTypes.PORT_CATCH)
		if caught.size() > 0:
			return caught
		# No error branch drawn — carry on through "then".
	return _on_port(links, LsdeTypes.PORT_THEN)

static func _on_port(links: Array, port: String) -> Array:
	var matches: Array = []
	for link in links:
		if link.get("port", "") == port:
			matches.append(link)
	return matches

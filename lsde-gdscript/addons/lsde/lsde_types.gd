## LSDE Dialog Engine — the payload contract, as names
##
## GDScript reads the payload as plain Dictionaries, so there is nothing to deserialize into: these
## constants are the names the JSON uses. Block types are LOWERCASE strings in v2 — a payload still
## carrying "DIALOG" matches nothing, which is the point.
##
## Block ids repeat between scenes. The counter restarts at 1 in every scene, so DIALOG-001
## legitimately exists in two of them: a block is identified by the pair (scene, id).
class_name LsdeTypes
extends RefCounted

## What a block is. Decides which optional fields it carries.
const BLOCK_DIALOG := "dialog"
const BLOCK_CHOICE := "choice"
const BLOCK_CONDITION := "condition"
const BLOCK_ACTION := "action"
const BLOCK_NOTE := "note"

## How a condition compares a dictionary entry to its value.
const OP_EQUALS := "equals"
const OP_NOT_EQUALS := "notEquals"
const OP_LESS_THAN := "lessThan"
const OP_LESS_OR_EQUAL := "lessOrEqual"
const OP_GREATER_THAN := "greaterThan"
const OP_GREATER_OR_EQUAL := "greaterOrEqual"

## How a comparison links to the one ABOVE it. The list is flat: precedence is yours.
const JOIN_AND := "and"
const JOIN_OR := "or"

## What a card is used for in the editor.
const ROLE_NONE := "none"
const ROLE_CHARACTERS := "characters"
const ROLE_EMOTIONS := "emotions"
const ROLE_PLACES := "places"

## The single entry port of every block.
const PORT_IN := "in"
## The default exit of a dialog, and the true exit of an if-style condition.
const PORT_OUT := "out"
## The exit of an action block once its calls succeeded.
const PORT_THEN := "then"
## The exit of an action block when a call failed.
const PORT_CATCH := "catch"
## The fallback exit of a condition block: no case matched.
const PORT_DEFAULT := "default"

## NOT a port: the reserved ConditionTest.dict that reads past answers of THIS scene.
## [code]entry[/code] is a CHOICE block id, [code]value[/code] an option id of that block. The
## engine answers it from what it recorded while the scene played; no project dictionary may take
## this id.
const DICT_CHOICE := "choice"

## The only payload this engine reads.
const SUPPORTED_FORMAT := "lsde-blueprints"
## The format version this engine reads. Bumps only when the payload contract changes.
const SUPPORTED_VERSION := 1

## The nine ids of the native properties, to sort a [code]props[/code] bag into natives and the
## writer's own properties. Anything not in here belongs to the game.
##
## Ids cannot collide — LSDE refuses a project property that takes a native name — so telling them
## apart is a lookup, not a guess. Most are inert; only [code]isAsync[/code] (spawns a parallel
## track) and [code]waitForBlocks[/code] (parks one) mean anything to the traversal.
##
## [code]delay[/code] and [code]timeout[/code] are MILLISECONDS in v2. They were seconds in v1, and
## nothing reports the difference at runtime: a migrated project turns a 3-second pause into 3 ms.
const NATIVE_PROPERTY_IDS := [
	"isAsync", "delay", "timeout", "waitInput", "debug",
	"portPerCharacter", "skipIfMissingActor", "portPerCase", "waitForBlocks",
]

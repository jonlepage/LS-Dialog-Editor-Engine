// LSDE Dialog Engine — Port resolution (critical algorithm)
//
// This function decides where the flow goes next, and it is the one piece of the engine that must
// behave identically in all four runtimes — a divergence here does not crash, it sends a player
// down the wrong branch.
//
// It routes on PORT NAMES. In v1 it routed on `fromPortIndex`, a position in a list, and that is
// the single change that broke the loudest: a v1 engine on a v2 payload found no connection at all
// on a dialog with per-character ports, on the true branch of a condition, on every switch case.
// The scene stopped where the player expected a branch, and nothing was logged.
//
// The ports, per block type:
//
//   dialog     `out`, or one port per actor CARD ID with portPerCharacter — `out` is the fallback
//   choice     the picked option's id (C1…) — there is no `out` on a choice
//   condition  `out` (true) and `default` (false), or K1… per case with portPerCase
//   action     `then`, and `catch` when a call failed
//   note       never dispatched; the traversal steps over it
//
// The block decides WHICH port; this file only finds the wires on it. A port the designer left
// unwired resolves to nothing, and nothing is a legitimate end of flow — `default` is the fallback
// for "no case matched", not for "that exit has no wire".

import type { PortResolutionInput, PortResolutionResult, Link } from './types.js';
import { BlockType, Ports } from './types.js';

const NONE: PortResolutionResult = { links: [] };

/**
 * Pick the outgoing links to follow, given a block and what happened while it ran.
 *
 * Returns **every** matching link. Deciding which one is the main track and which run in parallel
 * belongs to the traversal, not here — this function is pure and knows nothing about tracks.
 */
export function resolvePort( input: PortResolutionInput ): PortResolutionResult {
	const { block, links } = input;

	switch ( block.type ) {

		case BlockType.Dialog:
			return resolveDialogPort( links, input.actorPort );

		case BlockType.Choice:
			return resolveChoicePort( links, input.selectedOptionId );

		case BlockType.Condition:
			return resolveConditionPort( links, input.conditionPort );

		case BlockType.Action:
			return resolveActionPort( links, input.actionRejected );

		case BlockType.Note:
			return { links };

		default:
			return NONE;
	}
}

/**
 * A dialog leaves by `out`.
 *
 * With `portPerCharacter`, it grows one port per actor instead, named by the actor's CARD ID
 * (`var1`, `var2`) — the same id `block.actors` lists. `out` stays as the "else" exit: a dialog
 * whose actor has no port of its own still goes somewhere.
 */
function resolveDialogPort( links: Link[], actorPort: string | undefined ): PortResolutionResult {
	if ( actorPort !== undefined ) {
		const matches = onPort( links, actorPort );
		if ( matches.length > 0 ) return { links: matches };
		// The actor has no port of its own — fall through to `out`.
	}
	return { links: onPort( links, Ports.Out ) };
}

/**
 * A choice leaves by the id of the option the player picked — `C1`, `C2`. That id IS the port.
 *
 * There is no `out` and no fallback: until an option is picked there is nowhere to go, and an
 * option the designer left unwired ends the flow. Both are the drawing, not an error.
 */
function resolveChoicePort( links: Link[], selectedOptionId: string | undefined ): PortResolutionResult {
	if ( !selectedOptionId ) return NONE;
	return { links: onPort( links, selectedOptionId ) };
}

/**
 * A condition leaves by the port its cases picked — `out` or `default` in if mode, `K1`… or
 * `default` with `portPerCase`.
 *
 * Which port that is was decided before we got here, by the condition evaluator: it is the only
 * thing that knows the two modes and the game's answers. This function does not re-derive it.
 * `undefined` means nothing was decided — no resolver installed, no handler call — so nowhere
 * to go.
 */
function resolveConditionPort( links: Link[], conditionPort: string | undefined ): PortResolutionResult {
	if ( conditionPort === undefined ) return NONE;
	return { links: onPort( links, conditionPort ) };
}

/**
 * An action leaves by `then` once its calls went through, and by `catch` when one failed.
 *
 * A failure with no `catch` wired falls back to `then`: the designer who drew no error branch
 * meant the flow to carry on, and stopping the scene on an unhandled failure would strand the
 * player mid-dialogue.
 */
function resolveActionPort( links: Link[], actionRejected: boolean | undefined ): PortResolutionResult {
	if ( actionRejected ) {
		const caught = onPort( links, Ports.Catch );
		if ( caught.length > 0 ) return { links: caught };
		// No error branch drawn — carry on through `then`.
	}
	return { links: onPort( links, Ports.Then ) };
}

function onPort( links: Link[], port: string ): Link[] {
	return links.filter( link => link.port === port );
}

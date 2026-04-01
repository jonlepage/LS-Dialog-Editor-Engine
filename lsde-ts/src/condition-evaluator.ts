// LSDE Dialog Engine — Condition chain evaluation (AND/OR)

import type { ExportCondition, ChoiceItem } from './types.js';

/**
 * Evaluate a chain of conditions left-to-right with no operator precedence.
 * - Empty array → true (no conditions = pass)
 * - First condition: standalone result
 * - Subsequent conditions: '&' = AND, '|' = OR with accumulated result
 */
export function evaluateConditionChain(
	conditions: ExportCondition[],
	evaluator: ( condition: ExportCondition ) => boolean,
): boolean {
	if ( conditions.length === 0 ) return true;

	let result = evaluator( conditions[0]! );

	for ( let i = 1; i < conditions.length; i++ ) {
		const cond = conditions[i]!;
		const current = evaluator( cond );

		if ( cond.chain === '|' ) {
			result = result || current;
		} else {
			// '&' or undefined — default to AND
			result = result && current;
		}
	}

	return result;
}

/**
 * Evaluate condition groups (2D array) for switch or dispatcher mode.
 * Each inner array is a "case" evaluated via `evaluateConditionChain`.
 *
 * - **Switch mode** (`dispatcher = false`): evaluates groups in order, returns the index
 *   of the first matching group, or `-1` if none match (→ default port).
 * - **Dispatcher mode** (`dispatcher = true`): evaluates ALL groups, returns an array
 *   of all matching indices (may be empty → default port only).
 */
export function evaluateConditionGroups(
	groups: ExportCondition[][],
	evaluator: ( condition: ExportCondition ) => boolean,
	dispatcher?: boolean,
): number | number[] {
	if ( dispatcher ) {
		const matched: number[] = [];
		for ( let i = 0; i < groups.length; i++ ) {
			if ( evaluateConditionChain( groups[i]!, evaluator ) ) {
				matched.push( i );
			}
		}
		return matched;
	}
	// Switch mode: break at first match
	for ( let i = 0; i < groups.length; i++ ) {
		if ( evaluateConditionChain( groups[i]!, evaluator ) ) {
			return i;
		}
	}
	return -1; // no match → default port
}

/**
 * Filter choices by their visibilityConditions.
 * Choices with no conditions or passing conditions are kept.
 *
 * When `scene` is provided, `choice:` conditions are resolved automatically
 * via the scene's internal choice history — the developer never sees them.
 * Non-choice conditions are delegated to the `evaluator` callback.
 */
export function filterVisibleChoices(
	choices: ChoiceItem[],
	evaluator: ( condition: ExportCondition ) => boolean,
	scene?: { evaluateCondition( condition: ExportCondition ): boolean },
): ChoiceItem[] {
	return choices.filter( choice => {
		if ( !choice.visibilityConditions || choice.visibilityConditions.length === 0 ) {
			return true;
		}
		return evaluateConditionChain( choice.visibilityConditions, ( cond ) => {
			if ( scene && cond.key.startsWith( 'choice:' ) ) {
				return scene.evaluateCondition( cond );
			}
			return evaluator( cond );
		} );
	} );
}

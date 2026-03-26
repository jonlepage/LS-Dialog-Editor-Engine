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

// LSDE Dialog Engine — Port resolution (critical algorithm)
// Must be identical across all runtimes.
// Implementation: PLAN.md §5

import type { PortResolutionInput, PortResolutionResult, BlueprintConnection } from './types.js';

const NONE: PortResolutionResult = { connections: [] };

/**
 * Determine which outgoing connections to follow based on block type and context.
 * Returns ALL matching connections — the caller decides which are main vs async tracks.
 * @see PLAN.md §5
 */
export function resolvePort( input: PortResolutionInput ): PortResolutionResult {
	const { block, connections } = input;

	switch ( block.type ) {

		case 'DIALOG':
			return resolveDialogPort( connections, input.characterPortIndex );

		case 'CHOICE':
			return resolveChoicePort( connections, input.selectedChoiceUuid );

		case 'CONDITION':
			return resolveConditionPort( connections, input.conditionResult );

		case 'ACTION':
			return resolveActionPort( connections, input.actionRejected );

		case 'NOTE':
			return { connections };
	}
}

/**
 * DIALOG port resolution:
 * - Without portPerCharacter: all connections with `fromPort === 'out'`.
 * - With portPerCharacter: all connections with `fromPortIndex === characterIndex`.
 *   Fallback to `fromPort === 'out'` ("Else / Undefined").
 */
function resolveDialogPort(
	connections: BlueprintConnection[],
	characterPortIndex: number | undefined,
): PortResolutionResult {
	if ( characterPortIndex !== undefined ) {
		const matches = connections.filter( c => c.fromPortIndex === characterPortIndex );
		if ( matches.length > 0 ) return { connections: matches };
		// Fallback to 'out' when character port index not found
	}
	return filterByFromPort( connections, 'out' );
}

function resolveChoicePort(
	connections: BlueprintConnection[],
	selectedChoiceUuid: string | undefined,
): PortResolutionResult {
	if ( !selectedChoiceUuid ) return NONE;
	return filterByFromPort( connections, selectedChoiceUuid );
}

function resolveConditionPort(
	connections: BlueprintConnection[],
	conditionResult: boolean | undefined,
): PortResolutionResult {
	if ( conditionResult === undefined ) return NONE;
	const targetIndex = conditionResult ? 0 : 1;
	const matches = connections.filter( c => c.fromPortIndex === targetIndex );
	return { connections: matches };
}

/**
 * ACTION port resolution:
 * - Success: all connections with `fromPort === 'then'`
 * - Reject: `fromPort === 'catch'`, fallback to `then`
 */
function resolveActionPort(
	connections: BlueprintConnection[],
	actionRejected: boolean | undefined,
): PortResolutionResult {
	if ( actionRejected ) {
		const catchPorts = connections.filter( c => c.fromPort === 'catch' );
		if ( catchPorts.length > 0 ) return { connections: catchPorts };
		// Fallback to 'then' on reject when no catch port
	}
	return filterByFromPort( connections, 'then' );
}

function filterByFromPort( connections: BlueprintConnection[], port: string ): PortResolutionResult {
	const matches = connections.filter( c => c.fromPort === port );
	return { connections: matches };
}

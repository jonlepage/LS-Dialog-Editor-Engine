// LSDE Dialog Engine — Port resolution (critical algorithm)
// Must be identical across all runtimes.
// Implementation: PLAN.md §5

import type { PortResolutionInput, PortResolutionResult, BlueprintConnection } from './types.js';

const NONE: PortResolutionResult = { connection: null };

/**
 * Determine which outgoing connection to follow based on block type and context.
 * This is the deterministic core of the engine — must produce identical results in every runtime.
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
			// NOTE blocks are skipped; follow the first available connection.
			return connections.length > 0 ? { connection: connections[0]! } : NONE;
	}
}

/**
 * DIALOG port resolution:
 * - Without portPerCharacter: single `out` port.
 * - With portPerCharacter: match `fromPortIndex === characterIndex`.
 *   Character index = position in block.metadata.characters[].
 *   Fallback to `fromPort === 'out'` ("Else / Undefined").
 */
function resolveDialogPort(
	connections: BlueprintConnection[],
	characterPortIndex: number | undefined,
): PortResolutionResult {
	if ( characterPortIndex !== undefined ) {
		const match = connections.find( c => c.fromPortIndex === characterPortIndex );
		if ( match ) return { connection: match };
		// Fallback to 'out' when character port index not found
	}
	return findByFromPort( connections, 'out' );
}

function resolveChoicePort(
	connections: BlueprintConnection[],
	selectedChoiceUuid: string | undefined,
): PortResolutionResult {
	if ( !selectedChoiceUuid ) return NONE;
	return findByFromPort( connections, selectedChoiceUuid );
}

function resolveConditionPort(
	connections: BlueprintConnection[],
	conditionResult: boolean | undefined,
): PortResolutionResult {
	if ( conditionResult === undefined ) return NONE;
	const targetIndex = conditionResult ? 0 : 1;
	const match = connections.find( c => c.fromPortIndex === targetIndex );
	return match ? { connection: match } : NONE;
}

/**
 * ACTION port resolution:
 * - Success: `fromPort === 'then'`
 * - Reject: `fromPort === 'catch'`, fallback to `then`
 */
function resolveActionPort(
	connections: BlueprintConnection[],
	actionRejected: boolean | undefined,
): PortResolutionResult {
	if ( actionRejected ) {
		const catchPort = connections.find( c => c.fromPort === 'catch' );
		if ( catchPort ) return { connection: catchPort };
		// Fallback to 'then' on reject when no catch port
	}
	return findByFromPort( connections, 'then' );
}

function findByFromPort( connections: BlueprintConnection[], port: string ): PortResolutionResult {
	const match = connections.find( c => c.fromPort === port );
	return match ? { connection: match } : NONE;
}

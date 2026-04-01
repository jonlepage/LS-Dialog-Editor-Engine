// LSDE Dialog Engine — Port resolution (critical algorithm)
// Must be identical across all runtimes.

import type { PortResolutionInput, PortResolutionResult, BlueprintConnection } from './types.js';

const NONE: PortResolutionResult = { connections: [] };

/**
 * Determine which outgoing connections to follow based on block type and context.
 * Returns ALL matching connections — the caller decides which are main vs async tracks.
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

/**
 * CONDITION port resolution:
 * - `boolean` (legacy): true → fromPortIndex 0, false → fromPortIndex 1.
 * - `number[]` (dispatcher): default/false port + all matching case ports by fromPortIndex.
 * - `number >= 0` (switch match): single case port by fromPortIndex.
 * - `number < 0` (switch no-match): default/false port by fromPort name.
 */
function resolveConditionPort(
	connections: BlueprintConnection[],
	conditionResult: boolean | number | number[] | undefined,
): PortResolutionResult {
	if ( conditionResult === undefined ) return NONE;

	// boolean legacy: true → index 0, false → index 1
	if ( typeof conditionResult === 'boolean' ) {
		const idx = conditionResult ? 0 : 1;
		return { connections: connections.filter( c => c.fromPortIndex === idx ) };
	}

	// number[]: dispatcher — all matched case ports + default
	if ( Array.isArray( conditionResult ) ) {
		const indices = new Set( conditionResult );
		const defaultConns = connections.filter( c =>
			c.fromPort === 'default' || c.fromPort === 'false',
		);
		const matchedConns = connections.filter( c =>
			c.fromPortIndex !== undefined && indices.has( c.fromPortIndex ),
		);
		// default FIRST → becomes mainConnection (non-async) in advanceToNextBlock
		// matched after → become asyncConnections
		return { connections: [ ...defaultConns, ...matchedConns ] };
	}

	// number >= 0: switch mode — single case match
	if ( conditionResult >= 0 ) {
		return { connections: connections.filter( c => c.fromPortIndex === conditionResult ) };
	}

	// number < 0 (-1): no match → default/false port
	return { connections: connections.filter( c =>
		c.fromPort === 'default' || c.fromPort === 'false',
	) };
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

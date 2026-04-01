import { describe, it, expect } from 'vitest';
import { resolvePort } from './port-resolver.js';
import type { BlueprintConnection, BlueprintBlock, PortResolutionInput } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function conn( fromPort: string, toId: string, fromPortIndex?: number ): BlueprintConnection {
	return { id: `c-${ toId }`, fromId: 'src', toId, fromPort, toPort: 'in', fromPortIndex };
}

function block( type: BlueprintBlock['type'] ): BlueprintBlock {
	return { uuid: 'src', type, properties: [] } as BlueprintBlock;
}

function resolve( input: Partial<PortResolutionInput> & { block: BlueprintBlock; connections: BlueprintConnection[] } ) {
	return resolvePort( input as PortResolutionInput );
}

// ─── DIALOG ──────────────────────────────────────────────────────────────────

describe( 'resolvePort — DIALOG', () => {

	it( 'follows the "out" port', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'out', 'target' )],
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'target' );
	} );

	it( 'returns empty when no connections', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [],
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

	it( 'follows characterPortIndex when portPerCharacter', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'out', 'default' ), conn( 'char-uuid-0', 'char0-branch', 0 ), conn( 'char-uuid-1', 'char1-branch', 1 )],
			characterPortIndex: 1,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'char1-branch' );
	} );

	it( 'returns multiple connections for same portIndex (multi-track)', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'char-uuid-0', 'target-A', 0 ), conn( 'char-uuid-0b', 'target-B', 0 )],
			characterPortIndex: 0,
		} );
		expect( result.connections ).toHaveLength( 2 );
		expect( result.connections[0]?.toId ).toBe( 'target-A' );
		expect( result.connections[1]?.toId ).toBe( 'target-B' );
	} );

	it( 'falls back to "out" when characterPortIndex not found', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'out', 'default' ), conn( 'char-uuid-0', 'char0-branch', 0 )],
			characterPortIndex: 5,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'default' );
	} );

	it( 'returns empty when characterPortIndex not found and no "out" port', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'char-uuid-0', 'char0-branch', 0 )],
			characterPortIndex: 5,
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

} );

// ─── CHOICE ──────────────────────────────────────────────────────────────────

describe( 'resolvePort — CHOICE', () => {

	it( 'follows the selected choice UUID', () => {
		const result = resolve( {
			block: block( 'CHOICE' ),
			connections: [conn( 'choice-A', 'branch-A' ), conn( 'choice-B', 'branch-B' )],
			selectedChoiceUuid: 'choice-B',
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'branch-B' );
	} );

	it( 'returns empty when no selection', () => {
		const result = resolve( {
			block: block( 'CHOICE' ),
			connections: [conn( 'choice-A', 'branch-A' )],
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

	it( 'returns empty when selected choice has no matching connection', () => {
		const result = resolve( {
			block: block( 'CHOICE' ),
			connections: [conn( 'choice-A', 'branch-A' )],
			selectedChoiceUuid: 'choice-C',
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

} );

// ─── CONDITION ───────────────────────────────────────────────────────────────

describe( 'resolvePort — CONDITION', () => {

	it( 'follows port index 0 for true', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 ), conn( 'false', 'no', 1 )],
			conditionResult: true,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'yes' );
	} );

	it( 'follows port index 1 for false', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 ), conn( 'false', 'no', 1 )],
			conditionResult: false,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'no' );
	} );

	it( 'returns empty when conditionResult is undefined', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 )],
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

	it( 'returns empty when no connection matches the port index', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 )],
			conditionResult: false,
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

	// ── Switch mode (number) ────────────────────────────────────────────

	it( 'number >= 0: follows matching fromPortIndex', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'case_0', 'branch-0', 0 ), conn( 'case_1', 'branch-1', 1 ), conn( 'default', 'fallback', 2 )],
			conditionResult: 1,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'branch-1' );
	} );

	it( 'number < 0: follows default port', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'case_0', 'branch-0', 0 ), conn( 'default', 'fallback', 2 )],
			conditionResult: -1,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'fallback' );
	} );

	it( 'number < 0: follows "false" port for single-group', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 ), conn( 'false', 'no', 1 )],
			conditionResult: -1,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'no' );
	} );

	// ── Dispatcher mode (number[]) ──────────────────────────────────────

	it( 'number[]: returns default + all matched case ports', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'case_0', 'b0', 0 ), conn( 'case_1', 'b1', 1 ), conn( 'default', 'main', 2 )],
			conditionResult: [0, 1],
		} );
		expect( result.connections ).toHaveLength( 3 );
		expect( result.connections[0]?.toId ).toBe( 'main' );    // default first
		expect( result.connections[1]?.toId ).toBe( 'b0' );
		expect( result.connections[2]?.toId ).toBe( 'b1' );
	} );

	it( 'number[]: empty array returns default only', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'case_0', 'b0', 0 ), conn( 'default', 'main', 2 )],
			conditionResult: [],
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'main' );
	} );

	it( 'number[]: partial match returns default + matched', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'case_0', 'b0', 0 ), conn( 'case_1', 'b1', 1 ), conn( 'case_2', 'b2', 2 ), conn( 'default', 'main', 3 )],
			conditionResult: [0, 2],
		} );
		expect( result.connections ).toHaveLength( 3 );
		expect( result.connections[0]?.toId ).toBe( 'main' );
		expect( result.connections[1]?.toId ).toBe( 'b0' );
		expect( result.connections[2]?.toId ).toBe( 'b2' );
	} );

} );

// ─── ACTION ──────────────────────────────────────────────────────────────────

describe( 'resolvePort — ACTION', () => {

	it( 'follows "then" port on success', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [conn( 'then', 'next' ), conn( 'catch', 'error' )],
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'next' );
	} );

	it( 'follows "catch" port on reject', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [conn( 'then', 'next' ), conn( 'catch', 'error' )],
			actionRejected: true,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'error' );
	} );

	it( 'falls back to "then" on reject when no "catch" port', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [conn( 'then', 'next' )],
			actionRejected: true,
		} );
		expect( result.connections ).toHaveLength( 1 );
		expect( result.connections[0]?.toId ).toBe( 'next' );
	} );

	it( 'returns empty on reject with no connections', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [],
			actionRejected: true,
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

} );

// ─── NOTE ────────────────────────────────────────────────────────────────────

describe( 'resolvePort — NOTE', () => {

	it( 'returns all connections', () => {
		const result = resolve( {
			block: block( 'NOTE' ),
			connections: [conn( 'any', 'next' ), conn( 'other', 'alt' )],
		} );
		expect( result.connections ).toHaveLength( 2 );
	} );

	it( 'returns empty when no connections', () => {
		const result = resolve( {
			block: block( 'NOTE' ),
			connections: [],
		} );
		expect( result.connections ).toHaveLength( 0 );
	} );

} );

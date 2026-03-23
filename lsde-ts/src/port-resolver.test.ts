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
		expect( result.connection?.toId ).toBe( 'target' );
	} );

	it( 'returns null when no connections', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [],
		} );
		expect( result.connection ).toBeNull();
	} );

	it( 'follows characterPortIndex when portPerCharacter', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'out', 'default' ), conn( 'char-uuid-0', 'char0-branch', 0 ), conn( 'char-uuid-1', 'char1-branch', 1 )],
			characterPortIndex: 1,
		} );
		expect( result.connection?.toId ).toBe( 'char1-branch' );
	} );

	it( 'follows characterPortIndex 0', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'char-uuid-0', 'first-char', 0 ), conn( 'char-uuid-1', 'second-char', 1 )],
			characterPortIndex: 0,
		} );
		expect( result.connection?.toId ).toBe( 'first-char' );
	} );

	it( 'falls back to "out" when characterPortIndex not found', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'out', 'default' ), conn( 'char-uuid-0', 'char0-branch', 0 )],
			characterPortIndex: 5, // no such index
		} );
		expect( result.connection?.toId ).toBe( 'default' );
	} );

	it( 'returns null when characterPortIndex not found and no "out" port', () => {
		const result = resolve( {
			block: block( 'DIALOG' ),
			connections: [conn( 'char-uuid-0', 'char0-branch', 0 )],
			characterPortIndex: 5,
		} );
		expect( result.connection ).toBeNull();
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
		expect( result.connection?.toId ).toBe( 'branch-B' );
	} );

	it( 'returns null when no selection', () => {
		const result = resolve( {
			block: block( 'CHOICE' ),
			connections: [conn( 'choice-A', 'branch-A' )],
		} );
		expect( result.connection ).toBeNull();
	} );

	it( 'returns null when selected choice has no matching connection', () => {
		const result = resolve( {
			block: block( 'CHOICE' ),
			connections: [conn( 'choice-A', 'branch-A' )],
			selectedChoiceUuid: 'choice-C',
		} );
		expect( result.connection ).toBeNull();
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
		expect( result.connection?.toId ).toBe( 'yes' );
	} );

	it( 'follows port index 1 for false', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 ), conn( 'false', 'no', 1 )],
			conditionResult: false,
		} );
		expect( result.connection?.toId ).toBe( 'no' );
	} );

	it( 'returns null when conditionResult is undefined', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 )],
		} );
		expect( result.connection ).toBeNull();
	} );

	it( 'returns null when no connection matches the port index', () => {
		const result = resolve( {
			block: block( 'CONDITION' ),
			connections: [conn( 'true', 'yes', 0 )],
			conditionResult: false,
		} );
		expect( result.connection ).toBeNull();
	} );

} );

// ─── ACTION ──────────────────────────────────────────────────────────────────

describe( 'resolvePort — ACTION', () => {

	it( 'follows "then" port on success', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [conn( 'then', 'next' ), conn( 'catch', 'error' )],
		} );
		expect( result.connection?.toId ).toBe( 'next' );
	} );

	it( 'follows "catch" port on reject', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [conn( 'then', 'next' ), conn( 'catch', 'error' )],
			actionRejected: true,
		} );
		expect( result.connection?.toId ).toBe( 'error' );
	} );

	it( 'falls back to "then" on reject when no "catch" port', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [conn( 'then', 'next' )],
			actionRejected: true,
		} );
		expect( result.connection?.toId ).toBe( 'next' );
	} );

	it( 'returns null on reject with no connections', () => {
		const result = resolve( {
			block: block( 'ACTION' ),
			connections: [],
			actionRejected: true,
		} );
		expect( result.connection ).toBeNull();
	} );

} );

// ─── NOTE ────────────────────────────────────────────────────────────────────

describe( 'resolvePort — NOTE', () => {

	it( 'follows the first available connection', () => {
		const result = resolve( {
			block: block( 'NOTE' ),
			connections: [conn( 'any', 'next' )],
		} );
		expect( result.connection?.toId ).toBe( 'next' );
	} );

	it( 'returns null when no connections', () => {
		const result = resolve( {
			block: block( 'NOTE' ),
			connections: [],
		} );
		expect( result.connection ).toBeNull();
	} );

} );

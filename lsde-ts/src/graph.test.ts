import { describe, it, expect } from 'vitest';
import { SceneGraph, BlueprintGraph } from './graph.js';
import type { BlueprintScene, BlueprintExport } from './types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const scene: BlueprintScene = {
	uuid: 'scene-1',
	label: 'Test Scene',
	date: '2025-01-01',
	entryBlockId: 'block-entry',
	blocks: [
		{ uuid: 'block-1', type: 'DIALOG', properties: [], isStartBlock: true },
		{ uuid: 'block-2', type: 'CHOICE', properties: [] },
		{ uuid: 'block-entry', type: 'DIALOG', properties: [] },
	],
	connections: [
		{ id: 'c1', fromId: 'block-1', toId: 'block-2', fromPort: 'out', toPort: 'in' },
		{ id: 'c2', fromId: 'block-1', toId: 'block-entry', fromPort: 'alt', toPort: 'in' },
	],
};

// ─── SceneGraph ──────────────────────────────────────────────────────────────

describe( 'SceneGraph', () => {

	it( 'looks up blocks by UUID', () => {
		const sg = new SceneGraph( scene );
		expect( sg.getBlock( 'block-1' )?.type ).toBe( 'DIALOG' );
		expect( sg.getBlock( 'block-2' )?.type ).toBe( 'CHOICE' );
		expect( sg.getBlock( 'nonexistent' ) ).toBeUndefined();
	} );

	it( 'returns outgoing connections for a block', () => {
		const sg = new SceneGraph( scene );
		const conns = sg.getOutgoingConnections( 'block-1' );
		expect( conns ).toHaveLength( 2 );
		expect( conns[0]!.toId ).toBe( 'block-2' );
		expect( conns[1]!.toId ).toBe( 'block-entry' );
	} );

	it( 'returns empty array for block with no connections', () => {
		const sg = new SceneGraph( scene );
		expect( sg.getOutgoingConnections( 'block-2' ) ).toEqual( [] );
	} );

	it( 'finds start block via isStartBlock flag', () => {
		const sg = new SceneGraph( scene );
		expect( sg.getStartBlock()?.uuid ).toBe( 'block-1' );
	} );

	it( 'falls back to entryBlockId when no isStartBlock', () => {
		const noStartScene: BlueprintScene = {
			...scene,
			blocks: scene.blocks.map( b => ( { ...b, isStartBlock: false } ) ),
		};
		const sg = new SceneGraph( noStartScene );
		expect( sg.getStartBlock()?.uuid ).toBe( 'block-entry' );
	} );

	it( 'returns undefined when no start block and no entryBlockId', () => {
		const emptyScene: BlueprintScene = {
			uuid: 's', label: 'S', date: '2025-01-01',
			blocks: [{ uuid: 'b1', type: 'DIALOG', properties: [] }],
			connections: [],
		};
		const sg = new SceneGraph( emptyScene );
		expect( sg.getStartBlock() ).toBeUndefined();
	} );

	it( 'returns the original scene and all blocks', () => {
		const sg = new SceneGraph( scene );
		expect( sg.getScene().uuid ).toBe( 'scene-1' );
		expect( sg.getAllBlocks() ).toHaveLength( 3 );
	} );

} );

// ─── BlueprintGraph ──────────────────────────────────────────────────────────

describe( 'BlueprintGraph', () => {

	const exportData: BlueprintExport = {
		version: '1.0.0',
		exportDate: '2025-01-01',
		locales: ['en'],
		scenes: [scene],
		signatures: [
			{ uuid: 'sig-1', id: 'give_item', label: 'Give Item', params: [] },
		],
		dictionaries: [
			{ uuid: 'dict-1', label: 'questStatus', valueType: 'string', rows: [{ key: 'active' }] },
		],
	};

	it( 'retrieves scene graphs by UUID', () => {
		const bg = new BlueprintGraph( exportData );
		expect( bg.getSceneGraph( 'scene-1' ) ).toBeDefined();
		expect( bg.getSceneGraph( 'nonexistent' ) ).toBeUndefined();
	} );

	it( 'lists all scene IDs', () => {
		const bg = new BlueprintGraph( exportData );
		expect( bg.getAllSceneIds() ).toEqual( ['scene-1'] );
	} );

	it( 'looks up signatures by id', () => {
		const bg = new BlueprintGraph( exportData );
		expect( bg.getSignature( 'give_item' )?.label ).toBe( 'Give Item' );
		expect( bg.getSignature( 'unknown' ) ).toBeUndefined();
	} );

	it( 'looks up dictionaries by label', () => {
		const bg = new BlueprintGraph( exportData );
		expect( bg.getDictionary( 'questStatus' )?.rows ).toHaveLength( 1 );
		expect( bg.getDictionary( 'unknown' ) ).toBeUndefined();
	} );

	it( 'returns scene connections', () => {
		const bg = new BlueprintGraph( exportData );
		expect( bg.getSceneConnections( 'scene-1' ) ).toHaveLength( 2 );
		expect( bg.getSceneConnections( 'nonexistent' ) ).toEqual( [] );
	} );

} );

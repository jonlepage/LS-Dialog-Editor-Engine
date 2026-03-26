import { describe, it, expect } from 'vitest';
import { validateBlueprint } from './validator.js';
import type { BlueprintExport, BlueprintScene, InitOptions } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene( overrides: Partial<BlueprintScene> = {} ): BlueprintScene {
	return {
		uuid: 'scene-1',
		label: 'Test Scene',
		date: '2025-01-01',
		blocks: [
			{ uuid: 'block-1', type: 'DIALOG', properties: [], isStartBlock: true },
		],
		connections: [],
		...overrides,
	};
}

function makeExport( overrides: Partial<BlueprintExport> = {} ): BlueprintExport {
	return {
		version: '1.0.0',
		exportDate: '2025-01-01',
		locales: ['en'],
		scenes: [makeScene()],
		...overrides,
	};
}

function makeOptions( exportOverrides: Partial<BlueprintExport> = {}, check?: InitOptions['check'] ): InitOptions {
	return { data: makeExport( exportOverrides ), check };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe( 'validateBlueprint', () => {

	describe( 'structural validation', () => {

		it( 'returns no errors for a valid minimal blueprint', () => {
			const report = validateBlueprint( makeOptions() );
			expect( report.errors ).toHaveLength( 0 );
			expect( report.stats ).toEqual( { sceneCount: 1, blockCount: 1, connectionCount: 0 } );
		} );

		it( 'errors when version is missing', () => {
			const report = validateBlueprint( makeOptions( { version: '' } ) );
			expect( report.errors.some( e => e.code === 'MISSING_VERSION' ) ).toBe( true );
		} );

		it( 'errors when scenes array is empty', () => {
			const report = validateBlueprint( makeOptions( { scenes: [] } ) );
			expect( report.errors.some( e => e.code === 'NO_SCENES' ) ).toBe( true );
		} );

	} );

	describe( 'per-scene validation', () => {

		it( 'errors on duplicate block UUIDs within a scene', () => {
			const scene = makeScene( {
				blocks: [
					{ uuid: 'dup', type: 'DIALOG', properties: [] },
					{ uuid: 'dup', type: 'DIALOG', properties: [] },
				],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.errors.some( e => e.code === 'DUPLICATE_BLOCK_UUID' ) ).toBe( true );
		} );

		it( 'errors on duplicate block UUIDs across scenes', () => {
			const scene1 = makeScene( {
				uuid: 's1', label: 'S1',
				blocks: [{ uuid: 'shared-uuid', type: 'DIALOG', properties: [] }],
			} );
			const scene2 = makeScene( {
				uuid: 's2', label: 'S2',
				blocks: [{ uuid: 'shared-uuid', type: 'CHOICE', properties: [] }],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene1, scene2] } ) );
			expect( report.errors.some( e => e.code === 'DUPLICATE_BLOCK_UUID_GLOBAL' ) ).toBe( true );
		} );

		it( 'errors when more than one isStartBlock in a scene', () => {
			const scene = makeScene( {
				blocks: [
					{ uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true },
					{ uuid: 'b2', type: 'DIALOG', properties: [], isStartBlock: true },
				],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.errors.some( e => e.code === 'MULTIPLE_START_BLOCKS' ) ).toBe( true );
		} );

		it( 'errors when entryBlockId references a non-existent block', () => {
			const scene = makeScene( { entryBlockId: 'does-not-exist' } );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.errors.some( e => e.code === 'INVALID_ENTRY_BLOCK' ) ).toBe( true );
		} );

		it( 'errors when connection fromId references a non-existent block', () => {
			const scene = makeScene( {
				connections: [
					{ id: 'c1', fromId: 'ghost', toId: 'block-1', fromPort: 'out', toPort: 'in' },
				],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.errors.some( e => e.code === 'BROKEN_CONNECTION_FROM' ) ).toBe( true );
		} );

		it( 'errors when connection toId references a non-existent block', () => {
			const scene = makeScene( {
				connections: [
					{ id: 'c1', fromId: 'block-1', toId: 'ghost', fromPort: 'out', toPort: 'in' },
				],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.errors.some( e => e.code === 'BROKEN_CONNECTION_TO' ) ).toBe( true );
		} );

	} );

	describe( 'cross-validation', () => {

		it( 'warns about unknown signatures', () => {
			const data = makeExport( {
				signatures: [{ uuid: 's1', id: 'give_item', label: 'Give', params: [] }],
			} );
			const report = validateBlueprint( { data, check: { signatures: ['play_sfx'] } } );
			expect( report.warnings.some( w => w.code === 'UNKNOWN_SIGNATURE' ) ).toBe( true );
		} );

		it( 'no warning when all signatures match', () => {
			const data = makeExport( {
				signatures: [{ uuid: 's1', id: 'give_item', label: 'Give', params: [] }],
			} );
			const report = validateBlueprint( { data, check: { signatures: ['give_item'] } } );
			expect( report.warnings.filter( w => w.code === 'UNKNOWN_SIGNATURE' ) ).toHaveLength( 0 );
		} );

		it( 'warns about unknown dictionary groups', () => {
			const data = makeExport( {
				dictionaries: [{ uuid: 'd1', label: 'questStatus', valueType: 'string', rows: [] }],
			} );
			const report = validateBlueprint( { data, check: { dictionaries: { gameSwitches: ['a'] } } } );
			expect( report.warnings.some( w => w.code === 'UNKNOWN_DICTIONARY_GROUP' ) ).toBe( true );
		} );

		it( 'warns about unknown dictionary keys', () => {
			const data = makeExport( {
				dictionaries: [{
					uuid: 'd1', label: 'questStatus', valueType: 'string',
					rows: [{ key: 'active' }, { key: 'unknown_key' }],
				}],
			} );
			const report = validateBlueprint( { data, check: { dictionaries: { questStatus: ['active'] } } } );
			expect( report.warnings.some( w => w.code === 'UNKNOWN_DICTIONARY_KEY' && w.message.includes( 'unknown_key' ) ) ).toBe( true );
		} );

		it( 'warns about unknown characters', () => {
			const scene = makeScene( {
				blocks: [{
					uuid: 'b1', type: 'DIALOG', properties: [],
					metadata: { characters: [{ uuid: 'gruht-uuid', id: 'gruht', name: 'Gruht' }, { uuid: 'unknown-npc-uuid', id: 'unknown-npc', name: 'UnknownNPC' }] },
				}],
			} );
			const data = makeExport( { scenes: [scene] } );
			const report = validateBlueprint( { data, check: { characters: ['Gruht'] } } );
			expect( report.warnings.some( w => w.code === 'UNKNOWN_CHARACTER' && w.message.includes( 'UnknownNPC' ) ) ).toBe( true );
			expect( report.warnings.filter( w => w.code === 'UNKNOWN_CHARACTER' ) ).toHaveLength( 1 );
		} );

	} );

	describe( 'fork validation', () => {

		it( 'warns when a fork has multiple non-async targets', () => {
			const scene = makeScene( {
				blocks: [
					{ uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true },
					{ uuid: 'b2', type: 'DIALOG', properties: [] },
					{ uuid: 'b3', type: 'DIALOG', properties: [] },
				],
				connections: [
					{ id: 'c1', fromId: 'b1', toId: 'b2', fromPort: 'out', toPort: 'in' },
					{ id: 'c2', fromId: 'b1', toId: 'b3', fromPort: 'out', toPort: 'in' },
				],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.warnings.some( w => w.code === 'MULTIPLE_NON_ASYNC_FORK' ) ).toBe( true );
		} );

		it( 'no warning when fork has 1 non-async + 1 async', () => {
			const scene = makeScene( {
				blocks: [
					{ uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true },
					{ uuid: 'b2', type: 'DIALOG', properties: [] },
					{ uuid: 'b3', type: 'DIALOG', properties: [], nativeProperties: { isAsync: true } },
				],
				connections: [
					{ id: 'c1', fromId: 'b1', toId: 'b2', fromPort: 'out', toPort: 'in' },
					{ id: 'c2', fromId: 'b1', toId: 'b3', fromPort: 'out', toPort: 'in' },
				],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene] } ) );
			expect( report.warnings.some( w => w.code === 'MULTIPLE_NON_ASYNC_FORK' ) ).toBe( false );
		} );

	} );

	describe( 'stats', () => {

		it( 'counts scenes, blocks, and connections correctly', () => {
			const scene1 = makeScene( {
				uuid: 's1', label: 'S1',
				blocks: [
					{ uuid: 'b1', type: 'DIALOG', properties: [] },
					{ uuid: 'b2', type: 'CHOICE', properties: [] },
				],
				connections: [
					{ id: 'c1', fromId: 'b1', toId: 'b2', fromPort: 'out', toPort: 'in' },
				],
			} );
			const scene2 = makeScene( {
				uuid: 's2', label: 'S2',
				blocks: [{ uuid: 'b3', type: 'ACTION', properties: [] }],
				connections: [],
			} );
			const report = validateBlueprint( makeOptions( { scenes: [scene1, scene2] } ) );
			expect( report.stats ).toEqual( { sceneCount: 2, blockCount: 3, connectionCount: 1 } );
		} );

	} );

} );

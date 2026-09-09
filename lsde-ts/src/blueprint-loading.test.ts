// LSDE Dialog Engine — loading a real v2 export
//
// This suite runs against the files LSDE actually wrote, read off disk, never a payload built to
// match a theory. Every fixture in `mock/` came out of LSDE 2.0.3 on 2026-09-07, in the three
// split modes the exporter offers.
//
// It exists to hold one line: an LSDE v2 export loads with zero errors. The v1 engine could not —
// it indexed blocks in a single global map, and this export legitimately repeats four ids between
// its two scenes, so it was refused outright. And when a payload it could not read came in, it
// refused nothing at all: no header check, so a foreign file produced a scene that stopped in the
// middle without a word.

import { describe, it, expect } from 'vitest';
import { LsdeUtils } from './lsde-utils.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateBlueprint, mergePayloads } from './validator.js';
import { BlueprintGraph } from './graph.js';
import type { Blueprints } from './types.js';

const repoRoot = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );

function load( relativePath: string ): Blueprints {
	return JSON.parse( readFileSync( resolve( repoRoot, relativePath ), 'utf-8' ) ) as Blueprints;
}

/** The three split modes LSDE writes, all from the same project. */
const SINGLE_FILE = 'mock/blueprints/Engine-Conformance-Scene.blueprints.json';
const PER_SCENE = [
	'mock/all/blueprints/Engine-Conformance-Scene.blueprints.reactor_breach.json',
	'mock/all/blueprints/Engine-Conformance-Scene.blueprints.docking_ring_brief.json',
];

describe( 'loading the reference export', () => {

	it( 'accepts the whole-project export with no errors', () => {
		const report = validateBlueprint( { data: load( SINGLE_FILE ) } );

		expect( report.errors ).toEqual( [] );
		expect( report.stats.sceneCount ).toBe( 2 );
		expect( report.stats.blockCount ).toBe( 22 );
	} );

	it( 'accepts every per-scene file on its own', () => {
		for ( const path of PER_SCENE ) {
			const report = validateBlueprint( { data: load( path ) } );
			expect( report.errors, `${ path } reported ${ JSON.stringify( report.errors ) }` ).toEqual( [] );
			expect( report.stats.sceneCount ).toBe( 1 );
		}
	} );

	it( 'reports no warnings on a clean export either', () => {
		// Warnings are not failures, but the reference export is the one payload we know is sound.
		// A warning appearing here means the rule that raised it is wrong, not the file.
		const report = validateBlueprint( { data: load( SINGLE_FILE ) } );
		expect( report.warnings ).toEqual( [] );
	} );

	it( 'counts every wire the blocks carry', () => {
		const report = validateBlueprint( { data: load( SINGLE_FILE ) } );
		const data = load( SINGLE_FILE );
		const byHand = data.scenes
			.flatMap( s => s.blocks )
			.reduce( ( n, b ) => n + ( b.next?.length ?? 0 ), 0 );

		expect( report.stats.connectionCount ).toBe( byHand );
		expect( byHand ).toBeGreaterThan( 0 );
	} );
} );

describe( 'block ids that repeat between scenes', () => {

	// The v1 engine died right here: `DUPLICATE_BLOCK_UUID_GLOBAL`. In v2 the counter restarts in
	// every scene, so this is not a defect to tolerate — it is how ids are meant to work.

	it( 'the reference export really does repeat ids across its two scenes', () => {
		const data = load( SINGLE_FILE );
		const [first, second] = data.scenes.map( s => new Set( s.blocks.map( b => b.id ) ) );
		const shared = [...first!].filter( id => second!.has( id ) ).sort();

		expect( shared ).toEqual( ['ACTION-001', 'CHOICE-001', 'DIALOG-001', 'DIALOG-002'] );
	} );

	it( 'loads them without complaint', () => {
		const report = validateBlueprint( { data: load( SINGLE_FILE ) } );
		expect( report.errors ).toEqual( [] );
	} );

	it( 'resolves a shared id to a different block in each scene', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );

		const a = graph.getSceneGraph( 'reactor_breach' )?.getBlock( 'DIALOG-001' );
		const b = graph.getSceneGraph( 'docking_ring_brief' )?.getBlock( 'DIALOG-001' );

		expect( a ).toBeDefined();
		expect( b ).toBeDefined();
		expect( a ).not.toBe( b );
		expect( a?.key ).not.toBe( b?.key );
	} );

	it( 'still refuses the same id twice inside ONE scene', () => {
		const data = load( SINGLE_FILE );
		const scene = data.scenes[0]!;
		scene.blocks.push( { ...scene.blocks[0]! } );

		const report = validateBlueprint( { data } );
		const codes = report.errors.map( e => e.code );

		expect( codes ).toContain( 'DUPLICATE_BLOCK_ID' );
	} );
} );

describe( 'refusing a payload it cannot read', () => {

	it( 'refuses a file that is not an LSDE blueprint', () => {
		const report = validateBlueprint( { data: { hello: 'world' } as unknown as Blueprints } );

		expect( report.errors[0]!.code ).toBe( 'INVALID_FORMAT' );
		expect( report.errors[0]!.message ).toContain( 'lsde-blueprints' );
	} );

	it( 'refuses a future format version, and names the one it reads', () => {
		const data = { ...load( SINGLE_FILE ), version: 2 as unknown as 1 };
		const report = validateBlueprint( { data } );

		expect( report.errors[0]!.code ).toBe( 'UNSUPPORTED_FORMAT_VERSION' );
		expect( report.errors[0]!.message ).toContain( 'version 1' );
		expect( report.errors[0]!.message ).toContain( '2' );
	} );

	it( 'refuses a v1 payload instead of half-playing it', () => {
		// A LSDE 1.6 export: no `format`, a string `version`, blocks keyed by uuid. Before the
		// header check this went through and produced a scene that stopped at the first port.
		const v1 = {
			version: '1.0.0',
			exportDate: '2025-01-01',
			locales: ['en'],
			scenes: [{ uuid: 's1', label: 'S1', blocks: [], connections: [] }],
		};

		const report = validateBlueprint( { data: v1 as unknown as Blueprints } );

		expect( report.errors[0]!.code ).toBe( 'INVALID_FORMAT' );
		expect( report.stats.sceneCount ).toBe( 0 );
	} );

	it( 'stops at the header instead of listing everything else that is wrong', () => {
		// One clear cause beats twenty consequences.
		const report = validateBlueprint( { data: { format: 'something-else' } as unknown as Blueprints } );
		expect( report.errors ).toHaveLength( 1 );
	} );

	it( 'still refuses nothing at all', () => {
		const report = validateBlueprint( { data: undefined as unknown as Blueprints } );
		expect( report.errors[0]!.code ).toBe( 'MISSING_DATA' );
	} );

	it( 'refuses a well-formed header carrying no scene', () => {
		const report = validateBlueprint( { data: { ...load( SINGLE_FILE ), scenes: [] } } );
		expect( report.errors[0]!.code ).toBe( 'NO_SCENES' );
	} );
} );

describe( 'the header tables', () => {

	it( 'indexes dictionaries, functions and cards', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );

		expect( graph.getDictionary( 'switches' )?.valueType ).toBe( 'boolean' );
		expect( graph.getFunction( 'play_music' )?.params.map( p => p.name ) )
			.toEqual( ['track', 'fadeMs', 'loop'] );
		expect( graph.getCard( 'var1' )?.name ).toBe( 'kael' );
	} );

	it( 'separates cards by role rather than assuming they are all characters', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );

		expect( graph.getCardsByRole( 'characters' ).map( c => c.name ) )
			.toEqual( ['kael', 'nora', 'oracle', 'vesk'] );
		expect( graph.getCardsByRole( 'places' ).map( c => c.name ) )
			.toEqual( ['reactor_deck', 'docking_ring'] );
		expect( graph.getCardsByRole( 'none' ) ).toHaveLength( 3 );
	} );

	it( 'carries the locales and the reference locale', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );

		expect( graph.getLocales() ).toEqual( ['en', 'fr', 'es'] );
		expect( graph.getReferenceLocale() ).toBe( 'en' );
	} );
} );

describe( 'finding a scene', () => {

	it( 'finds it by path', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );
		expect( graph.getSceneGraph( 'reactor_breach' )?.getScene().scene ).toBe( 'reactor_breach' );
	} );

	it( 'finds it by the id that survives a rename', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );
		expect( graph.getSceneGraph( 'sc_u0vqg2g8' )?.getScene().scene ).toBe( 'reactor_breach' );
	} );

	it( 'starts on the block the scene names', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );

		expect( graph.getSceneGraph( 'reactor_breach' )?.getStartBlock()?.id ).toBe( 'ACTION-001' );
		expect( graph.getSceneGraph( 'docking_ring_brief' )?.getStartBlock()?.id ).toBe( 'DIALOG-001' );
	} );

	it( 'lists every scene by path', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );
		expect( graph.getAllScenePaths() ).toEqual( ['reactor_breach', 'docking_ring_brief'] );
	} );

	it( 'returns nothing for a scene that is not in the export', () => {
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );

		expect( graph.getSceneGraph( 'no_such_scene' ) ).toBeUndefined();
		expect( graph.getSceneConnections( 'no_such_scene' ) ).toEqual( [] );
	} );

	it( 'has no start block when the scene names none', () => {
		const data = load( SINGLE_FILE );
		delete data.scenes[0]!.start;

		expect( new BlueprintGraph( data ).getSceneGraph( 'reactor_breach' )?.getStartBlock() )
			.toBeUndefined();
	} );

	it( 'has no start block when the scene names one it does not hold', () => {
		const data = load( SINGLE_FILE );
		data.scenes[0]!.start = 'NOWHERE-001';

		expect( new BlueprintGraph( data ).getSceneGraph( 'reactor_breach' )?.getStartBlock() )
			.toBeUndefined();
	} );
} );

describe( 'wires', () => {

	it( 'reads a block outgoing links straight off the block', () => {
		const scene = new BlueprintGraph( load( SINGLE_FILE ) ).getSceneGraph( 'reactor_breach' )!;

		expect( scene.getOutgoingLinks( 'ACTION-001' ).map( l => l.port ).sort() )
			.toEqual( ['catch', 'then'] );
		expect( scene.getOutgoingLinks( 'NOTE-001' ) ).toEqual( [] );
	} );

	it( 'flattens the scene wires with the block each one leaves', () => {
		// This is what getSceneConnections() lost when the connection table disappeared: a Link
		// only knows where it goes. Inspection needs both ends, so the source id is put back on.
		const graph = new BlueprintGraph( load( SINGLE_FILE ) );
		const wires = graph.getSceneConnections( 'reactor_breach' );

		expect( wires.length ).toBeGreaterThan( 0 );
		expect( wires.every( w => w.from && w.to && w.port ) ).toBe( true );
		expect( wires.filter( w => w.from === 'ACTION-001' ).map( w => w.to ) )
			.toEqual( ['DIALOG-002', 'DIALOG-001'] );
	} );

	it( 'reports a wire pointing at a block that is not in the scene', () => {
		const data = load( SINGLE_FILE );
		data.scenes[0]!.blocks.find( b => b.id === 'ACTION-001' )!.next![0]!.to = 'DIALOG-999';

		const report = validateBlueprint( { data } );
		const broken = report.errors.filter( e => e.code === 'BROKEN_LINK' );

		expect( broken ).toHaveLength( 1 );
		expect( broken[0]!.message ).toContain( 'DIALOG-999' );
		expect( broken[0]!.blockId ).toBe( 'ACTION-001' );
	} );

	it( 'does not mistake a target in ANOTHER scene for a valid one', () => {
		// `DIALOG-002` exists in both scenes. A wire in scene one that points at scene two's copy
		// is still broken — a link has never crossed a scene.
		const data = load( SINGLE_FILE );
		const other = data.scenes[1]!;
		other.blocks[0]!.next = [{ port: 'out', to: 'COND-001', toPort: 'in' }];

		const report = validateBlueprint( { data } );

		expect( report.errors.map( e => e.code ) ).toContain( 'BROKEN_LINK' );
	} );
} );

describe( 'the entry block', () => {

	it( 'errors when the scene starts on a block it does not have', () => {
		const data = load( SINGLE_FILE );
		data.scenes[0]!.start = 'NOWHERE-001';

		const report = validateBlueprint( { data } );

		expect( report.errors.map( e => e.code ) ).toContain( 'INVALID_START_BLOCK' );
	} );

	it( 'warns, but does not error, when a scene has no entry at all', () => {
		// A scene still being written loads fine; it just cannot play. That is not a reason to
		// refuse the other scenes in the file.
		const data = load( SINGLE_FILE );
		delete data.scenes[0]!.start;

		const report = validateBlueprint( { data } );

		expect( report.errors ).toEqual( [] );
		expect( report.warnings.map( w => w.code ) ).toContain( 'NO_START_BLOCK' );
	} );
} );

describe( 'the fork rule', () => {

	// Two wires on one port used to be `MULTIPLE_NON_ASYNC_FORK`: "the second silently never
	// becomes the main track, mark it isAsync". The warning described the engine of the day
	// faithfully, and asked the designer to give up the drawing. The traversal now walks those
	// wires in turn — `branch-queue.test.ts` pins that — so the diagnostic is gone, not renamed.
	it( 'says nothing about two non-async targets on one port', () => {
		const data = load( SINGLE_FILE );
		const block = data.scenes[0]!.blocks.find( b => b.id === 'DIALOG-001' )!;
		block.next = [
			{ port: 'out', to: 'DIALOG-002', toPort: 'in' },
			{ port: 'out', to: 'DIALOG-003', toPort: 'in' },
		];

		const report = validateBlueprint( { data } );

		expect( report.errors ).toEqual( [] );
		expect( report.warnings ).toEqual( [] );
	} );

	it( 'says nothing either when the extra target is async', () => {
		const data = load( SINGLE_FILE );
		const block = data.scenes[0]!.blocks.find( b => b.id === 'DIALOG-001' )!;
		block.next = [
			{ port: 'out', to: 'DIALOG-002', toPort: 'in' },
			{ port: 'out', to: 'DIALOG-003', toPort: 'in' },
		];
		data.scenes[0]!.blocks.find( b => b.id === 'DIALOG-003' )!.props = { isAsync: true };

		const report = validateBlueprint( { data } );

		expect( report.warnings ).toEqual( [] );
	} );

	it( 'does not confuse two different ports of the same block', () => {
		// A condition with K1 and K2 both wired is the normal case, not a fork.
		const report = validateBlueprint( { data: load( SINGLE_FILE ) } );
		expect( report.warnings ).toEqual( [] );
	} );
} );

describe( 'naming a block in a message', () => {

	it( 'quotes the designer note when there is one', () => {
		const data = load( SINGLE_FILE );
		data.scenes[0]!.blocks.find( b => b.id === 'ACTION-001' )!.next![0]!.to = 'NOWHERE';

		const message = validateBlueprint( { data } ).errors[0]!.message;

		expect( message ).toContain( 'ACTION-001' );
		expect( message ).toContain( 'Le réacteur monte' );
	} );

	it( 'prefers a label when an export carries one', () => {
		const data = load( SINGLE_FILE );
		const block = data.scenes[0]!.blocks.find( b => b.id === 'ACTION-001' )!;
		block.label = 'Opening beat';
		block.next![0]!.to = 'NOWHERE';

		const message = validateBlueprint( { data } ).errors[0]!.message;

		expect( message ).toContain( 'Opening beat' );
		expect( message ).not.toContain( 'Le réacteur monte' );
	} );

	it( 'falls back to the id alone, which is already readable', () => {
		const data = load( SINGLE_FILE );
		const block = data.scenes[0]!.blocks.find( b => b.id === 'ACTION-001' )!;
		delete block.note;
		block.next![0]!.to = 'NOWHERE';

		expect( validateBlueprint( { data } ).errors[0]!.message ).toContain( 'Block ACTION-001' );
	} );
} );

describe( 'cross-validating against the game', () => {

	it( 'warns about a function the game does not implement', () => {
		const report = validateBlueprint( {
			data: load( SINGLE_FILE ),
			check: { functions: ['play_music'] },
		} );

		const unknown = report.warnings.filter( w => w.code === 'UNKNOWN_FUNCTION' );
		expect( unknown.length ).toBeGreaterThan( 0 );
		expect( unknown.some( w => w.message.includes( 'play_music' ) ) ).toBe( false );
	} );

	it( 'warns about a dictionary entry the game does not know', () => {
		const report = validateBlueprint( {
			data: load( SINGLE_FILE ),
			check: { dictionaries: { switches: ['door_unlocked'], variables: [], items: [], flags: [] } },
		} );

		expect( report.warnings.map( w => w.code ) ).toContain( 'UNKNOWN_DICTIONARY_ENTRY' );
	} );

	it( 'matches cards on the name the game uses, not the editor id', () => {
		const report = validateBlueprint( {
			data: load( SINGLE_FILE ),
			check: { cards: ['kael'] },
		} );

		const unknown = report.warnings.filter( w => w.code === 'UNKNOWN_CARD' );
		expect( unknown.some( w => w.message.includes( 'kael' ) ) ).toBe( false );
		expect( unknown.some( w => w.message.includes( 'nora' ) ) ).toBe( true );
	} );

	it( 'says nothing when the game declares everything', () => {
		const data = load( SINGLE_FILE );
		const report = validateBlueprint( {
			data,
			check: {
				functions: data.functions.map( f => f.id ),
				dictionaries: Object.fromEntries( data.dictionaries.map( d => [d.id, d.entries] ) ),
				cards: data.cards.map( c => c.name ),
			},
		} );

		expect( report.warnings ).toEqual( [] );
	} );
} );

describe( 'a per-scene export loaded one file at a time', () => {

	it( 'each file carries the whole header, so a scene plays on its own', () => {
		for ( const path of PER_SCENE ) {
			const graph = new BlueprintGraph( load( path ) );

			expect( graph.getAllScenePaths() ).toHaveLength( 1 );
			expect( graph.getDictionary( 'switches' ) ).toBeDefined();
			expect( graph.getFunction( 'play_music' ) ).toBeDefined();
			expect( graph.getCard( 'var1' ) ).toBeDefined();
		}
	} );

	it( 'holds the same blocks as the whole-project export', () => {
		const whole = new BlueprintGraph( load( SINGLE_FILE ) );
		const split = new BlueprintGraph( load( PER_SCENE[0]! ) );

		expect( split.getSceneGraph( 'reactor_breach' )?.getAllBlocks().map( b => b.id ) )
			.toEqual( whole.getSceneGraph( 'reactor_breach' )?.getAllBlocks().map( b => b.id ) );
	} );

	it( 'reports the same scene twice when a file is passed twice', () => {
		const data = load( PER_SCENE[0]! );
		data.scenes.push( { ...data.scenes[0]! } );

		const report = validateBlueprint( { data } );

		expect( report.errors.map( e => e.code ) ).toContain( 'DUPLICATE_SCENE' );
	} );
} );

describe( 'a per-scene export loaded as a whole', () => {

	// LSDE can write one file per scene. Each is self-contained — the four dictionaries, eight
	// functions and fourteen cards are in every one — so a scene loads and plays alone. Passing
	// the list stacks them behind one header.

	it( 'loads every file at once', () => {
		const report = validateBlueprint( { data: PER_SCENE.map( load ) } );

		expect( report.errors ).toEqual( [] );
		expect( report.stats.sceneCount ).toBe( 2 );
		expect( report.stats.blockCount ).toBe( 22 );
	} );

	it( 'produces the same thing as the whole-project export', () => {
		const split = validateBlueprint( { data: PER_SCENE.map( load ) } );
		const whole = validateBlueprint( { data: load( SINGLE_FILE ) } );

		expect( split.stats ).toEqual( whole.stats );
	} );

	it( 'keeps the header of the first file', () => {
		const merged = mergePayloads( PER_SCENE.map( load ) ).data!;

		expect( merged.dictionaries ).toHaveLength( 4 );
		expect( merged.functions ).toHaveLength( 8 );
		expect( merged.cards ).toHaveLength( 14 );
		expect( merged.scenes.map( s => s.scene ) ).toEqual( ['reactor_breach', 'docking_ring_brief'] );
	} );

	it( 'refuses pieces of two different exports', () => {
		// `project` and `exportedAt` are identical across the files of one export and differ
		// across two. Merging two would give a payload whose dictionaries do not match its
		// scenes, and nothing downstream would notice.
		const [a, b] = PER_SCENE.map( load );
		const report = validateBlueprint( { data: [a!, { ...b!, exportedAt: '2020-01-01T00:00:00.000Z' }] } );

		expect( report.errors[0]!.code ).toBe( 'MISMATCHED_EXPORTS' );
	} );

	it( 'refuses an empty list', () => {
		expect( validateBlueprint( { data: [] } ).errors[0]!.code ).toBe( 'MISSING_DATA' );
	} );

	it( 'accepts a list of one', () => {
		expect( validateBlueprint( { data: [load( PER_SCENE[0]! )] } ).errors ).toEqual( [] );
	} );
} );

describe( 'a file exported in another naming convention', () => {

	// The exporter can write camelCase (its default), snake_case or PascalCase, and that RENAMES
	// the fields. The engine reads camelCase only — so the job here is to say which setting to
	// change, instead of "not an LSDE blueprint" on a file that plainly is one.

	it( 'names snake_case and the setting to change', () => {
		const data = { format: 'lsde_blueprints', version: 1, exported_at: '2026-09-07' };
		const report = validateBlueprint( { data: data as never } );

		expect( report.errors[0]!.code ).toBe( 'WRONG_NAMING_CONVENTION' );
		expect( report.errors[0]!.message ).toContain( 'snake_case' );
		expect( report.errors[0]!.message ).toContain( 'Naming convention' );
	} );

	it( 'names PascalCase too', () => {
		const data = { Format: 'lsde-blueprints', Version: 1, ExportedAt: '2026-09-07' };
		const report = validateBlueprint( { data: data as never } );

		expect( report.errors[0]!.code ).toBe( 'WRONG_NAMING_CONVENTION' );
		expect( report.errors[0]!.message ).toContain( 'PascalCase' );
	} );

	it( 'still says INVALID_FORMAT for a file that is not one at all', () => {
		expect( validateBlueprint( { data: { hello: 'world' } as never } ).errors[0]!.code )
			.toBe( 'INVALID_FORMAT' );
	} );
} );

// ─── waitForBlocks is the one native holding a LIST ──────────────────────────
//
// Every other native is a scalar. The three ports each need a branch of their own to read an
// array out of the props bag — a std::variant alternative, a JsonElement, a JArray — and a
// payload whose waitForBlocks came back empty would make the property silently inert: no error,
// no warning, and a block that never waits. The four runtimes assert it against the same export.

it( 'reads waitForBlocks off the reference export as a real list of ids', () => {
	const data = load( SINGLE_FILE );
	const scene = data.scenes.find( s => s.scene === 'reactor_breach' )!;
	const block = scene.blocks.find( b => b.id === 'DIALOG-008' )!;

	expect( LsdeUtils.getNativeProperties( block ).waitForBlocks )
		.toEqual( ['DIALOG-012', 'DIALOG-007'] );
} );

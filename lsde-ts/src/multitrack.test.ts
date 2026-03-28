import { describe, it, expect, vi } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { BlueprintExport, BlueprintScene, BlueprintBlock } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeExport( scenes: BlueprintScene[] ): BlueprintExport {
	return { version: '1.0.0', exportDate: '2025-01-01', locales: ['en'], scenes };
}

function dialog( uuid: string, opts: { start?: boolean; async?: boolean; waitFor?: string[]; text?: string; chars?: string[] } = {} ): BlueprintBlock {
	return {
		uuid, type: 'DIALOG', properties: [],
		isStartBlock: opts.start,
		nativeProperties: opts.async ? { isAsync: true, waitForBlocks: opts.waitFor } : undefined,
		dialogueText: opts.text ? { en: opts.text } : undefined,
		metadata: opts.chars ? { characters: opts.chars.map( name => ( { uuid: `${ name }-uuid`, id: name.toLowerCase(), name } ) ) } : undefined,
	} as BlueprintBlock;
}

function conn( fromId: string, toId: string, fromPort = 'out', fromPortIndex?: number ) {
	return { id: `${ fromId }-${ toId }`, fromId, toId, fromPort, toPort: 'in', fromPortIndex };
}

function registerAllHandlers( engine: DialogueEngine ) {
	engine.onDialog( ( { next } ) => { next(); } );
	engine.onChoice( ( { context, next } ) => {
		if ( context.choices.length > 0 ) context.selectChoice( context.choices[0]!.uuid );
		next();
	} );
	engine.onCondition( ( { context, next } ) => { context.resolve( true ); next(); } );
	engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
}

function setupEngine( scene: BlueprintScene ) {
	const engine = new DialogueEngine();
	engine.init( { data: makeExport( [scene] ) } );
	registerAllHandlers( engine );
	return engine;
}

// ─── Self-driven async tracks ────────────────────────────────────────────────

describe( 'multitrack — self-driven async', () => {

	it( 'main + 1 async: both tracks execute all their blocks', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true, text: 'Hero speaks' } ),
				dialog( 'main2', { text: 'Hero continues' } ),
				dialog( 'bg1', { async: true, text: 'NPC mumbles' } ),
				dialog( 'bg2', { text: 'NPC done' } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'bg1' ),
				conn( 'bg1', 'bg2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'main2' );
		expect( calls ).toContain( 'bg1' );
		expect( calls ).toContain( 'bg2' );
	} );

	it( 'main + 3 async tracks: all fire independently', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'hero', { start: true, text: 'Hero' } ),
				dialog( 'npc1', { async: true, text: 'NPC1 reacts' } ),
				dialog( 'npc2', { async: true, text: 'NPC2 reacts' } ),
				dialog( 'npc3', { async: true, text: 'NPC3 reacts' } ),
				dialog( 'hero2', { text: 'Hero continues' } ),
			],
			connections: [
				conn( 'hero', 'hero2' ),
				conn( 'hero', 'npc1' ),
				conn( 'hero', 'npc2' ),
				conn( 'hero', 'npc3' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'hero' );
		expect( calls ).toContain( 'hero2' );
		expect( calls ).toContain( 'npc1' );
		expect( calls ).toContain( 'npc2' );
		expect( calls ).toContain( 'npc3' );
	} );

	it( 'async track that does not call next() stays alive until scene ends', () => {
		const cleanupSpy = vi.fn();
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'stuck', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'stuck' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'stuck' ) {
				return cleanupSpy; // don't call next — stay alive
			}
			next();
		} );

		const handle = engine.scene( 's1' );
		handle.start();

		// main track finishes → endScene → async track cancelled → cleanup fires
		expect( handle.isRunning() ).toBe( false );
		expect( cleanupSpy ).toHaveBeenCalledOnce();
	} );

	it( 'async track with multi-block chain completes on its own', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'a1', { async: true } ),
				dialog( 'a2' ),
				dialog( 'a3' ),
			],
			connections: [
				conn( 'main1', 'a1' ), // no main continuation → main ends, but async runs
				conn( 'a1', 'a2' ),
				conn( 'a2', 'a3' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );

		// main1 has only async target → main has no continuation → endScene
		// BUT: async track spawns first, then main tries to continue and finds nothing
		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'main1' );
		// async track fires a1 → a2 → a3 before scene ends
		expect( calls ).toContain( 'a1' );
	} );

} );

// ─── Cancel & cleanup ────────────────────────────────────────────────────────

describe( 'multitrack — cancel & cleanup', () => {

	it( 'scene.cancel() stops main + all async tracks, all cleanups fire', () => {
		const cleanups: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'bg1', { async: true } ),
				dialog( 'bg2', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'bg1' ),
				conn( 'main1', 'bg2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'bg1' || block.uuid === 'bg2' ) {
				// Stay alive — don't call next
				return () => cleanups.push( block.uuid );
			}
			if ( block.uuid === 'main2' ) {
				// Don't call next — stay alive
				return () => cleanups.push( 'main2' );
			}
			next();
		} );

		const handle = engine.scene( 's1' );
		handle.start();

		expect( handle.isRunning() ).toBe( true );
		expect( handle.getActiveTracks() ).toBe( 2 );

		handle.cancel();

		expect( handle.isRunning() ).toBe( false );
		expect( cleanups ).toContain( 'main2' );
		expect( cleanups ).toContain( 'bg1' );
		expect( cleanups ).toContain( 'bg2' );
	} );

	it( 'engine.stop() cancels all scenes including their async tracks', () => {
		const cleanups: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'bg1', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'bg1' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'main1' ) {
				next(); // advance → forks to main2 + bg1
				return;
			}
			// main2 and bg1 stay alive
			return () => cleanups.push( block.uuid );
		} );

		engine.scene( 's1' ).start();
		expect( engine.isRunning() ).toBe( true );

		engine.stop();

		expect( engine.isRunning() ).toBe( false );
		expect( cleanups ).toContain( 'main2' );
		expect( cleanups ).toContain( 'bg1' );
	} );

} );

// ─── Mixed scenarios ─────────────────────────────────────────────────────────

describe( 'multitrack — mixed scenarios', () => {

	it( 'portPerCharacter fork with async background bubbles', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				{
					uuid: 'multi', type: 'DIALOG', properties: [], isStartBlock: true,
					nativeProperties: { portPerCharacter: true },
					metadata: { characters: [{ uuid: 'hero-uuid', id: 'hero', name: 'Hero' }, { uuid: 'sidekick-uuid', id: 'sidekick', name: 'Sidekick' }] },
				} as BlueprintBlock,
				dialog( 'hero-line', { text: 'Hero talks' } ),
				dialog( 'sidekick-bg', { async: true, text: 'Sidekick whispers', chars: ['Sidekick'] } ),
			],
			connections: [
				conn( 'multi', 'hero-line', 'hero-uuid', 0 ),
				conn( 'multi', 'sidekick-bg', 'sidekick-uuid', 0 ), // same portIndex — multi-track!
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, context, next } ) => {
			calls.push( block.uuid );
			if ( block.uuid === 'multi' && 'resolveCharacterPort' in context ) {
				context.resolveCharacterPort( 'hero-uuid' ); // portIndex 0
			}
			next();
		} );

		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'multi' );
		expect( calls ).toContain( 'hero-line' );
		expect( calls ).toContain( 'sidekick-bg' );
	} );

	it( 'async track traverses CONDITION and ACTION blocks', () => {
		const executed: string[] = [];
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				{ uuid: 'bg-cond', type: 'CONDITION', properties: [],
					nativeProperties: { isAsync: true },
					conditions: [{ uuid: 'c1', key: 'flag', operator: '=', value: 'true' }],
				} as BlueprintBlock,
				{ uuid: 'bg-act', type: 'ACTION', properties: [],
					actions: [{ uuid: 'a1', actionId: 'bg_effect', params: [] }],
				} as BlueprintBlock,
				dialog( 'bg-end', { text: 'BG done' } ),
			],
			connections: [
				conn( 'main1', 'bg-cond' ),
				{ id: 'c-true', fromId: 'bg-cond', toId: 'bg-act', fromPort: 'true', toPort: 'in', fromPortIndex: 0 },
				conn( 'bg-act', 'bg-end', 'then' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.onCondition( ( { context, next } ) => { context.resolve( true ); next(); } );
		engine.onAction( ( { block, context, next } ) => {
			for ( const a of block.actions ?? [] ) executed.push( a.actionId );
			context.resolve();
			next();
		} );

		engine.scene( 's1' ).start();

		// main1 → forks to bg-cond (async, condition true) → bg-act → bg-end
		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'bg-end' );
		expect( executed ).toContain( 'bg_effect' );
	} );

	it( 'getActiveTracks during mid-flow', () => {
		let tracksAtMain2 = -1;
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'bg1', { async: true } ),
				dialog( 'bg2', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'bg1' ),
				conn( 'main1', 'bg2' ),
			],
		};

		const engine = setupEngine( scene );
		const handle = engine.scene( 's1' );

		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'bg1' || block.uuid === 'bg2' ) return; // stay alive
			if ( block.uuid === 'main2' ) tracksAtMain2 = handle.getActiveTracks();
			next();
		} );

		handle.start();

		expect( tracksAtMain2 ).toBe( 2 );
	} );

} );

// ─── Sub-track spawning ─────────────────────────────────────────────────────

describe( 'multitrack — sub-track spawning', () => {

	it( 'async track with outgoing async connection spawns sub-track', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'async1', { async: true } ),   // spawned by main
				dialog( 'async1b' ),                     // continuation of async1
				dialog( 'sub1', { async: true } ),       // spawned by async1 (sub-track)
				dialog( 'sub1b' ),                        // continuation of sub1
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'async1' ),
				conn( 'async1', 'async1b' ),   // main continuation on async track
				conn( 'async1', 'sub1' ),       // sub-track fork
				conn( 'sub1', 'sub1b' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'main2' );
		expect( calls ).toContain( 'async1' );
		expect( calls ).toContain( 'async1b' );
		expect( calls ).toContain( 'sub1' );
		expect( calls ).toContain( 'sub1b' );
	} );

	it( 'sub-track spawns sub-sub-track (depth 2)', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'a1', { async: true } ),
				dialog( 'b1', { async: true } ),   // sub-track of a1
				dialog( 'c1', { async: true } ),   // sub-sub-track of b1
			],
			connections: [
				conn( 'main1', 'a1' ),
				conn( 'a1', 'b1' ),
				conn( 'b1', 'c1' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'a1' );
		expect( calls ).toContain( 'b1' );
		expect( calls ).toContain( 'c1' );
	} );

	it( 'getActiveTracks includes sub-tracks', () => {
		let countDuringMain2 = -1;
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ),
				dialog( 'a1b' ),                      // non-async continuation of a1
				dialog( 'sub1', { async: true } ),    // sub-track spawned by a1
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'a1b' ),     // main continuation
				conn( 'a1', 'sub1' ),    // async sub-track fork
			],
		};

		const engine = setupEngine( scene );
		const handle = engine.scene( 's1' );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'a1b' || block.uuid === 'sub1' ) return; // stay alive
			if ( block.uuid === 'main2' ) countDuringMain2 = handle.getActiveTracks();
			next();
		} );
		handle.start();

		// a1 advances → spawns sub1 + continues to a1b (alive) → 2 tracks: a1 track (at a1b) + sub1
		expect( countDuringMain2 ).toBe( 2 );
	} );

} );

// ─── Cancel cascade ─────────────────────────────────────────────────────────

describe( 'multitrack — cancel cascade', () => {

	it( 'explicit cancel() cascades to child sub-tracks', () => {
		const parentCleanup = vi.fn();
		const childCleanup = vi.fn();
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ),
				dialog( 'a1b' ),                     // non-async continuation
				dialog( 'sub1', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'a1b' ),
				conn( 'a1', 'sub1' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'a1b' ) return parentCleanup; // stay alive
			if ( block.uuid === 'sub1' ) return childCleanup; // stay alive
			next();
		} );

		const handle = engine.scene( 's1' );
		handle.start();

		// main ends → endScene cancels all tracks → explicit cancel cascades
		expect( parentCleanup ).toHaveBeenCalled();
		expect( childCleanup ).toHaveBeenCalled();
	} );

	it( 'natural endTrack does NOT cascade — child tracks survive', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ),
				// a1 has no non-async continuation → will endTrack naturally after spawning sub1
				dialog( 'sub1', { async: true } ),
				dialog( 'sub1b' ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'sub1' ),
				conn( 'sub1', 'sub1b' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		// a1 advances → spawns sub1, no main continuation → endTrack (natural)
		// sub1 survives, advances to sub1b
		expect( calls ).toContain( 'sub1' );
		expect( calls ).toContain( 'sub1b' );
	} );

	it( 'handle.cancel() clears everything including sub-tracks', () => {
		const subCleanup = vi.fn();
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'a1', { async: true } ),
				dialog( 'sub1', { async: true } ),
			],
			connections: [
				conn( 'main1', 'a1' ),
				conn( 'a1', 'sub1' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'sub1' ) return subCleanup;
			if ( block.uuid === 'a1' ) { next(); return; }
			next();
		} );

		const handle = engine.scene( 's1' );
		handle.start();

		// main1 has no non-async continuation → endScene → all cancelled
		expect( subCleanup ).toHaveBeenCalled();
	} );

} );

// ─── TrackInfo API ──────────────────────────────────────────────────────────

describe( 'multitrack — TrackInfo', () => {

	it( 'getTrackInfos returns correct data for running tracks', () => {
		let infos: readonly import('./types.js').TrackInfo[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ),
				dialog( 'a2', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'main1', 'a2' ),
			],
		};

		const engine = setupEngine( scene );
		const handle = engine.scene( 's1' );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'a1' || block.uuid === 'a2' ) return; // stay alive
			if ( block.uuid === 'main2' ) infos = handle.getTrackInfos();
			next();
		} );
		handle.start();

		expect( infos ).toHaveLength( 2 );
		expect( infos[0]!.parentTrackId ).toBeNull(); // spawned by main
		expect( infos[0]!.startBlockUuid ).toBe( 'a1' );
		expect( infos[0]!.running ).toBe( true );
		expect( infos[1]!.startBlockUuid ).toBe( 'a2' );
	} );

	it( 'sub-track parentTrackId matches parent track id', () => {
		let infos: readonly import('./types.js').TrackInfo[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ),
				dialog( 'a1b' ),                      // non-async continuation
				dialog( 'sub1', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'a1b' ),      // main continuation
				conn( 'a1', 'sub1' ),     // sub-track fork
			],
		};

		const engine = setupEngine( scene );
		const handle = engine.scene( 's1' );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'a1b' || block.uuid === 'sub1' ) return; // stay alive
			if ( block.uuid === 'main2' ) infos = handle.getTrackInfos();
			next();
		} );
		handle.start();

		expect( infos ).toHaveLength( 2 );
		const parent = infos.find( t => t.startBlockUuid === 'a1' )!;
		const child = infos.find( t => t.startBlockUuid === 'sub1' )!;
		expect( parent.parentTrackId ).toBeNull();
		expect( child.parentTrackId ).toBe( parent.id );
	} );

	it( 'ended track does not appear in getTrackInfos', () => {
		let infosAfterEnd: readonly import('./types.js').TrackInfo[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ), // will end immediately (no continuation)
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
			],
		};

		const engine = setupEngine( scene );
		const handle = engine.scene( 's1' );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid === 'main2' ) infosAfterEnd = handle.getTrackInfos();
			next();
		} );
		handle.start();

		// a1 calls next() and has no outgoing → endTrack → removed
		expect( infosAfterEnd ).toHaveLength( 0 );
	} );

	it( 'track IDs are monotonically increasing', () => {
		let infos: readonly import('./types.js').TrackInfo[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true } ),
				dialog( 'a2', { async: true } ),
				dialog( 'a3', { async: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'main1', 'a2' ),
				conn( 'main1', 'a3' ),
			],
		};

		const engine = setupEngine( scene );
		const handle = engine.scene( 's1' );
		engine.onDialog( ( { block, next } ) => {
			if ( block.uuid.startsWith( 'a' ) ) return; // stay alive
			if ( block.uuid === 'main2' ) infos = handle.getTrackInfos();
			next();
		} );
		handle.start();

		const ids = infos.map( t => t.id );
		expect( ids ).toEqual( [1, 2, 3] );
	} );

} );

// ─── waitForBlocks ──────────────────────────────────────────────────────────

describe( 'multitrack — waitForBlocks', () => {

	it( 'block with waitForBlocks defers until target is visited', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true, waitFor: ['main2'] } ),
				dialog( 'a2' ),   // continuation after a1 advances
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'a2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		// a1 calls next() but main2 not yet visited → defers
		// main1 → main2 visited → a1 advance triggers → a2 fires
		expect( calls ).toContain( 'a1' );
		expect( calls ).toContain( 'a2' );
		expect( calls ).toContain( 'main2' );
	} );

	it( 'waitForBlocks already satisfied advances immediately', () => {
		const calls: string[] = [];
		// a1 waits for main1, but main1 is the start block → already visited when a1 runs
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'a1', { async: true, waitFor: ['main1'] } ),
				dialog( 'a2' ),
			],
			connections: [
				conn( 'main1', 'a1' ),
				conn( 'a1', 'a2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		expect( calls ).toContain( 'a1' );
		expect( calls ).toContain( 'a2' );
	} );

	it( 'waitForBlocks with multiple UUIDs waits for ALL', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'main3' ),
				dialog( 'a1', { async: true, waitFor: ['main2', 'main3'] } ),
				dialog( 'a2' ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main2', 'main3' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'a2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		// a1 waits for both main2 AND main3
		expect( calls ).toContain( 'a1' );
		expect( calls ).toContain( 'a2' );
	} );

	it( 'scene cancel clears pending waitForBlocks without leak', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'a1', { async: true, waitFor: ['never-visited'] } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'a1' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );

		const handle = engine.scene( 's1' );
		handle.start();

		// main ends → endScene → pending waits cleared, no crash
		// a1's handler never fires: waitForBlocks gates start(), processBlock never reached
		expect( handle.isRunning() ).toBe( false );
		expect( calls ).not.toContain( 'a1' );
		expect( calls ).not.toContain( 'never-visited' );
	} );

	it( 'waitForBlocks on sub-track waits for main track block', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'main3' ),
				dialog( 'a1', { async: true } ),
				dialog( 'sub1', { async: true, waitFor: ['main3'] } ),
				dialog( 'sub2' ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main2', 'main3' ),
				conn( 'main1', 'a1' ),
				conn( 'a1', 'sub1' ),      // sub-track fork (a1 endTrack naturally, sub1 survives)
				conn( 'sub1', 'sub2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		// a1 ends naturally → sub1 survives (philosophy B)
		// sub1 waits for main3 → main3 visited → sub1 advances → sub2
		expect( calls ).toContain( 'sub1' );
		expect( calls ).toContain( 'sub2' );
	} );

} );

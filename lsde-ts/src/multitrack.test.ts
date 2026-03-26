import { describe, it, expect, vi } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { BlueprintExport, BlueprintScene, BlueprintBlock } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeExport( scenes: BlueprintScene[] ): BlueprintExport {
	return { version: '1.0.0', exportDate: '2025-01-01', locales: ['en'], scenes };
}

function dialog( uuid: string, opts: { start?: boolean; async?: boolean; follow?: boolean; text?: string; chars?: string[] } = {} ): BlueprintBlock {
	return {
		uuid, type: 'DIALOG', properties: [],
		isStartBlock: opts.start,
		nativeProperties: ( opts.async || opts.follow ) ? { isAsync: true, followNarrative: opts.follow } : undefined,
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

// ─── Follow-narrative tracks ─────────────────────────────────────────────────

describe( 'multitrack — follow-narrative', () => {

	it( 'follow track advances in sync with main track', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true, text: 'Hero: line 1' } ),
				dialog( 'main2', { text: 'Hero: line 2' } ),
				dialog( 'main3', { text: 'Hero: line 3' } ),
				dialog( 'crowd1', { async: true, follow: true, text: 'Crowd: ooh' } ),
				dialog( 'crowd2', { follow: true, text: 'Crowd: aah' } ),
				dialog( 'crowd3', { follow: true, text: 'Crowd: wow' } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main2', 'main3' ),
				conn( 'main1', 'crowd1' ),
				conn( 'crowd1', 'crowd2' ),
				conn( 'crowd2', 'crowd3' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );
		engine.scene( 's1' ).start();

		// main1 next → main2 fires + follow notified (crowd1→crowd2)
		// main2 next → main3 fires + follow notified (crowd2→crowd3)
		// main3 next → endScene, follow cancelled
		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'main2' );
		expect( calls ).toContain( 'main3' );
		expect( calls ).toContain( 'crowd1' );
		expect( calls ).toContain( 'crowd2' );
		expect( calls ).toContain( 'crowd3' );
	} );

	it( 'follow track shorter than main: ends silently, main continues', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'main3' ),
				dialog( 'main4' ),
				dialog( 'f1', { async: true, follow: true } ),
				// f1 has no continuation → track ends after first advance
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main2', 'main3' ),
				conn( 'main3', 'main4' ),
				conn( 'main1', 'f1' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => { calls.push( block.uuid ); next(); } );

		const handle = engine.scene( 's1' );
		handle.start();

		expect( calls ).toContain( 'main4' );
		expect( calls ).toContain( 'f1' );
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'follow track longer than main: remaining blocks cancelled with cleanup', () => {
		const cleanupSpy = vi.fn();
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				// main has only 1 block → ends fast
				dialog( 'f1', { async: true, follow: true } ),
				dialog( 'f2', { follow: true } ),
				dialog( 'f3', { follow: true } ),
			],
			connections: [
				conn( 'main1', 'f1' ),
				conn( 'f1', 'f2' ),
				conn( 'f2', 'f3' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			calls.push( block.uuid );
			if ( block.uuid === 'f1' ) {
				next();
				return cleanupSpy;
			}
			next();
		} );

		engine.scene( 's1' ).start();

		// main1 has no non-async continuation → endScene → follow cancelled
		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'f1' );
		// f2/f3 never reached because scene ends
		expect( calls ).not.toContain( 'f3' );
	} );

	it( 'follow-narrative force-advances when handler has not called next()', () => {
		const calls: string[] = [];
		const scene: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'main1', { start: true } ),
				dialog( 'main2' ),
				dialog( 'f1', { async: true, follow: true } ),
				dialog( 'f2', { follow: true } ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'f1' ),
				conn( 'f1', 'f2' ),
			],
		};

		const engine = setupEngine( scene );
		engine.onDialog( ( { block, next } ) => {
			calls.push( block.uuid );
			if ( block.uuid === 'f1' ) {
				// Intentionally do NOT call next() — simulating a slow animation
				return;
			}
			next();
		} );

		engine.scene( 's1' ).start();

		// main1 → main2, follow is notified but f1 never called next()
		// notifyMainAdvance force-advances f1 → f2
		expect( calls ).toContain( 'f1' );
		expect( calls ).toContain( 'f2' );
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

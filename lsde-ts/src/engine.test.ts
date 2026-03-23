import { describe, it, expect, vi } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { BlueprintExport, BlueprintScene, StateBridge } from './types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function linearScene(): BlueprintScene {
	return {
		uuid: 'scene-1', label: 'Linear', date: '2025-01-01',
		blocks: [
			{ uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true, dialogueText: { en: 'Hello' } },
			{ uuid: 'b2', type: 'DIALOG', properties: [], dialogueText: { en: 'World' } },
		],
		connections: [
			{ id: 'c1', fromId: 'b1', toId: 'b2', fromPort: 'out', toPort: 'in' },
		],
	};
}

function makeExport( scenes: BlueprintScene[] = [linearScene()] ): BlueprintExport {
	return {
		version: '1.0.0', exportDate: '2025-01-01', locales: ['en'],
		scenes,
	};
}

function makeBridge(): StateBridge {
	return {
		evaluateCondition: () => true,
		executeAction: vi.fn(),
		resolveDictionary: () => '',
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe( 'DialogueEngine', () => {

	describe( 'init', () => {

		it( 'returns no errors for valid data', () => {
			const engine = new DialogueEngine();
			const report = engine.init( { data: makeExport() } );
			expect( report.errors ).toHaveLength( 0 );
			expect( report.stats.sceneCount ).toBe( 1 );
		} );

		it( 'returns errors for invalid data', () => {
			const engine = new DialogueEngine();
			const report = engine.init( { data: { ...makeExport(), scenes: [] } } );
			expect( report.errors.length ).toBeGreaterThan( 0 );
		} );

	} );

	describe( 'scene', () => {

		it( 'throws before init', () => {
			const engine = new DialogueEngine();
			expect( () => engine.scene( 'scene-1' ) ).toThrow( 'init' );
		} );

		it( 'throws for unknown scene ID', () => {
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );
			expect( () => engine.scene( 'nonexistent' ) ).toThrow( 'not found' );
		} );

		it( 'creates a scene handle without starting it', () => {
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );
			const handle = engine.scene( 'scene-1' );
			expect( handle.isRunning() ).toBe( false );
			expect( engine.isRunning() ).toBe( false );
		} );

	} );

	describe( 'full lifecycle', () => {

		it( 'traverses a linear scene end-to-end', () => {
			const visited: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );
			engine.setLocale( 'en' );
			engine.setStateBridge( makeBridge() );

			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );

			const handle = engine.scene( 'scene-1' );
			handle.start();

			expect( visited ).toEqual( ['b1', 'b2'] );
			expect( handle.isRunning() ).toBe( false );
			expect( engine.isRunning() ).toBe( false );
		} );

		it( 'tracks active scenes', () => {
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );

			let capturedRunning = false;
			engine.onDialog( ( { next } ) => {
				capturedRunning = engine.isRunning();
				// Don't call next — stay active
			} );

			const handle = engine.scene( 'scene-1' );
			handle.start();

			expect( capturedRunning ).toBe( true );
			expect( engine.isRunning() ).toBe( true );
			expect( engine.getActiveScenes() ).toHaveLength( 1 );
			expect( engine.getCurrentBlocks() ).toHaveLength( 1 );
		} );

		it( 'stop() cancels all active scenes', () => {
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );

			engine.onDialog( () => {
				// Don't call next — stay active
			} );

			const handle = engine.scene( 'scene-1' );
			handle.start();
			expect( engine.isRunning() ).toBe( true );

			engine.stop();
			expect( engine.isRunning() ).toBe( false );
			expect( handle.isRunning() ).toBe( false );
		} );

	} );

	describe( 'handler priority integration', () => {

		it( 'scene handler + global handler both fire', () => {
			const calls: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );

			engine.onDialog( ( { next } ) => {
				calls.push( 'global' );
				next();
			} );

			const handle = engine.scene( 'scene-1' );
			handle.onDialog( ( { next } ) => {
				calls.push( 'scene' );
				next();
			} );
			handle.start();

			// Scene fires first, then global. Both call next() but only one advance.
			expect( calls ).toContain( 'scene' );
			expect( calls ).toContain( 'global' );
			expect( calls.indexOf( 'scene' ) ).toBeLessThan( calls.indexOf( 'global' ) );
		} );

		it( 'onBlock overrides scene type handler', () => {
			const calls: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );

			engine.onDialog( ( { next } ) => {
				calls.push( 'global' );
				next();
			} );

			const handle = engine.scene( 'scene-1' );
			handle.onDialog( ( ) => {
				calls.push( 'scene-dialog' );
			} );
			handle.onBlock( 'b1', ( { context, next } ) => {
				calls.push( 'block-override' );
				context.preventGlobalHandler();
				next();
			} );
			handle.start();

			// b1: block override fires, global prevented
			// b2: scene dialog fires, global fires
			expect( calls[0] ).toBe( 'block-override' );
		} );

	} );

	describe( 'auto-behavior', () => {

		it( 'auto-evaluates conditions when no handler', () => {
			const condScene: BlueprintScene = {
				uuid: 'scene-cond', label: 'Cond', date: '2025-01-01',
				blocks: [
					{ uuid: 'cond1', type: 'CONDITION', properties: [], isStartBlock: true,
						conditions: [{ uuid: 'c1', key: 'quest', operator: '=', value: 'active' }] },
					{ uuid: 'yes', type: 'DIALOG', properties: [] },
					{ uuid: 'no', type: 'DIALOG', properties: [] },
				],
				connections: [
					{ id: 'ct', fromId: 'cond1', toId: 'yes', fromPort: 'true', toPort: 'in', fromPortIndex: 0 },
					{ id: 'cf', fromId: 'cond1', toId: 'no', fromPort: 'false', toPort: 'in', fromPortIndex: 1 },
				],
			};

			const visited: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [condScene] ) } );
			engine.setStateBridge( {
				evaluateCondition: () => false, // → false branch
				executeAction: vi.fn(),
				resolveDictionary: () => '',
			} );
			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );

			engine.scene( 'scene-cond' ).start();
			expect( visited ).toEqual( ['no'] );
		} );

		it( 'auto-executes actions when no handler', () => {
			const executed: string[] = [];
			const actScene: BlueprintScene = {
				uuid: 'scene-act', label: 'Act', date: '2025-01-01',
				blocks: [
					{ uuid: 'act1', type: 'ACTION', properties: [], isStartBlock: true,
						actions: [{ uuid: 'a1', actionId: 'give_item', params: ['sword'] }] },
					{ uuid: 'after', type: 'DIALOG', properties: [] },
				],
				connections: [
					{ id: 'c1', fromId: 'act1', toId: 'after', fromPort: 'out', toPort: 'in' },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [actScene] ) } );
			engine.setStateBridge( {
				evaluateCondition: () => true,
				executeAction: ( action ) => { executed.push( action.actionId ); },
				resolveDictionary: () => '',
			} );
			engine.onDialog( ( { next } ) => next() );

			engine.scene( 'scene-act' ).start();
			expect( executed ).toEqual( ['give_item'] );
		} );

	} );

	describe( 'getSceneConnections', () => {

		it( 'returns connections for a known scene', () => {
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );
			expect( engine.getSceneConnections( 'scene-1' ) ).toHaveLength( 1 );
		} );

		it( 'returns empty array for unknown scene', () => {
			const engine = new DialogueEngine();
			engine.init( { data: makeExport() } );
			expect( engine.getSceneConnections( 'unknown' ) ).toEqual( [] );
		} );

	} );

} );

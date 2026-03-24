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
		resolveCharacter: ( chars ) => chars[0],
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
				resolveCharacter: ( chars ) => chars[0],
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
				resolveCharacter: ( chars ) => chars[0],
			} );
			engine.onDialog( ( { next } ) => next() );

			engine.scene( 'scene-act' ).start();
			expect( executed ).toEqual( ['give_item'] );
		} );

	} );

	// ─── Realistic dev scenarios ─────────────────────────────────────────────

	describe( 'choice flow with selectChoice', () => {

		const choiceScene: BlueprintScene = {
			uuid: 'scene-choice', label: 'Choice', date: '2025-01-01',
			blocks: [
				{ uuid: 'greeting', type: 'DIALOG', properties: [], isStartBlock: true,
					dialogueText: { en: 'Welcome!' } },
				{ uuid: 'choice1', type: 'CHOICE', properties: [],
					choices: [
						{ uuid: 'opt-buy', structureKey: 'buy', dialogueText: { en: 'Buy' } },
						{ uuid: 'opt-leave', structureKey: 'leave', dialogueText: { en: 'Leave' },
							visibilityConditions: [{ uuid: 'vc1', key: 'can_leave', operator: '=', value: 'true' }] },
					] },
				{ uuid: 'shop', type: 'DIALOG', properties: [], dialogueText: { en: 'Here are my wares.' } },
				{ uuid: 'bye', type: 'DIALOG', properties: [], dialogueText: { en: 'Safe travels.' } },
			],
			connections: [
				{ id: 'c1', fromId: 'greeting', toId: 'choice1', fromPort: 'out', toPort: 'in' },
				{ id: 'c2', fromId: 'choice1', toId: 'shop', fromPort: 'opt-buy', toPort: 'in' },
				{ id: 'c3', fromId: 'choice1', toId: 'bye', fromPort: 'opt-leave', toPort: 'in' },
			],
		};

		it( 'dev selects a choice and follows the branch', () => {
			const visited: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [choiceScene] ) } );
			engine.setStateBridge( {
				evaluateCondition: () => true,
				executeAction: vi.fn(),
				resolveDictionary: () => '',
				resolveCharacter: ( chars ) => chars[0],
			} );

			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );
			engine.onChoice( ( { context, next } ) => {
				// Dev picks the first visible choice
				context.selectChoice( context.choices[0]!.uuid );
				next();
			} );

			engine.scene( 'scene-choice' ).start();
			expect( visited ).toEqual( ['greeting', 'shop'] );
		} );

		it( 'visibility conditions filter choices before handler', () => {
			let visibleCount = 0;
			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [choiceScene] ) } );
			engine.setStateBridge( {
				evaluateCondition: () => false, // can_leave = false → opt-leave hidden
				executeAction: vi.fn(),
				resolveDictionary: () => '',
				resolveCharacter: ( chars ) => chars[0],
			} );

			engine.onDialog( ( { next } ) => next() );
			engine.onChoice( ( { context, next } ) => {
				visibleCount = context.choices.length;
				context.selectChoice( context.choices[0]!.uuid );
				next();
			} );

			engine.scene( 'scene-choice' ).start();
			expect( visibleCount ).toBe( 1 ); // only "Buy" visible
		} );

	} );

	describe( 'portPerCharacter flow', () => {

		const charScene: BlueprintScene = {
			uuid: 'scene-char', label: 'Characters', date: '2025-01-01',
			blocks: [
				{ uuid: 'multi', type: 'DIALOG', properties: [], isStartBlock: true,
					nativeProperties: { portPerCharacter: true },
					dialogueText: { en: 'Who speaks?' },
					metadata: { characters: [
						{ name: 'Hero', emotion: 'neutral' },
						{ name: 'Boss', emotion: 'angry' },
					] } },
				{ uuid: 'hero-path', type: 'DIALOG', properties: [], dialogueText: { en: 'Hero speaks.' } },
				{ uuid: 'boss-path', type: 'DIALOG', properties: [], dialogueText: { en: 'Boss roars.' } },
				{ uuid: 'fallback', type: 'DIALOG', properties: [], dialogueText: { en: 'Default.' } },
			],
			connections: [
				{ id: 'c-hero', fromId: 'multi', toId: 'hero-path', fromPort: 'hero-var-uuid', toPort: 'in', fromPortIndex: 0 },
				{ id: 'c-boss', fromId: 'multi', toId: 'boss-path', fromPort: 'boss-var-uuid', toPort: 'in', fromPortIndex: 1 },
				{ id: 'c-else', fromId: 'multi', toId: 'fallback', fromPort: 'out', toPort: 'in' },
			],
		};

		it( 'dev resolves character port and follows the correct branch', () => {
			const visited: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [charScene] ) } );

			engine.onDialog( ( { block, context, next } ) => {
				visited.push( block.uuid );
				if ( block.uuid === 'multi' && 'resolveCharacterPort' in context ) {
					context.resolveCharacterPort( 'Boss' );
				}
				next();
			} );

			engine.scene( 'scene-char' ).start();
			expect( visited ).toEqual( ['multi', 'boss-path'] );
		} );

		it( 'falls back to "out" port for unknown character', () => {
			const visited: string[] = [];
			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [charScene] ) } );

			engine.onDialog( ( { block, context, next } ) => {
				visited.push( block.uuid );
				if ( block.uuid === 'multi' && 'resolveCharacterPort' in context ) {
					context.resolveCharacterPort( 'Ghost' ); // not in metadata
				}
				next();
			} );

			engine.scene( 'scene-char' ).start();
			expect( visited ).toEqual( ['multi', 'fallback'] );
		} );

	} );

	describe( 'action catch path', () => {

		it( 'follows catch path when action handler rejects', () => {
			const visited: string[] = [];
			const actScene: BlueprintScene = {
				uuid: 'scene-catch', label: 'Catch', date: '2025-01-01',
				blocks: [
					{ uuid: 'act1', type: 'ACTION', properties: [], isStartBlock: true,
						actions: [{ uuid: 'a1', actionId: 'risky_op', params: [] }] },
					{ uuid: 'success', type: 'DIALOG', properties: [] },
					{ uuid: 'failure', type: 'DIALOG', properties: [] },
				],
				connections: [
					{ id: 'c-ok', fromId: 'act1', toId: 'success', fromPort: 'then', toPort: 'in', fromPortIndex: 0 },
					{ id: 'c-err', fromId: 'act1', toId: 'failure', fromPort: 'catch', toPort: 'in', fromPortIndex: 1 },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [actScene] ) } );

			engine.onAction( ( { context, next } ) => {
				context.reject( new Error( 'something broke' ) );
				next();
			} );
			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );

			engine.scene( 'scene-catch' ).start();
			expect( visited ).toEqual( ['failure'] );
		} );

		it( 'follows then path when action resolves', () => {
			const visited: string[] = [];
			const actScene: BlueprintScene = {
				uuid: 'scene-ok', label: 'OK', date: '2025-01-01',
				blocks: [
					{ uuid: 'act1', type: 'ACTION', properties: [], isStartBlock: true,
						actions: [{ uuid: 'a1', actionId: 'safe_op', params: [] }] },
					{ uuid: 'success', type: 'DIALOG', properties: [] },
					{ uuid: 'failure', type: 'DIALOG', properties: [] },
				],
				connections: [
					{ id: 'c-ok', fromId: 'act1', toId: 'success', fromPort: 'then', toPort: 'in', fromPortIndex: 0 },
					{ id: 'c-err', fromId: 'act1', toId: 'failure', fromPort: 'catch', toPort: 'in', fromPortIndex: 1 },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [actScene] ) } );

			engine.onAction( ( { context, next } ) => {
				context.resolve();
				next();
			} );
			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );

			engine.scene( 'scene-ok' ).start();
			expect( visited ).toEqual( ['success'] );
		} );

	} );

	describe( 'loop scenario (choice back to start)', () => {

		it( 'loops once then exits', () => {
			const visited: string[] = [];
			let loopCount = 0;

			const loopScene: BlueprintScene = {
				uuid: 'scene-loop', label: 'Loop', date: '2025-01-01',
				blocks: [
					{ uuid: 'start', type: 'DIALOG', properties: [], isStartBlock: true },
					{ uuid: 'ask', type: 'CHOICE', properties: [],
						choices: [
							{ uuid: 'again', structureKey: 'again', dialogueText: { en: 'Again' } },
							{ uuid: 'done', structureKey: 'done', dialogueText: { en: 'Done' } },
						] },
					{ uuid: 'end', type: 'DIALOG', properties: [] },
				],
				connections: [
					{ id: 'c1', fromId: 'start', toId: 'ask', fromPort: 'out', toPort: 'in' },
					{ id: 'c2', fromId: 'ask', toId: 'start', fromPort: 'again', toPort: 'in' },  // LOOP!
					{ id: 'c3', fromId: 'ask', toId: 'end', fromPort: 'done', toPort: 'in' },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [loopScene] ) } );

			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );
			engine.onChoice( ( { context, next } ) => {
				loopCount++;
				if ( loopCount < 3 ) {
					context.selectChoice( 'again' ); // loop back
				} else {
					context.selectChoice( 'done' );  // exit
				}
				next();
			} );

			engine.scene( 'scene-loop' ).start();
			// start → ask → (again) → start → ask → (again) → start → ask → (done) → end
			expect( visited ).toEqual( ['start', 'start', 'start', 'end'] );
			expect( loopCount ).toBe( 3 );
		} );

	} );

	describe( 'multi-track async + follow scenario', () => {

		it( 'main track + async background + follow-narrative all execute', () => {
			const calls: string[] = [];

			const multiScene: BlueprintScene = {
				uuid: 'scene-multi', label: 'Multi', date: '2025-01-01',
				blocks: [
					{ uuid: 'main1', type: 'DIALOG', properties: [], isStartBlock: true,
						dialogueText: { en: 'Hero speaks' },
						metadata: { characters: [{ name: 'Hero' }] } },
					{ uuid: 'main2', type: 'DIALOG', properties: [],
						dialogueText: { en: 'Hero continues' } },
					{ uuid: 'bg1', type: 'DIALOG', properties: [],
						nativeProperties: { isAsync: true },
						dialogueText: { en: 'NPC mumbles in background' },
						metadata: { characters: [{ name: 'NPC' }] } },
					{ uuid: 'bg2', type: 'DIALOG', properties: [],
						dialogueText: { en: 'NPC finishes mumbling' } },
					{ uuid: 'follow1', type: 'DIALOG', properties: [],
						nativeProperties: { isAsync: true, followNarrative: true },
						dialogueText: { en: 'Crowd reacts' } },
					{ uuid: 'follow2', type: 'DIALOG', properties: [],
						nativeProperties: { isAsync: true, followNarrative: true },
						dialogueText: { en: 'Crowd cheers' } },
				],
				connections: [
					// Main track
					{ id: 'c-main', fromId: 'main1', toId: 'main2', fromPort: 'out', toPort: 'in' },
					// Async background fork (self-driven)
					{ id: 'c-bg', fromId: 'main1', toId: 'bg1', fromPort: 'out', toPort: 'in' },
					{ id: 'c-bg2', fromId: 'bg1', toId: 'bg2', fromPort: 'out', toPort: 'in' },
					// Follow-narrative fork
					{ id: 'c-follow', fromId: 'main1', toId: 'follow1', fromPort: 'out', toPort: 'in' },
					{ id: 'c-follow2', fromId: 'follow1', toId: 'follow2', fromPort: 'out', toPort: 'in' },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [multiScene] ) } );

			engine.onDialog( ( { block, next } ) => {
				calls.push( block.uuid );
				next();
			} );

			const handle = engine.scene( 'scene-multi' );
			handle.start();

			// main1 → forks to main2 (main) + bg1 (async, self-driven) + follow1 (async, follow)
			// bg1 calls next() → bg2 (self-driven async track completes)
			// main1 next → main2 fires + follow1 notified → follow1 advances to follow2
			// main2 next → end scene → follow track cancelled
			expect( calls ).toContain( 'main1' );
			expect( calls ).toContain( 'main2' );
			expect( calls ).toContain( 'bg1' );
			expect( calls ).toContain( 'bg2' );
			expect( calls ).toContain( 'follow1' );
			expect( calls ).toContain( 'follow2' );
		} );

		it( 'scene lifecycle hooks fire around multi-track flow', () => {
			const enterSpy = vi.fn();
			const exitSpy = vi.fn();

			const simpleMulti: BlueprintScene = {
				uuid: 'scene-hooks', label: 'Hooks', date: '2025-01-01',
				blocks: [
					{ uuid: 'm1', type: 'DIALOG', properties: [], isStartBlock: true },
					{ uuid: 'a1', type: 'DIALOG', properties: [],
						nativeProperties: { isAsync: true } },
				],
				connections: [
					{ id: 'c1', fromId: 'm1', toId: 'a1', fromPort: 'out', toPort: 'in' },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [simpleMulti] ) } );
			engine.onSceneEnter( enterSpy );
			engine.onSceneExit( exitSpy );
			engine.onDialog( ( { next } ) => next() );

			engine.scene( 'scene-hooks' ).start();

			expect( enterSpy ).toHaveBeenCalledOnce();
			expect( exitSpy ).toHaveBeenCalledOnce();
		} );

	} );

	describe( 'mixed full scenario (like blueprint.json)', () => {

		it( 'traverses DIALOG → CHOICE → CONDITION → DIALOG with all block types', () => {
			const visited: string[] = [];
			const executed: string[] = [];

			const fullScene: BlueprintScene = {
				uuid: 'scene-full', label: 'Full', date: '2025-01-01',
				blocks: [
					// Start with action
					{ uuid: 'act', type: 'ACTION', properties: [], isStartBlock: true,
						actions: [{ uuid: 'a1', actionId: 'setup_quest', params: ['main'] }] },
					// Then dialog
					{ uuid: 'greet', type: 'DIALOG', properties: [],
						dialogueText: { en: 'Greetings, adventurer!' },
						metadata: { characters: [{ name: 'Elder' }] } },
					// Then choice
					{ uuid: 'choice', type: 'CHOICE', properties: [],
						choices: [
							{ uuid: 'opt-accept', structureKey: 'accept', dialogueText: { en: 'I accept the quest.' } },
							{ uuid: 'opt-refuse', structureKey: 'refuse', dialogueText: { en: 'Not interested.' } },
						] },
					// Accept → condition check
					{ uuid: 'cond', type: 'CONDITION', properties: [],
						conditions: [{ uuid: 'cv1', key: 'player_level', operator: '>', value: '5' }] },
					// Condition true → success dialog
					{ uuid: 'success', type: 'DIALOG', properties: [], dialogueText: { en: 'You are worthy!' } },
					// Condition false → fail dialog
					{ uuid: 'fail', type: 'DIALOG', properties: [], dialogueText: { en: 'Too weak...' } },
					// Refuse → goodbye
					{ uuid: 'refuse-msg', type: 'DIALOG', properties: [], dialogueText: { en: 'Very well. Goodbye.' } },
					// NOTE block (should be skipped)
					{ uuid: 'note1', type: 'NOTE', properties: [] },
				],
				connections: [
					{ id: 'c1', fromId: 'act', toId: 'note1', fromPort: 'then', toPort: 'in' },
					{ id: 'c-note', fromId: 'note1', toId: 'greet', fromPort: 'out', toPort: 'in' },
					{ id: 'c2', fromId: 'greet', toId: 'choice', fromPort: 'out', toPort: 'in' },
					{ id: 'c3', fromId: 'choice', toId: 'cond', fromPort: 'opt-accept', toPort: 'in' },
					{ id: 'c4', fromId: 'choice', toId: 'refuse-msg', fromPort: 'opt-refuse', toPort: 'in' },
					{ id: 'c5', fromId: 'cond', toId: 'success', fromPort: 'true', toPort: 'in', fromPortIndex: 0 },
					{ id: 'c6', fromId: 'cond', toId: 'fail', fromPort: 'false', toPort: 'in', fromPortIndex: 1 },
				],
			};

			const engine = new DialogueEngine();
			engine.init( { data: makeExport( [fullScene] ) } );
			engine.setStateBridge( {
				evaluateCondition: ( c ) => c.key === 'player_level', // returns true
				executeAction: ( action ) => { executed.push( action.actionId ); },
				resolveDictionary: () => '',
				resolveCharacter: ( chars ) => chars[0],
			} );

			engine.onDialog( ( { block, next } ) => {
				visited.push( block.uuid );
				next();
			} );
			engine.onChoice( ( { context, next } ) => {
				context.selectChoice( 'opt-accept' );
				next();
			} );
			// No onAction/onCondition → auto-behavior

			engine.scene( 'scene-full' ).start();

			// act (auto) → NOTE (skip) → greet → choice (accept) → cond (auto, true) → success
			expect( executed ).toEqual( ['setup_quest'] );
			expect( visited ).toEqual( ['greet', 'success'] );
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

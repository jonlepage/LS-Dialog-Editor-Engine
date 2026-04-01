// Cross-language test runner — reads JSON test specs and executes against the TS engine.
// Each runtime (C#, GDScript, C++) implements an equivalent runner for conformance.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DialogueEngine } from './engine.js';
import type {
	BlueprintExport, ConditionBlock,
	DialogContext, ChoiceContext, ConditionContext, ActionContext,
} from './types.js';
import { evaluateConditionGroups } from './condition-evaluator.js';

// ─── JSON Schema Types ──────────────────────────────────────────────────────

interface TestFile {
	version: string;
	suites: TestSuite[];
}

interface TestSuiteBridge {
	conditions?: Record<string, boolean>;
	dictionaries?: Record<string, string>;
	actions?: Record<string, string>;
}

interface TestSuite {
	id: string;
	description: string;
	blueprint: BlueprintExport;
	sceneId?: string;
	locale?: string;
	stateBridge?: TestSuiteBridge;
	cases: TestCase[];
}

interface TestCase {
	id: string;
	description?: string;
	steps?: TestStep[];
	expectedVisited?: string[];
	expectedCleanupCalls?: number;
	orderIndependent?: boolean;
	// Validation-only fields
	expectedErrors?: string[];
	expectedWarnings?: string[];
	expectedStats?: { sceneCount: number; blockCount: number; connectionCount: number };
}

interface TestStep {
	expect: StepExpect;
	action?: StepAction;
}

interface StepExpect {
	type: string; // 'DIALOG' | 'CHOICE' | 'CONDITION' | 'ACTION' | 'END_OF_SCENE'
	blockUuid?: string;
	dialogueText?: string;
	visibleChoiceCount?: number;
}

interface StepAction {
	type: string; // 'next' | 'selectChoice' | 'resolve' | 'resolveAction' | 'rejectAction' | 'resolveCharacterPort'
	choiceUuid?: string;
	value?: boolean;
	error?: string;
	name?: string;
	characterName?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const testsDir = resolve( __dirname, '../../tests' );

function loadTestFile( filename: string ): TestFile {
	const raw = readFileSync( resolve( testsDir, filename ), 'utf-8' );
	return JSON.parse( raw ) as TestFile;
}

type NextFn = () => void;

function executeAction(
	action: StepAction | undefined,
	context: DialogContext | ChoiceContext | ConditionContext | ActionContext,
	next: NextFn,
): void {
	if ( !action ) return;

	switch ( action.type ) {
		case 'next':
			next();
			break;
		case 'selectChoice':
			( context as ChoiceContext ).selectChoice( action.choiceUuid! );
			next();
			break;
		case 'resolve':
			( context as ConditionContext ).resolve( action.value! );
			next();
			break;
		case 'resolveAction':
			( context as ActionContext ).resolve();
			next();
			break;
		case 'rejectAction':
			( context as ActionContext ).reject( action.error ?? 'test error' );
			next();
			break;
		case 'resolveCharacterPort':
			( context as DialogContext ).resolveCharacterPort( action.characterName ?? action.name ?? '' );
			next();
			break;
	}
}

// ─── Flow Test Runner ───────────────────────────────────────────────────────

function runFlowTests( filename: string ): void {
	const testFile = loadTestFile( filename );

	for ( const suite of testFile.suites ) {
		describe( suite.id, () => {
			for ( const tc of suite.cases ) {
				it( tc.id + ( tc.description ? ` — ${ tc.description }` : '' ), () => {
					const engine = new DialogueEngine();
					const report = engine.init( { data: suite.blueprint } );
					expect( report.errors ).toHaveLength( 0 );

					engine.setLocale( suite.locale ?? 'en' );

					// Install choice visibility filter from stateBridge conditions
					const bridgeConditions = suite.stateBridge?.conditions ?? {};
					engine.setChoiceFilter( ( cond ) => {
						if ( cond.key in bridgeConditions ) {
							const actual = String( bridgeConditions[cond.key] );
							return cond.operator === '!=' ? actual !== cond.value : actual === cond.value;
						}
						return true;
					} );

					const steps = tc.steps ?? [];
					let stepIndex = 0;
					let cleanupCalls = 0;

					// Handler that consumes steps in order — only asserts on main track steps.
					// Async track blocks also hit this handler but fall through to auto-advance.
					const makeHandler = <C extends DialogContext | ChoiceContext | ConditionContext | ActionContext>(
						blockType: string,
					) => ( { block, context, next }: { block: { uuid: string; type: string; conditions?: ConditionBlock['conditions'] }; context: C; next: NextFn } ) => {
						const step = steps[stepIndex];

						// Check if this block matches the next expected step
						if ( step && step.expect.type === blockType &&
							( !step.expect.blockUuid || step.expect.blockUuid === block.uuid ) ) {

							if ( step.expect.visibleChoiceCount !== undefined && 'choices' in context ) {
								expect( ( context as ChoiceContext ).choices.filter( c => c.visible !== false ) ).toHaveLength( step.expect.visibleChoiceCount );
							}

							stepIndex++;
							executeAction( step.action, context, next );
							return () => { cleanupCalls++; };
						} else {
							// Not the expected step — auto-advance (async track or passthrough)
							if ( 'resolve' in context && blockType === 'CONDITION' ) {
								// Evaluate condition groups from the block definition using stateBridge data
								const groups = block.conditions ?? [];
								const result = evaluateConditionGroups( groups, ( cond ) => {
									if ( cond.key in bridgeConditions ) {
										const actual = String( bridgeConditions[cond.key] );
										return cond.operator === '!=' ? actual !== cond.value : actual === cond.value;
									}
									return true;
								} );
								( context as ConditionContext ).resolve( result );
							}
							if ( 'resolve' in context && blockType === 'ACTION' ) {
								( context as ActionContext ).resolve();
							}
							next();
							// No cleanup for auto-advanced blocks
						}
					};

					// All 4 handlers are mandatory
					engine.onDialog( makeHandler( 'DIALOG' ) );
					engine.onChoice( makeHandler( 'CHOICE' ) );
					engine.onCondition( makeHandler( 'CONDITION' ) );
					engine.onAction( makeHandler( 'ACTION' ) );

					const handle = engine.scene( suite.sceneId! );
					handle.start();

					// Verify END_OF_SCENE
					expect( handle.isRunning() ).toBe( false );

					// Verify visited blocks using the engine's internal tracking
					// This includes auto-evaluated blocks (CONDITION, ACTION) and excludes NOTE blocks
					if ( tc.expectedVisited ) {
						const engineVisited = Array.from( handle.getVisitedBlocks() );
						if ( tc.orderIndependent ) {
							expect( engineVisited.sort() ).toEqual( [...tc.expectedVisited].sort() );
						} else {
							expect( engineVisited ).toEqual( tc.expectedVisited );
						}
					}

					// Verify cleanup calls
					if ( tc.expectedCleanupCalls !== undefined ) {
						expect( cleanupCalls ).toBe( tc.expectedCleanupCalls );
					}
				} );
			}
		} );
	}
}

// ─── Validation Test Runner ─────────────────────────────────────────────────

function runValidationTests( filename: string ): void {
	const testFile = loadTestFile( filename );

	for ( const suite of testFile.suites ) {
		describe( suite.id, () => {
			for ( const tc of suite.cases ) {
				it( tc.id + ( tc.description ? ` — ${ tc.description }` : '' ), () => {
					const engine = new DialogueEngine();
					const report = engine.init( { data: suite.blueprint } );

					// Verify expected errors
					if ( tc.expectedErrors ) {
						const errorCodes = report.errors.map( e => e.code );
						for ( const code of tc.expectedErrors ) {
							expect( errorCodes ).toContain( code );
						}
						if ( tc.expectedErrors.length === 0 ) {
							expect( report.errors ).toHaveLength( 0 );
						}
					}

					// Verify expected warnings
					if ( tc.expectedWarnings ) {
						const warningCodes = report.warnings.map( w => w.code );
						for ( const code of tc.expectedWarnings ) {
							expect( warningCodes ).toContain( code );
						}
						if ( tc.expectedWarnings.length === 0 ) {
							expect( report.warnings ).toHaveLength( 0 );
						}
					}

					// Verify stats
					if ( tc.expectedStats ) {
						expect( report.stats.sceneCount ).toBe( tc.expectedStats.sceneCount );
						expect( report.stats.blockCount ).toBe( tc.expectedStats.blockCount );
						expect( report.stats.connectionCount ).toBe( tc.expectedStats.connectionCount );
					}
				} );
			}
		} );
	}
}

// ─── Execute ────────────────────────────────────────────────────────────────

describe( 'cross-language: test-cases', () => {
	runFlowTests( 'test-cases.json' );
} );

describe( 'cross-language: port-routing', () => {
	runFlowTests( 'test-port-routing.json' );
} );

describe( 'cross-language: init-validation', () => {
	runValidationTests( 'test-init-validation.json' );
} );

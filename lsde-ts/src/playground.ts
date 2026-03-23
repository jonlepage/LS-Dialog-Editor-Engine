declare const console: { log: ( ...args: unknown[] ) => void };

// Playground — teste l'IntelliSense et l'API du moteur avec le vrai blueprint.
// Ce fichier est exclu du build (tsconfig.json exclude).

import { DialogueEngine } from './index.js';
import type {
	BlueprintExport, BlueprintBlock, StateBridge,
	DialogContext, ChoiceContext, ConditionContext, ActionContext,
} from './index.js';
import blueprintJson from '../../blueprints/blueprint.json';

// ─── Tiny color helpers ──────────────────────────────────────────────────────

const R = '\x1b[0m';
const red     = ( s: string ) => `\x1b[31m${ s }${ R }`;
const green   = ( s: string ) => `\x1b[32m${ s }${ R }`;
const yellow  = ( s: string ) => `\x1b[33m${ s }${ R }`;
const blue    = ( s: string ) => `\x1b[34m${ s }${ R }`;
const magenta = ( s: string ) => `\x1b[35m${ s }${ R }`;
const cyan    = ( s: string ) => `\x1b[36m${ s }${ R }`;
const white   = ( s: string ) => `\x1b[37m${ s }${ R }`;
const dim     = ( s: string ) => `\x1b[2m${ s }${ R }`;
const bold    = ( s: string ) => `\x1b[1m${ s }${ R }`;
const gray    = ( s: string ) => `\x1b[90m${ s }${ R }`;

const log = ( ...parts: unknown[] ) => console.log( parts.join( ' ' ) );

/** Short label for a block: "DIALOG-001" instead of a raw UUID. */
const label = ( block: BlueprintBlock ) => block.label ?? block.uuid.slice( 0, 8 );

// ─── Données ─────────────────────────────────────────────────────────────────

const testData = blueprintJson as unknown as BlueprintExport;

// ─── Setup du moteur ─────────────────────────────────────────────────────────

const engine = new DialogueEngine();

const report = engine.init( { data: testData } );
log( bold( cyan( 'Init' ) ), 'Errors:', report.errors.length === 0 ? green( '0' ) : red( String( report.errors.length ) ) );
log( dim( `     Stats: ${ report.stats.sceneCount } scenes, ${ report.stats.blockCount } blocks, ${ report.stats.connectionCount } connections` ) );
if ( report.warnings.length > 0 ) {
	for ( const w of report.warnings ) log( yellow( `  ⚠ ${ w.code }: ${ w.message }` ) );
}

engine.setLocale( 'en' );

const bridge: StateBridge = {
	evaluateCondition: ( cond ) => {
		log( gray( `       [bridge] eval: ${ cond.key } ${ cond.operator } ${ cond.value } → true` ) );
		return true;
	},
	executeAction: ( action, sig ) => {
		log( gray( `       [bridge] exec: ${ sig?.label ?? action.actionId }(${ action.params.join( ', ' ) })` ) );
	},
	resolveDictionary: ( group, key ) => `${ group }.${ key }`,
};
engine.setStateBridge( bridge );

// ─── Handlers ────────────────────────────────────────────────────────────────

engine.onBeforeBlock( ( { block, resolve } ) => {
	const delay = block.nativeProperties?.delay;
	if ( delay ) {
		log( gray( `       [before] ${ label( block ) } delay=${ delay }s` ) );
	}
	resolve();
} );

engine.onDialog( ( { block, context, next } ) => {
	const ctx: DialogContext = context;
	const char = ctx.character;
	const charStr = char ? `${ magenta( char.name ) } ${ dim( `(${ char.emotion ?? '?' })` ) }` : dim( '(no character)' );
	const text = (block as { dialogueText?: Record<string, string> }).dialogueText?.['en'] ?? '—';
	const flags: string[] = [];
	if ( block.nativeProperties?.portPerCharacter ) flags.push( 'portPerCharacter' );
	if ( block.nativeProperties?.isAsync ) flags.push( 'async' );
	if ( block.nativeProperties?.debug ) flags.push( 'debug' );
	const flagStr = flags.length > 0 ? yellow( `[${ flags.join( ', ' ) }]` ) : '';

	log( '\n ', bold( blue( 'DIALOG' ) ), cyan( label( block ) ), flagStr );
	log( '        ', charStr );
	log( '        ', white( `"${ text }"` ) );

	if ( block.nativeProperties?.portPerCharacter && char ) {
		log( '        ', dim( `→ resolveCharacterPort: ${ char.name }` ) );
		ctx.resolveCharacterPort( char.name );
	}
	next();

	return () => {
		log( gray( `       [cleanup] ${ label( block ) }` ) );
	};
} );

let choiceCount = 0;
engine.onChoice( ( { block, context, next } ) => {
	const ctx: ChoiceContext = context;
	choiceCount++;
	log( '\n ', bold( yellow( 'CHOICE' ) ), cyan( label( block ) ), `${ ctx.choices.length } visible:` );
	for ( const ch of ctx.choices ) {
		const choiceLabel = ch.label ?? ch.uuid.slice( 0, 8 );
		log( '        ', yellow( '>' ), `${ choiceLabel }:`, white( `"${ ch.dialogueText?.['en'] ?? '—' }"` ) );
	}
	// Pick choice2 on 2nd visit to avoid infinite loop
	const pick = ctx.choices.length > 1 && choiceCount > 1 ? ctx.choices[1]! : ctx.choices[0];
	if ( pick ) {
		log( '        ', dim( `→ selecting: ${ pick.label ?? pick.uuid.slice( 0, 8 ) }` ) );
		ctx.selectChoice( pick.uuid );
	}
	next();
} );

engine.onCondition( ( { block, context, next } ) => {
	const ctx: ConditionContext = context;
	// Évalue manuellement via le bridge
	const conds = (block as { conditions?: { uuid: string; key: string; operator: string; value: string }[] }).conditions ?? [];
	const result = conds.length > 0; // simplifié : true si des conditions existent
	log( '\n ', bold( magenta( 'CONDITION' ) ), cyan( label( block ) ), `${ conds.length } conditions →`, result ? green( 'true' ) : red( 'false' ) );
	ctx.resolve( result );
	next();
} );

engine.onAction( ( { block, context, next } ) => {
	const ctx: ActionContext = context;
	const actions = (block as { actions?: { actionId: string; params: unknown[] }[] }).actions ?? [];
	log( '\n ', bold( green( 'ACTION' ) ), cyan( label( block ) ), `${ actions.length } actions` );
	for ( const a of actions ) {
		log( '        ', green( '⚡' ), `${ a.actionId }(${ (a.params as unknown[]).join( ', ' ) })` );
	}
	ctx.resolve();
	next();

	return () => {
		log( gray( `       [cleanup] ${ label( block ) }` ) );
	};
} );

engine.onSceneEnter( ( { scene } ) => {
	log( '\n' + bold( green( '━━━ Scene Enter ━━━' ) ), `running=${ scene.isRunning() }` );
} );

engine.onSceneExit( () => {
	log( bold( red( '━━━ Scene Exit ━━━' ) ) + '\n' );
} );

engine.onValidateNextBlock( ( { nextBlock, fromBlock } ) => {
	if ( fromBlock ) {
		log( gray( `       [validate] ${ label( fromBlock ) } → ${ label( nextBlock ) }` ) );
	}
	return { valid: true };
} );

engine.onInvalidateBlock( ( { scene, reason } ) => {
	log( red( `  ✗ INVALIDATED: ${ reason }` ) );
	scene.cancel();
} );

// ─── Lancer ──────────────────────────────────────────────────────────────────

const sceneId = testData.scenes[0]?.uuid ?? '';
const sceneName = testData.scenes[0]?.label ?? sceneId;
log( dim( `\nLaunching scene: ${ sceneName } (${ sceneId.slice( 0, 12 ) }...)` ) );

const handle = engine.scene( sceneId );
handle.start();

const visitedLabels = Array.from( handle.getVisitedBlocks() ).map( uuid => {
	for ( const s of testData.scenes ) {
		const b = s.blocks.find( bl => bl.uuid === uuid );
		if ( b ) return b.label ?? uuid.slice( 0, 8 );
	}
	return uuid.slice( 0, 8 );
} );
log( bold( 'Visited:' ), visitedLabels.map( v => cyan( v ) ).join( ', ' ) );
log( bold( 'Engine:' ), `running=${ engine.isRunning() ? green( 'true' ) : dim( 'false' ) }` );

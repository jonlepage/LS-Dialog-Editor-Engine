declare const console: { log: ( ...args: unknown[] ) => void };

// Playground — teste l'IntelliSense et l'API du moteur.
// Ce fichier est exclu du build (tsconfig.json exclude).
// Ouvre-le dans VSCode et vérifie l'autocomplete + les types.

import { DialogueEngine } from './index.js';
import type { BlueprintExport, StateBridge, DialogContext, ChoiceContext } from './index.js';
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

// ─── Données ─────────────────────────────────────────────────────────────────

const testData = blueprintJson as unknown as BlueprintExport;

// ─── Setup du moteur ─────────────────────────────────────────────────────────

const engine = new DialogueEngine();

const report = engine.init( { data: testData } );
log( bold( cyan( 'Init' ) ), 'Errors:', report.errors.length === 0 ? green( '0' ) : red( String( report.errors.length ) ) );
log( dim( `     Stats: ${ report.stats.sceneCount } scenes, ${ report.stats.blockCount } blocks, ${ report.stats.connectionCount } connections` ) );

engine.setLocale( 'en' );

const bridge: StateBridge = {
	evaluateCondition: ( cond ) => {
		log( gray( `  [bridge] eval: ${ cond.key } ${ cond.operator } ${ cond.value }` ) );
		return true;
	},
	executeAction: ( action, sig ) => {
		log( gray( `  [bridge] exec: ${ action.actionId } ${ sig?.label ?? '' }` ) );
	},
	resolveDictionary: ( group, key ) => `${ group }.${ key }`,
};
engine.setStateBridge( bridge );

// ─── Handlers ────────────────────────────────────────────────────────────────

engine.onDialog( ( { block, context, next } ) => {
	const ctx: DialogContext = context;
	const char = ctx.character;
	const charStr = char ? `${ magenta( char.name ) } ${ dim( `(${ char.emotion ?? '?' })` ) }` : dim( '(no character)' );
	const text = (block as { dialogueText?: Record<string, string> }).dialogueText?.['en'] ?? '—';

	const ppc = block.nativeProperties?.portPerCharacter;
	log( '\n ', bold( blue( 'DIALOG' ) ), cyan( block.uuid ), ppc ? yellow( '[portPerCharacter]' ) : '' );
	log( '        ', charStr );
	log( '        ', white( `"${ text }"` ) );

	// Si portPerCharacter, on résout vers le premier personnage
	if ( ppc && char ) {
		log( '        ', dim( `→ resolveCharacterPort: ${ char.name }` ) );
		ctx.resolveCharacterPort( char.name );
	}
	next();
} );

let choiceCount = 0;
engine.onChoice( ( { context, next } ) => {
	const ctx: ChoiceContext = context;
	choiceCount++;
	log( '\n ', bold( yellow( 'CHOICE' ) ), `${ ctx.choices.length } visible:` );
	for ( const ch of ctx.choices ) {
		log( '        ', yellow( '>' ), `${ ch.uuid }:`, white( `"${ ch.dialogueText?.['en'] ?? '—' }"` ) );
	}
	// Sélectionne choice2 (non-loop) pour éviter la boucle infinie, ou choice1 la première fois
	const pick = ctx.choices.length > 1 && choiceCount > 1 ? ctx.choices[1]! : ctx.choices[0];
	if ( pick ) {
		log( '        ', dim( `→ selecting: ${ pick.uuid }` ) );
		ctx.selectChoice( pick.uuid );
	}
	next();
} );

engine.onSceneEnter( ( { scene } ) => {
	log( '\n' + bold( green( '━━━ Scene Enter ━━━' ) ), `running=${ scene.isRunning() }` );
} );

engine.onSceneExit( () => {
	log( bold( red( '━━━ Scene Exit ━━━' ) ) + '\n' );
} );

// ─── Lancer ──────────────────────────────────────────────────────────────────

const sceneId = testData.scenes[0]?.uuid ?? '';
log( dim( `Launching scene: ${ sceneId }` ) );

const handle = engine.scene( sceneId );
handle.start();

log( bold( 'Visited:' ), Array.from( handle.getVisitedBlocks() ).map( v => cyan( v ) ).join( ', ' ) );
log( bold( 'Engine:' ), `running=${ engine.isRunning() ? green( 'true' ) : dim( 'false' ) }` );

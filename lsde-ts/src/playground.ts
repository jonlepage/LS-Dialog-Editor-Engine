declare const console: { log: ( ...args: unknown[] ) => void };

// Playground — teste l'IntelliSense et l'API du moteur.
// Ce fichier est exclu du build (tsconfig.json exclude).
// Ouvre-le dans VSCode et vérifie l'autocomplete + les types.

import { DialogueEngine } from './index.js';
import type {
	BlueprintExport, StateBridge, DialogContext, ChoiceContext,
} from './index.js';

// ─── Données de test ─────────────────────────────────────────────────────────

const testData: BlueprintExport = {
	version: '1.0.0',
	exportDate: '2025-01-01',
	locales: ['en', 'fr'],
	scenes: [
		{
			uuid: 'scene-tavern',
			label: 'Tavern',
			date: '2025-01-01',
			blocks: [
				{
					uuid: 'dialog-1',
					type: 'DIALOG',
					label: 'Merchant Greeting',
					properties: [],
					isStartBlock: true,
					dialogueText: { en: 'Welcome, traveler!', fr: 'Bienvenue, voyageur!' },
					metadata: {
						characters: [{ name: 'Merchant', emotion: 'happy', emotionIntensity: 3 }],
					},
				},
				{
					uuid: 'choice-1',
					type: 'CHOICE',
					label: 'Player Response',
					properties: [],
					choices: [
						{ uuid: 'buy', structureKey: 'buy', dialogueText: { en: 'Show me your wares', fr: 'Montre-moi tes marchandises' } },
						{ uuid: 'leave', structureKey: 'leave', dialogueText: { en: 'Goodbye', fr: 'Au revoir' } },
					],
				},
				{
					uuid: 'dialog-buy',
					type: 'DIALOG',
					label: 'Shop',
					properties: [],
					dialogueText: { en: 'Take a look!', fr: 'Jette un oeil!' },
				},
				{
					uuid: 'dialog-leave',
					type: 'DIALOG',
					label: 'Leave',
					properties: [],
					dialogueText: { en: 'Safe travels.', fr: 'Bon voyage.' },
				},
			],
			connections: [
				{ id: 'c1', fromId: 'dialog-1', toId: 'choice-1', fromPort: 'out', toPort: 'in' },
				{ id: 'c2', fromId: 'choice-1', toId: 'dialog-buy', fromPort: 'buy', toPort: 'in' },
				{ id: 'c3', fromId: 'choice-1', toId: 'dialog-leave', fromPort: 'leave', toPort: 'in' },
			],
		},
	],
};

// ─── Setup du moteur ─────────────────────────────────────────────────────────

const engine = new DialogueEngine();

// Hover sur `report` → DiagnosticReport
const report = engine.init( { data: testData } );
console.log( 'Errors:', report.errors.length );
console.log( 'Stats:', report.stats );

engine.setLocale( 'fr' );

// Hover sur `bridge` → StateBridge
const bridge: StateBridge = {
	evaluateCondition: ( condition ) => {
		// Hover sur `condition` → ExportCondition
		console.log( `Evaluating: ${ condition.key } ${ condition.operator } ${ condition.value }` );
		return true;
	},
	executeAction: ( action, signature ) => {
		// Hover sur `action` → ExportAction, `signature` → ActionSignature | undefined
		console.log( `Action: ${ action.actionId }`, action.params, signature?.label );
	},
	resolveDictionary: ( groupLabel, rowKey ) => {
		return `${ groupLabel }.${ rowKey }`;
	},
};
engine.setStateBridge( bridge );

// ─── Handlers ────────────────────────────────────────────────────────────────

// Hover sur `args.context` → DialogContext
engine.onDialog( ( { block, context, next } ) => {
	// Teste l'autocomplete ici : context. → character, resolveCharacterPort, preventGlobalHandler
	const ctx: DialogContext = context;
	console.log( `[DIALOG] ${ block.uuid }` );
	console.log( `  Character: ${ ctx.character?.name ?? 'none' }` );
	console.log( `  Emotion: ${ ctx.character?.emotion }` );
	next();
} );

// Hover sur `args.context` → ChoiceContext
engine.onChoice( ( { context, next } ) => {
	// context.choices → ChoiceItem[] (déjà filtrés par visibilityConditions)
	const ctx: ChoiceContext = context;
	console.log( `[CHOICE] ${ ctx.choices.length } visible choices:` );
	for ( const choice of ctx.choices ) {
		console.log( `  - ${ choice.uuid }: ${ choice.dialogueText?.['fr'] }` );
	}
	// Sélectionner le premier choix
	if ( ctx.choices[0] ) {
		ctx.selectChoice( ctx.choices[0].uuid );
	}
	next();
} );

engine.onSceneEnter( ( { scene } ) => {
	// Hover sur `scene` → SceneHandle
	console.log( `\n=== Scene Enter: ... ===` );
	console.log( `Running: ${ scene.isRunning() }` );
} );

engine.onSceneExit( ( ) => {
	console.log( `=== Scene Exit ===\n` );
} );

// ─── Lancer ──────────────────────────────────────────────────────────────────

const handle = engine.scene( 'scene-tavern' );
// Hover sur `handle` → SceneHandle
// Teste : handle. → start, cancel, onEnter, onExit, onBlock, onDialog, ...

handle.start();

console.log( 'Visited:', Array.from( handle.getVisitedBlocks() ) );
console.log( 'Engine running:', engine.isRunning() );

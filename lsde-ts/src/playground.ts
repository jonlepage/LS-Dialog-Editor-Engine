declare const console: { log: ( ...args: unknown[] ) => void };

// Playground — drives the engine against a real LSDE v2 export.
// Excluded from the build (tsconfig.json exclude). Run it with `npm run playground`.
//
// Read it as the shortest complete integration: init, a locale, the two resolvers, the four
// handlers. Everything the engine asks of a game is in here, and nothing else is needed.

import { DialogueEngine, LsdeUtils } from "./index.js";
import type { BlueprintExport, ConditionTest } from "./index.js";
import blueprintJson from "../../mock/blueprints/Engine-Conformance-Scene.blueprints.json";

// ─── The game's state ───────────────────────────────────────────────────────
//
// A real game reads its own save here. What matters is the SHAPE of the answer: the engine hands
// over a test and expects true or false. It never reads a dictionary itself, never implements an
// operator, never knows what `credits` holds.

const gameState: Record<string, Record<string, boolean | number | string>> = {
	switches: { door_unlocked: true, oracle_awake: false, reactor_stable: false, met_vesk: true, alarm_armed: true },
	variables: { chapter: 3, credits: 80, trust_kael: 2, alarm_level: 3 },
	items: { plasma_cell: 1, keycard: 0, ration: 2 },
	flags: { faction: "salvage", last_port: "reactor_deck", player_callsign: "Vane" },
};

function resolveCondition( test: ConditionTest ): boolean {
	const actual = gameState[test.dict]?.[test.entry];
	const expected = test.value;

	switch ( test.op ) {
		case "equals": return actual === expected;
		case "notEquals": return actual !== expected;
		case "lessThan": return Number( actual ) < Number( expected );
		case "lessOrEqual": return Number( actual ) <= Number( expected );
		case "greaterThan": return Number( actual ) > Number( expected );
		case "greaterOrEqual": return Number( actual ) >= Number( expected );
		default: return false;
	}
}

// ─── Init ───────────────────────────────────────────────────────────────────

const engine = new DialogueEngine();
const { errors, warnings, stats } = engine.init( { data: blueprintJson as unknown as BlueprintExport } );

console.log( `\n🔧 Init — ${ errors.length } errors, ${ warnings.length } warnings` );
for ( const { code, message } of errors ) console.log( `   ⛔ ${ code }: ${ message }` );
for ( const { code, message } of warnings ) console.log( `   ⚠️  ${ code }: ${ message }` );
console.log( `📊`, stats );

engine.setLocale( "fr" );

// Which actor of the block is the one speaking. `actors` is a CAST, and LSDE deliberately refuses
// to say whether its order means "who speaks" or "who is present" — so the game decides. Returning
// undefined is legitimate: it means nobody available can carry this line.
engine.onResolveCharacter( ( actors ) => actors[0] );

// The single game-state evaluator. It answers option visibility AND condition cases. Tests on the
// reserved `choice` dictionary never reach it — the engine answers those from its own history.
engine.onResolveCondition( resolveCondition );

// ─── The four handlers ──────────────────────────────────────────────────────

engine.onDialog( ( { block, context, next } ) => {
	// The engine hands the RAW string over and never looks inside it. `{{@a1}}` and the like are
	// the game's own markers, in the game's own keys, filled by the game's own system.
	const line = LsdeUtils.getLocalizedText( block.text );
	const who = context.actors.map( a => a.name ).join( " + " ) || "—";

	console.log( `\n💬 ${ block.id }  [${ who }]${ context.emotion ? ` (${ context.emotion.name } ${ context.intensity ?? "" })` : "" }` );
	console.log( `   ${ line ?? "«no text in this export»" }` );

	next();
} );

engine.onChoice( ( { block, context, next } ) => {
	console.log( `\n❓ ${ block.id }` );

	// Every option comes tagged. Filtering is the game's call — greying a locked answer out is a
	// perfectly good use of the ones that are not visible.
	const offered = context.options.filter( o => o.visible !== false );
	for ( const option of context.options ) {
		const text = LsdeUtils.getLocalizedText( option.text );
		console.log( `   ${ option.visible === false ? "🔒" : "▸" } ${ option.id }  ${ text ?? "" }` );
	}

	const picked = offered[0];
	if ( !picked ) {
		console.log( `   (nothing to pick — the flow stops here)` );
		next();
		return;
	}

	console.log( `   → picking ${ picked.id }` );
	context.selectChoice( picked.id );
	next();
} );

engine.onCondition( ( { block, context, next } ) => {
	// Optional: with a resolver installed the engine already picked the port. This is where a game
	// logs what matched, or overrides it with context.resolve( 'K2' ).
	const matched = context.cases.filter( c => c.result ).map( c => c.port );
	console.log( `\n🔀 ${ block.id }  cases: ${ context.cases.map( c => `${ c.port }=${ c.result }` ).join( " " ) }` );
	console.log( `   matched: ${ matched.join( ", " ) || "none → default" }` );

	next();
} );

engine.onAction( ( { block, context, next } ) => {
	console.log( `\n⚙️  ${ block.id }` );
	for ( const call of context.calls ) {
		// `fn` is empty when the writer has not picked a function yet. That is a draft, not an error.
		console.log( `   ${ call.fn || "«no function picked»" }(`, call.args, `)` );
	}

	context.resolve();
	next();
} );

// ─── Lifecycle ──────────────────────────────────────────────────────────────

engine.onSceneEnter( () => console.log( `\n▶️  scene entered` ) );
engine.onSceneExit( () => console.log( `\n⏹️  scene exited` ) );

// ─── Play ───────────────────────────────────────────────────────────────────
//
// A scene opens by its path OR by the id that survives a rename. Store the id anywhere outside the
// payload — a Unity asset, a save file — because the path changes the day someone renames it.

const scene = engine.scene( "reactor_breach" );
scene.start();

console.log( `\n📜 choice history:`, Object.fromEntries( scene.getChoiceHistory() ) );
console.log( `🧭 visited ${ scene.getVisitedBlocks().size } blocks` );
console.log( `🔗 wires in the scene:`, engine.getSceneConnections( "reactor_breach" ).length );

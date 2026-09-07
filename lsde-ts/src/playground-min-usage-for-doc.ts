// The shortest complete integration, for the docs.
// Excluded from the build (tsconfig.json exclude).
declare const game: any;
import { type BlueprintExport, DialogueEngine, LsdeUtils } from "./index.js";
// @ts-ignore — JSON outside rootDir; file excluded from build
import blueprintJson from "../../mock/blueprints/Engine-Conformance-Scene.blueprints.json";

const engine = new DialogueEngine();

// init() returns a report. Check `errors` — a payload it cannot read is refused by name here,
// rather than half-played until a scene stops in the middle with nothing logged.
const { errors } = engine.init( { data: blueprintJson as unknown as BlueprintExport } );
if ( errors.length > 0 ) throw new Error( errors[0]!.message );

// The one game-state evaluator: it answers option visibility AND condition cases.
engine.onResolveCondition( ( test ) => game.evaluateGameStateCondition( test ) );

//#generic game handlers for dialog, choice, condition, action blocks
engine.onDialog( ( { scene, block, context, next } ) => {
	game
		.createDialogAuto( block, context )
		.catch( () => scene.cancel() )
		.finally( () => next() );
} );

engine.onChoice( ( { scene, block, context, next } ) => {
	game
		.createChoiceAuto( block, context )
		.catch( () => scene.cancel() )
		.finally( () => next() );
} );

engine.onCondition( ( { block, context, next } ) => {
	// Optional once onResolveCondition is installed: the engine has already evaluated every case
	// and already knows its exit port. This is a place to log, or to override with resolve().
	game.logConditionCases( block.id, context.cases );
	next();
} );

engine.onAction( ( { context, next } ) => {
	// The calls come with their arguments BY NAME, as the function declared them.
	game
		.executeCalls( context.calls )
		.catch( ( err: any ) => context.reject( err ) )
		.finally( () => next() );
} );

// Start a scene anywhere in your game code once the engine is initialized. Pass the scene path,
// or the id that survives a rename — take the id when the reference is stored in an asset.
function MyGameScript_001( sceneRef: string ) {
	const scene = engine.scene( sceneRef );
	scene.start();
}

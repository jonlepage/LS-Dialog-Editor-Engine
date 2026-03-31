// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).
declare const game: any;
import { type BlueprintExport, DialogueEngine, LsdeUtils } from "./index.js";
// @ts-ignore — JSON outside rootDir; file excluded from build
import blueprintJson from "../../blueprints/blueprint.json";

const engine = new DialogueEngine();

engine.init({ data: blueprintJson as BlueprintExport })

//#generic game handlers for dialog, choice, condition, action blocks
engine.onDialog(({ scene, block, context, next }) => {
	game
		.createDialogAuto(block, context)
		.catch(() => scene.cancel())
		.finally(() => next());
});

engine.onChoice(({ scene, block, context, next }) => {
	game
		.createChoiceAuto(block, context)
		.catch(() => scene.cancel())
		.finally(() => next());
});

engine.onCondition(({ scene, block, context, next }) => {
	const { conditions } = block;
	game
		.evaluateGameStateConditions(conditions)
		.catch(() => scene.cancel())
		.then((result: any) => context.resolve(result))
		.finally(() => next());
});

engine.onAction(({ block, context, next }) => {
	const { actions } = block;
	game
		.executeActionsList(actions)
		.catch((err: any) => context.reject(err))
		.finally(() => next());
});


// start a scene anywhere in your game code after the engine is initialized
function MyGameScript_001(id: string) {
	const scene = engine.scene(id);
	scene.start();
}

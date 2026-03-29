// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).
declare const game: any;
declare const GAME_CHARACTER_ID: any;
declare const LSDE_BLOCKS: any;
declare const LABELS: any;
import { type BlueprintExport, DialogueEngine, LsdeUtils } from "./index.js";
// @ts-ignore — JSON outside rootDir; file excluded from build
import blueprintJson from "../../blueprints/blueprint.json";

const engine = new DialogueEngine();

engine.init({ data: blueprintJson });
// engine.setLocale("en"); // TODO: remove plus besoin !?

// optional: install your game character resolver to map blueprint character references 
engine.onResolveCharacter((characters) => game.getActorsInParty(characters));

// optional: install your game state condition evaluator to control choice visibility
engine.setChoiceFilter((cond) => game.evaluateGameStateCondition(cond));

//#generic game handlers for dialog, choice, condition, action blocks
engine.onDialog(({ scene, block, context, next }) => {
	game
		.createDialogAuto(block, context)
		.catch(() => scene.cancel())
		.finally(() => next());
});


// vous pouvez gerer les block choix de facon generique pour votre jeux
// l'objectif est dafficher des choix utilisateur et apres une interaction, poursuivre le flow selon le choix.
engine.onChoice(({ scene, block, context, next }) => {
	game
		.createChoiceAuto(block, context)
		.catch(() => scene.cancel())
		.finally(() => next());
});

// vous pouvez gerer les block condition de facon generique pour votre jeux
// les block condition evaluent les conditions defenie dans le block
engine.onCondition(({ scene, block, context, next }) => {
	const { conditions } = block;
	game
		.evaluateGameStateConditions(conditions)
		.catch(() => scene.cancel())
		.then((result: any) => context.resolve(result))
		.finally(() => next());
});

// vous pouvez gerer les block action de facon generique pour votre jeux
// l'objectif est simplement d'executer les actions definie dans le block, puis poursuivre le flow
// idealement vous allez vouloir mapper les id d'action avec ceux de votre jeux
engine.onAction(({ block, context, next }) => {
	const { actions } = block;
	game
		.executeActionsList(actions)
		.catch((err: any) => context.reject(err))
		.finally(() => next());
});

// vous pouvez vouloir gerer certaine chose avant que un block commence?
// ex: le delay, des animation, des effets de transition etc..
engine.onBeforeBlock(({ block, resolve }) => {
	const delay = block.nativeProperties?.delay ?? 0;

	game
		.runAsyncEvents(
			game.playBlockEntryAnimation(block),
			game.wait(delay),
		)
		.finally(() => resolve());
});

// vous pouvez vouloir gerer certaine au demmarage de la scene flow?
engine.onSceneEnter(() => {
	game.cinemaMode(true);
	game.stopNpcMovements();
});

// vous pouvez vouloir gerer certaine a la fin de la scene flow?
engine.onSceneExit(() => {
	game.cinemaMode(false);
	game.resumeNpcMovements();
});

// vous pouvez vouloir gerer la logique de validation des block pour controler le flow de votre scene
// l'objectif est de pouvoir valider ou non le block qui doit suivre dans le flow, selon la logique de votre jeux
engine.onValidateNextBlock(({ nextContext, fromContext, nextBlock }) => {
	const invalidateReason = game.canProceedToNextBlock(nextContext, fromContext, nextBlock);
	return invalidateReason ?? { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
	console.log(`   ❌ INVALIDATED: ${reason}`);
	scene.cancel();
});





function GameScript_001(id: string, gameScriptCallBack: () => void) {
	const scene = engine.scene(id);
	scene.start();
	scene.onExit(gameScriptCallBack);

	// vous pouvez vouloir gerer les block dialog de facon personalisé pour chaque script/events de votre jeux
	// l'objectif est de remplacer le comportement generique de cette scene pour repondre a un scenario specifique.
	scene.onDialog(({ context }) => {
		// empêche le handler global de s'exécuter si vous souhaitez recrire tous le comportement du block dialog pour cette scene
		// tres peut de chance que vous souhaitiez faire ca, mais c'est possible si vous avez besoin d'un controle total sur le block dialog pour cette scene
		// context.preventGlobalHandler();

		const { character } = context;
		if (game.isCharacterId(character, GAME_CHARACTER_ID.boss1)) {
			game.playSound("roar");
			game.shakeCamera();
		}

		return () => {
			game.stopSound("roar");
			game.stopCameraShake();
		};
	});

	//TODO: plus specifique : onBlockAction(LSDE_BLOCKS.newSceneAction001)
	// LSDE blueprint peut exporter les key des blocks pour vous aidez a cibler un block en particulier
	// - ideal si vous voulez pas deleguer la logique de certain aspect thecnique au narrative designer
	// - le dev peut ainsi controller chaque block et ajoutez ca logique et deleger a LSDE juste le narratif
	// - ces un usecase acceptable pour un jeux casuel simple et sans complexiter narrative
	scene.onBlock(LSDE_BLOCKS.newSceneAction001, ({ block, context, next }) => {

		const { actions } = block;

		game.moveCameraToLabel(LABELS._label_1, { duration: 0 });
		game.executeActionsList(actions)
			.catch((err: any) => context.reject(err))
			.finally(() => next());
	});

	scene.onBlock(LSDE_BLOCKS.newSceneDialog006, ({ scene, block, context, next }) => {
		context.preventGlobalHandler();

		game
			.createDialogAutoWithBlock(block, function CustomActionsForDialog006() {
				game.moveCameraToLabel(LABELS._label_2, { duration: 0 });
				game.playSound("roar");
			})
			.catch(() => scene.cancel())
			.finally(() => next());
	});



}

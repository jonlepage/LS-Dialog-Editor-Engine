// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).
declare const game: any;
declare const GAME_CHARACTER_ID: any;
declare const LSDE_BLOCKS: any;
declare const LABELS: any;
import { DialogueEngine, LsdeUtils } from "./index.js";
import type { BlueprintExport, RuntimeChoiceItem } from "./index.js";
// @ts-ignore — JSON outside rootDir; file excluded from build
import blueprintJson from "../../blueprints/blueprint.json";

const testData = blueprintJson as unknown as BlueprintExport;
const engine = new DialogueEngine();

engine.init({ data: testData });
engine.setLocale("en");

// Si vous utilisez un system de personnage pour le block
// votre jeux dois renvoyez un des personnage dans la liste pour que le block sois autoriser a ce lancer.
engine.onResolveCharacter((characters) => game.getActorsInParty(characters));

// Unified condition resolver — evaluates game-state conditions for choice visibility and condition blocks.
// choice: conditions are resolved internally by the engine via choice history.
engine.onResolveCondition((cond) => game.evaluateGameStateCondition(cond));

// vous pouvez gerer les block dialog de facon generique pour votre jeux
engine.onDialog(({ block, context, next }) => {
	const { dialogueText, nativeProperties } = block;
	const { character, resolveCharacterPort } = context;
	const text = game.getLocalizedText(dialogueText);
	const emotion = game.getCharacterEmotion(character);

	character && resolveCharacterPort(character.uuid);

	game.moveCameraToCharacter(character);
	game.animateCharacter(character, emotion);

	const dialog = game.createDialog(text, character, emotion);
	const shouldWaitInput = game.shouldWaitPlayerInputForDialog(nativeProperties);

	if (shouldWaitInput) {
		dialog.onInput(() => next(), { once: true });
	} else {
		dialog.then(() =>
			game.wait(nativeProperties?.timeout ?? 0).then(() => next()),
		);
	}

	// la fonction de retour permet de nettoyer votre jeux des effects de bord du block
	return () => {
		dialog.destroy();
		game.animateCharacter(character, false);
	};
});


// vous pouvez gerer les block choix de facon generique pour votre jeux
// l'objectif est dafficher des choix utilisateur et apres une interaction, poursuivre le flow selon le choix.
engine.onChoice(({ block, context, next }) => {
	const { nativeProperties } = block;
	const { choices, selectChoice } = context;

	// Nous pouvon recuperez les choix visible pour les afficher dans l'ui du jeux
	const visible = choices.filter((c) => c.visible !== false);
	const dialog = game.createChoice(visible);

	//TODO:  bug: onChange ou onSelect
	// Quand le joueur fait un choix dans votre moteur de jeux, on continu
	dialog.then((selected: any) => selectChoice(selected)).finally(() => next());

	//Si on souhait support les timeout de choix
	// on utilise un timer du moteur de votre jeux
	if (nativeProperties?.timeout) {
		const timeout = game.wait(nativeProperties.timeout).then(() => next());
		dialog.finally(() => timeout.cancel());
	}

	return () => {
		dialog.destroy();
	};
});

// vous pouvez gerer les block condition de facon generique pour votre jeux
// les block condition evaluent les conditions defenie dans le block
engine.onCondition(({ scene, block, context, next }) => {
	const { conditions } = block;
	game
		.evaluateGameStateConditions(conditions)
		.then((result: any) => context.resolve(result))
		.finally(() => next());
});

// vous pouvez gerer les block action de facon generique pour votre jeux
// l'objectif est simplement d'executer les actions definie dans le block, puis poursuivre le flow
// idealement vous allez vouloir mapper les id d'action avec ceux de votre jeux
engine.onAction(({ block, context, next }) => {
	const { actions } = block;
	game.executeActionsList(actions)
		.catch((err: any) => context.reject(err))
		.finally(() => next());
});

// vous pouvez vouloir gerer certaine chose avant que un block commence?
// ex: le delay, des animation, des effets de transition etc..
engine.onBeforeBlock(({ block, resolve }) => {
	const { nativeProperties } = block;
	game.playBlockEntryAnimation(block);
	game.wait(nativeProperties?.delay ?? 0).then(() => resolve());
	return () => game.stopBlockEntryAnimation(block);
});

// vous pouvez vouloir gerer certaine au demmarage de la scene flow?
engine.onSceneEnter(({ scene }) => {
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
engine.onValidateNextBlock(({ nextContext }) => {
	const { character } = nextContext;
	if (game.characterHasStatus(character, "stunned")) {
		return { valid: false, reason: "character_stunned_status" };
	}
	return { valid: true };
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
	scene.onActionId(LSDE_BLOCKS.newSceneAction001, ({ block, context, next }) => {

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


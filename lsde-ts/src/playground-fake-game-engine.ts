// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).
declare const game: any;
declare const GAME_CHARACTER_ID: any;
declare const LSDE_BLOCKS: any;
declare const LABELS: any;
import { DialogueEngine, LsdeUtils } from "./index.js";
import type { BlueprintExport, RuntimeChoiceItem } from "./index.js";
// @ts-ignore — JSON outside rootDir; file excluded from build
import blueprintJson from "../../mock/blueprints/Engine-Conformance-Scene.blueprints.json";

const testData = blueprintJson as unknown as BlueprintExport;
const engine = new DialogueEngine();

engine.init({ data: testData });
engine.setLocale("en");

// Si vous utilisez un system de personnage pour le block
// votre jeux dois renvoyez un des personnage dans la liste pour que le block sois autoriser a ce lancer.
engine.onResolveCharacter((actors) => game.getActorsInParty(actors));

// Unified condition resolver — evaluates game-state conditions for choice visibility and condition blocks.
// choice: conditions are resolved internally by the engine via choice history.
engine.onResolveCondition((test) => game.evaluateGameStateCondition(test));

// vous pouvez gerer les block dialog de facon generique pour votre jeux
engine.onDialog(({ block, context, next }) => {
	// The natives live in `props` alongside the designer's own properties. Ids cannot collide, so
	// this helper is a lookup, not a guess. `delay` and `timeout` are MILLISECONDS in v2.
	const nativeProperties = LsdeUtils.getNativeProperties(block);
	const { character, emotion, intensity, resolveCharacterPort } = context;

	// The engine hands the RAW string over and never reads inside it.
	const text = LsdeUtils.getLocalizedText(block.text);

	// The port of an actor IS its card id — the same string `block.actors` lists.
	character && resolveCharacterPort(character.id);

	game.moveCameraToCharacter(character);
	// The emotion belongs to the BLOCK, not to a speaker: one line, one tone.
	game.animateCharacter(character, emotion, intensity);

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
		game.animateCharacter(character, undefined, undefined);
	};
});


// vous pouvez gerer les block choix de facon generique pour votre jeux
// l'objectif est dafficher des choix utilisateur et apres une interaction, poursuivre le flow selon le choix.
engine.onChoice(({ block, context, next }) => {
	const nativeProperties = LsdeUtils.getNativeProperties(block);
	const { options, selectChoice } = context;

	// Le moteur renvoie TOUTES les options, taguees. On filtre celles a offrir — ou on garde les
	// autres pour les afficher grisees, ce que le filtrage cote moteur aurait rendu impossible.
	const visible = options.filter((o: RuntimeChoiceItem) => o.visible !== false);
	const dialog = game.createChoice(visible);

	//TODO:  bug: onChange ou onSelect
	// Quand le joueur fait un choix dans votre moteur de jeux, on continu
	// On rend l'id de l'option (`C1`), qui est aussi son port de sortie.
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
// Optionnel des que onResolveCondition est branche : le moteur a deja evalue chaque cas et connait
// deja son port de sortie. Ici on journalise, ou on force une sortie avec context.resolve('K2').
engine.onCondition(({ block, context, next }) => {
	game.logConditionCases(block.id, context.cases);
	next();
});

// vous pouvez gerer les block action de facon generique pour votre jeux
// l'objectif est simplement d'executer les actions definie dans le block, puis poursuivre le flow
// idealement vous allez vouloir mapper les id d'action avec ceux de votre jeux
engine.onAction(({ context, next }) => {
	// Les appels arrivent avec leurs arguments PAR NOM, tels que la fonction les a declares.
	game.executeCalls(context.calls)
		.catch((err: any) => context.reject(err))
		.finally(() => next());
});

// vous pouvez vouloir gerer certaine chose avant que un block commence?
// ex: le delay, des animation, des effets de transition etc..
engine.onBeforeBlock(({ block, context, resolve }) => {
	// `delay` est en MILLISECONDES en v2 — il etait en secondes en v1, et rien ne le signale a
	// l'execution : une pause de 3 secondes devient 3 millisecondes dans un projet migre.
	const { nativeProperties } = context;
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
		if (game.isCharacterId(character?.id, GAME_CHARACTER_ID.boss1)) {
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
	scene.onActionId(LSDE_BLOCKS.newSceneAction001, ({ context, next }) => {
		game.moveCameraToLabel(LABELS._label_1, { duration: 0 });
		game.executeCalls(context.calls)
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


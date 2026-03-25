declare const console: { log: (...args: unknown[]) => void };

// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).

import { DialogueEngine, LsdeUtils } from "./index.js";
import type { BlueprintExport, StateBridge } from "./index.js";
import blueprintJson from "../../blueprints/blueprint.json";

const testData = blueprintJson as unknown as BlueprintExport;
const engine = new DialogueEngine();

// ─── Init ───────────────────────────────────────────────────────────────────

// idealement le user va creer les function plus haut plutot que directment dans le le object
// ex: evaluateCondition:HandleEvaluateCondition, mais pour lexample ca va
const { errors, warnings, stats } = engine.init({
	data: testData,

	// non obligatoire, permet de connexter globalement son propre system devaluation des conditions.
	// non
	evaluateCondition: (cond) => {
		const { key, operator, value } = cond;
		console.log(`   🔗 bridge.eval: ${key} ${operator} ${value} → true`);
		return true;
	},

	//
	// obligatoire, permet dexecuter les actions de son moteur.
	// utiliser dans le default handler onAction et dois rester accesible au user dans LsdeUtils si il custom handler
	executeAction: (action, sig) => {
		const { actionId, params } = action;
		console.log(
			`   🔗 bridge.exec: ${sig?.label ?? actionId}(${params.join(", ")})`,
		);
	},

	// remove
	resolveDictionary: (group, key) => `${group}.${key}`,

	// required, required, obligatoire , mais le dev peut juste ajoutez un log au debut
	// get engine dictionnary ex: if group === 'items' ? $items.get(key) or game.getDictionary(group, key) or something like that selon le engine du dev...
	onGetDictionary: (group, key) => () =>
		console.log("get engine disctionary", group, key),
	onSetDictionary: (group, key, value) => () =>
		console.log("set engine disctionary", group, key, value),

	// obligatoire , ces l'algo engine qui decidera quel character utilise utilisera le block
	// si par example le user na pas le personnage dans sa party il peut return undefined , et character dans le context du block sera undefined
	resolveCharacter: (characters) => characters[0],
});
const { sceneCount, blockCount, connectionCount } = stats;
console.log(`\n🔧 Init — ${errors.length} errors, ${warnings.length} warnings`);
console.log(
	`   📊 ${sceneCount} scenes, ${blockCount} blocks, ${connectionCount} connections`,
);
for (const { code, message } of warnings)
	console.log(`   ⚠️  ${code}: ${message}`);

engine.setLocale("en");

// onValidateNextBlock existe aussi par default
// ces ici que on va evaluer si le prochain block est executable ou non avan onBeforeBlock
// par default , le handler  fera juste les base logique accesible nativement par son engine et ces utils
// si le dev veut remplacer, il doit avoir access a des utils pour eviter de tous ecrire la logique native dejas dispo.
engine.onValidateNextBlock(({ context, nextBlock, fromBlock }) => {
	const { metadata } = nextBlock;
	// si nextBlock a une list de characters obligatgoire et que context.character du nextblock est undefined par example avec resolveCharacter
	// return { valid: false, reason: "missing_character_required" };
	if (metadata?.characters) {
		if (context.character === undefined) {
			return { valid: false, reason: "missing_character_required" };
		}
	}
	return { valid: true };
});

// onInvalidateBlock existe aussi par default et peut etre remplacer par le dev
engine.onInvalidateBlock(({ scene, reason }) => {
	console.log(`   ❌ INVALIDATED: ${reason}`);
	if (reason === "missing_character_required") {
		// si missing character , le dev decide de cancel, selon son moteur.
		scene.cancel();
	}
});

// ─── Handlers ───────────────────────────────────────────────────────────────

engine.onBeforeBlock(({ block, resolve }) => {
	const { label, nativeProperties } = block;
	const delay = nativeProperties?.delay;
	if (delay) console.log(`   ⏳ before: ${label} delay=${delay}s`);
	resolve();
});

engine.onDialog(({ block, context, next }) => {
	const { label, nativeProperties } = block;
	const { dialogueText } = block;
	const { character, resolveCharacterPort } = context;
	const text = dialogueText?.["en"] ?? "—";
	const name = character
		? `${character.name} (${character.emotion ?? "?"})`
		: "(no character)";

	console.log(`\n💬 DIALOG  ${label}`);
	console.log(`   🎭 ${name}`);
	console.log(`   📝 "${text}"`);

	if (nativeProperties?.portPerCharacter && character) {
		console.log(`   🔀 resolveCharacterPort: ${character.name}`);
		resolveCharacterPort(character.name);
	}
	next();

	return () => console.log(`   🧹 cleanup: ${label}`);
});

let choiceCount = 0;
engine.onChoice(({ block, context, next }) => {
	const { label } = block;
	const { choices, selectChoice } = context;
	choiceCount++;
	console.log(`\n❓ CHOICE  ${label} — ${choices.length} visible`);
	for (const choice of choices) {
		const { label: choiceLabel, uuid, dialogueText } = choice;
		console.log(
			`   👉 ${choiceLabel ?? uuid.slice(0, 8)}: "${dialogueText?.["en"] ?? "—"}"`,
		);
	}
	const pick = choices.length > 1 && choiceCount > 1 ? choices[1]! : choices[0];
	if (pick) {
		console.log(`   ✅ selecting: ${pick.label ?? pick.uuid.slice(0, 8)}`);
		selectChoice(pick.uuid);
	}
	next();
});

engine.onCondition(({ block, context, next }) => {
	const { label } = block;
	const { conditions } = block;
	const { resolve } = context;
	const result = LsdeUtils.evaluateConditionChain(conditions ?? [], () => true);
	console.log(`\n🔀 CONDITION  ${label} conditions → ${result}`);
	resolve(result);
	next();
});

engine.onAction(({ block, context, next }) => {
	const { label } = block;
	const { actions = [] } = block;
	const { resolve, reject } = context;
	console.log(`\n⚡ ACTION  ${label} — ${actions.length} actions`);
	try {
		for (const { actionId, params } of actions) {
			console.log(`   🎯 ${actionId}(${params.join(", ")})`);
		}
		resolve();
	} catch (err) {
		reject(err);
	}

	next();

	return () => console.log(`   🧹 cleanup: ${label}`);
});

engine.onSceneEnter(({ scene }) => {
	console.log(`\n🟢 ━━━ Scene Enter ━━━  running=${scene.isRunning()}`);
});

engine.onSceneExit(() => {
	console.log(`🔴 ━━━ Scene Exit ━━━\n`);
});

// ─── Run ────────────────────────────────────────────────────────────────────

const sceneId = testData.scenes[0]?.uuid ?? "";
const sceneName = testData.scenes[0]?.label ?? sceneId;
console.log(`\n🚀 Launching scene: ${sceneName}`);

const handle = engine.scene(sceneId);
handle.start();

const visited = Array.from(handle.getVisitedBlocks()).map((uuid) => {
	for (const { blocks } of testData.scenes) {
		const b = blocks.find((bl) => bl.uuid === uuid);
		if (b) return b.label ?? uuid.slice(0, 8);
	}
	return uuid.slice(0, 8);
});
console.log(`\n📋 Visited: ${visited.join(", ")}`);
console.log(
	`📊 Choice History:`,
	Object.fromEntries(handle.getChoiceHistory()),
);
console.log(`🏁 Engine running: ${engine.isRunning()}`);

//TODO:
// charactere name ? ces pas ce quon veut !? on veut le charactere id pour recuperer cela en jeux ! pk ces comme ca ?
// pareil pour emotion ? check si ces bien le id qui est export !
// character est actuelement le premier character de la liste characters ! mais ce que on veut en vrai ces les personnages passer par le game

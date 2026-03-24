declare const console: { log: (...args: unknown[]) => void };

// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).

import { DialogueEngine } from "./index.js";
import type { BlueprintExport, StateBridge } from "./index.js";
import blueprintJson from "../../blueprints/blueprint.json";

const testData = blueprintJson as unknown as BlueprintExport;
const engine = new DialogueEngine();

// ─── Init ───────────────────────────────────────────────────────────────────

const { errors, warnings, stats } = engine.init({ data: testData });
const { sceneCount, blockCount, connectionCount } = stats;
console.log(`\n🔧 Init — ${errors.length} errors, ${warnings.length} warnings`);
console.log(
	`   📊 ${sceneCount} scenes, ${blockCount} blocks, ${connectionCount} connections`,
);
for (const { code, message } of warnings)
	console.log(`   ⚠️  ${code}: ${message}`);

engine.setLocale("en");

// ─── StateBridge ────────────────────────────────────────────────────────────

const bridge: StateBridge = {
	evaluateCondition: (cond) => {
		const { key, operator, value } = cond;
		console.log(`   🔗 bridge.eval: ${key} ${operator} ${value} → true`);
		return true;
	},
	executeAction: (action, sig) => {
		const { actionId, params } = action;
		console.log(
			`   🔗 bridge.exec: ${sig?.label ?? actionId}(${params.join(", ")})`,
		);
	},
	resolveDictionary: (group, key) => `${group}.${key}`,
	resolveCharacter: (characters) => characters[0],
};
engine.setStateBridge(bridge);

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
	const count = conditions?.length ?? 0;
	const result = count > 0;
	console.log(`\n🔀 CONDITION  ${label} — ${count} conditions → ${result}`);
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

engine.onValidateNextBlock(({ nextBlock, fromBlock }) => {
	if (fromBlock)
		console.log(`   ✔️  validate: ${fromBlock.label} → ${nextBlock.label}`);
	return { valid: true };
});

engine.onInvalidateBlock(({ scene, reason }) => {
	console.log(`   ❌ INVALIDATED: ${reason}`);
	scene.cancel();
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

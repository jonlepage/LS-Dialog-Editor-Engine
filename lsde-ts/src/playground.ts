declare const console: { log: (...args: unknown[]) => void };

// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).

import { DialogueEngine, LsdeUtils } from "./index.js";
import type { BlueprintExport } from "./index.js";
import blueprintJson from "../../blueprints/blueprint.json";

const testData = blueprintJson as unknown as BlueprintExport;
const engine = new DialogueEngine();

// ─── Init ───────────────────────────────────────────────────────────────────

const { errors, warnings, stats } = engine.init({ data: testData });
const { sceneCount, blockCount, connectionCount } = stats;
console.log(`\n🔧 Init — ${errors.length} errors, ${warnings.length} warnings`);

for (const { code, message } of warnings)
	console.log(`   ⚠️  ${code}: ${message}`);

console.log(`📊`, { sceneCount, blockCount, connectionCount });

// on peut changer les locales on the fly
engine.setLocale("en");

// on ajoute l'algorithme de résolution de personnage
// ex: ex esceque au moment T le actors est dispo dans le party en jeux ? si non , on met undefined et le flow arretera.

engine.onResolveCharacter((characters) => characters[0]);

// ─── 4 Required Handlers ────────────────────────────────────────────────────

engine.onDialog(({ block, context, next }) => {
	const { dialogueText } = block;
	const { character, resolveCharacterPort } = context;
	const text = LsdeUtils.getLocalizedText(dialogueText);

	console.log(`\n💬 DIALOG  ${block.label}`);
	console.log(
		`   🎭 ${character?.name} ${character?.id} [${character?.emotion ?? ""}]`,
	);
	console.log(`   📝 "${text ?? "—"}"`);

	if (block.nativeProperties?.portPerCharacter && character) {
		console.log(`   🔀 resolveCharacterPort: ${character.uuid}`);
		resolveCharacterPort(character.uuid);
	}
	next();

	return () => console.log(`   🧹 cleanup: ${block.label}`);
});

engine.onChoice(({ scene, block, context, next }) => {
	const { choices, selectChoice } = context;

	// Filter visibility: choice: conditions resolved via scene history, game-state = true (playground)
	const visible = LsdeUtils.filterVisibleChoices(choices, () => true, scene);

	console.log(
		`\n❓ CHOICE  ${block.label} — ${visible.length}/${choices.length} choices visible`,
	);

	for (const choice of visible) {
		const text = LsdeUtils.getLocalizedText(choice.dialogueText);
		console.log(
			`   👉 ${choice.label ?? choice.uuid.slice(0, 8)}: "${text ?? "—"}"`,
		);
	}
	const pick = (function simulatePlayerChoice() {
		// Simulate player picking the first choice on the 2nd choice block, otherwise no choice
		return undefined;
	})();

	if (pick) {
		console.log(`   ✅ selecting: ${pick.label ?? pick.uuid.slice(0, 8)}`);
		selectChoice(pick.uuid);
	}
	next();
});

engine.onCondition(({ scene, block, context, next }) => {
	const { conditions } = block;
	const result = LsdeUtils.evaluateConditionChain(
		conditions ?? [],
		(cond) =>
			LsdeUtils.isChoiceCondition(cond) ? scene.evaluateCondition(cond) : true, // playground: all game conditions pass
	);
	for (const cond of conditions ?? []) {
		console.log(`   ❓ condition: ${cond.key} ${cond.operator} ${cond.value}`);
	}
	console.log(
		`\n🔀 CONDITION  ${block.label} — ${conditions?.length ?? 0} conditions → ${result}`,
	);
	context.resolve(result);
	next();
});

engine.onAction(({ block, context, next }) => {
	const { actions = [] } = block;
	console.log(`\n⚡ ACTION  ${block.label} — ${actions.length} actions`);
	for (const { actionId, params } of actions) {
		console.log(`   🎯 ${actionId}(${params.join(", ")})`);
	}
	context.resolve();
	next();

	return () => console.log(`   🧹 cleanup: ${block.label}`);
});

// ─── Optional Handlers ──────────────────────────────────────────────────────

engine.onBeforeBlock(({ block, resolve }) => {
	const delay = block.nativeProperties?.delay;
	if (delay) console.log(`   ⏳ before: ${block.label} delay=${delay}s`);
	resolve();
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

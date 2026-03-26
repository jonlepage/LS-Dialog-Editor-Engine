declare const console: { log: (...args: unknown[]) => void };

// Playground — tests the engine API with a real blueprint.
// This file is excluded from build (tsconfig.json exclude).

import { DialogueEngine, LsdeUtils } from "./index.js";
import type { BlueprintExport, RuntimeChoiceItem } from "./index.js";
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

// Opt-in: install choice visibility filter (playground: all game-state conditions pass)
engine.setChoiceFilter((cond) => {
	// Simule un game state où variable_0 = "something_else"
	if (cond.key === "variable_0") return cond.value === "something_else";
	return true;
});

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

engine.onChoice(({ block, context, next }) => {
	const { choices, selectChoice } = context;

	// choices are tagged with .visible by the engine (setChoiceFilter installed above)
	const visible = choices.filter((c) => c.visible !== false);
	const timeout = block.nativeProperties?.timeout;
	// le moteur de jeux decidera quel visible choix est actif par default
	const active = (() => visible[0])();

	console.log(
		`\n❓ CHOICE  ${block.label} — ${visible.length}/${choices.length} choices visible`,
	);
	for (const choice of visible) {
		const text = LsdeUtils.getLocalizedText(choice.dialogueText);
		const isActive = choice === active;
		console.log(
			`   👉 ${choice.label ?? choice.uuid.slice(0, 8)}: "${text ?? "—"}"${isActive ? " (active)" : ""}`,
		);
	}

	// le resolver si on decide de prendre en charge les timeout
	const resolve = (choice: RuntimeChoiceItem | undefined) => {
		// Simulate player picking the first choice on the 2nd choice block, otherwise no choice
		//ui.showChoices(visible, activeIndex, (picked) => resolve(picked));
		console.log(
			`   ✅ selecting: ${choice?.label ?? choice?.uuid.slice(0, 8)}`,
		);
		if (timer) clearTimeout(timer);
		if (choice) selectChoice(choice.uuid);
		next();
	};

	// Auto-select si timeout
	let timer: ReturnType<typeof setTimeout> | undefined;
	if (timeout) {
		console.log("💌timeout:", timeout);
		timer = setTimeout(() => {
			resolve(active); // auto-select le choix actif
		}, timeout);
	} else {
		// si pas de timeout, on va utiliser un waitinput dans le game engine
		resolve(active);
	}

	return () => {
		if (timer) clearTimeout(timer);
		console.log(`   🧹 cleanup: ${block.label}`);
	};
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
		// dev will probabli use switch case for better handling and mapping to game functions
	}
	context.resolve();
	// context.reject();
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

handle.onExit(() => {
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
});

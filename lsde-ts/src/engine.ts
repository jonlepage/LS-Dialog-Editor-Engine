// LSDE Dialog Engine — Public facade

import type {
	IDialogueEngine,
	InitOptions,
	DiagnosticReport,
	StateBridge,
	SceneHandle,
	BlockHandler,
	DialogContext,
	ChoiceContext,
	ConditionContext,
	ActionContext,
	SceneLifecycleHandler,
	ValidateNextBlockHandler,
	InvalidateBlockHandler,
	BeforeBlockHandler,
	BlueprintBlock,
	BlueprintConnection,
} from "./types.js";
import { validateBlueprint } from "./validator.js";
import { BlueprintGraph } from "./graph.js";
import { HandlerRegistry } from "./handler-registry.js";
import { SceneHandleImpl } from "./scene-handle.js";

/** LSDE Dialog Engine — callback-driven graph dispatcher. */
export class DialogueEngine implements IDialogueEngine {
	/** Indexed blueprint graph built by init(). Null until successfully initialized. */
	private graph: BlueprintGraph | null = null;
	/** Tier 1 (global) handler registry — stores all engine-level handlers. */
	private readonly globalRegistry = new HandlerRegistry();
	/** User-provided bridge for condition evaluation, action execution, and dictionary resolution. */
	private stateBridge: StateBridge | null = null;
	/** Active locale code passed to scene handles for text resolution. */
	private locale = "";
	/** Currently running scenes keyed by scene UUID. Entries are added/removed by scene lifecycle callbacks. */
	private readonly activeScenes = new Map<string, SceneHandleImpl>();
	/** Guard preventing scene creation before init() succeeds. */
	private initialized = false;

	init(options: InitOptions): DiagnosticReport {
		const report = validateBlueprint(options);

		if (report.errors.length === 0) {
			this.graph = new BlueprintGraph(options.data);
			this.initialized = true;
		}

		return report;
	}

	setLocale(locale: string): void {
		this.locale = locale;
	}

	setStateBridge(bridge: StateBridge): void {
		this.stateBridge = bridge;
	}

	onValidateNextBlock(handler: ValidateNextBlockHandler): void {
		this.globalRegistry.validateNextBlockHandler = handler;
	}

	onInvalidateBlock(handler: InvalidateBlockHandler): void {
		this.globalRegistry.invalidateBlockHandler = handler;
	}

	onBeforeBlock(handler: BeforeBlockHandler): void {
		this.globalRegistry.beforeBlockHandler = handler;
	}

	onDialog(handler: BlockHandler<DialogContext>): void {
		this.globalRegistry.dialogHandler = handler;
	}

	onChoice(handler: BlockHandler<ChoiceContext>): void {
		this.globalRegistry.choiceHandler = handler;
	}

	onCondition(handler: BlockHandler<ConditionContext>): void {
		this.globalRegistry.conditionHandler = handler;
	}

	onAction(handler: BlockHandler<ActionContext>): void {
		this.globalRegistry.actionHandler = handler;
	}

	onSceneEnter(handler: SceneLifecycleHandler): void {
		this.globalRegistry.sceneEnterHandler = handler;
	}

	onSceneExit(handler: SceneLifecycleHandler): void {
		this.globalRegistry.sceneExitHandler = handler;
	}

	scene(sceneId: string): SceneHandle {
		if (!this.initialized || !this.graph) {
			throw new Error("Engine not initialized. Call init() first.");
		}

		const sceneGraph = this.graph.getSceneGraph(sceneId);
		if (!sceneGraph) {
			throw new Error(`Scene "${sceneId}" not found.`);
		}

		const handle = new SceneHandleImpl(sceneGraph, this.globalRegistry, {
			onSceneStarted: (h) => this.activeScenes.set(sceneId, h),
			onSceneEnded: () => this.activeScenes.delete(sceneId),
			getStateBridge: () => this.stateBridge,
			getLocale: () => this.locale,
		});

		return handle;
	}

	stop(): void {
		for (const handle of Array.from(this.activeScenes.values())) {
			handle.cancel();
		}
	}

	isRunning(): boolean {
		return this.activeScenes.size > 0;
	}

	getActiveScenes(): SceneHandle[] {
		return Array.from(this.activeScenes.values());
	}

	getCurrentBlocks(): BlueprintBlock[] {
		const blocks: BlueprintBlock[] = [];
		for (const handle of this.activeScenes.values()) {
			const block = handle.getCurrentBlock();
			if (block) blocks.push(block);
		}
		return blocks;
	}

	getSceneConnections(sceneId: string): BlueprintConnection[] {
		if (!this.graph) return [];
		return this.graph.getSceneConnections(sceneId);
	}
}

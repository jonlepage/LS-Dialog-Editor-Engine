// LSDE Dialog Engine — Handler registration + Tier 1/Tier 2 resolution

import type {
	BlockType, BlueprintBlock, BlockHandler, BaseBlockContext,
	DialogHandler, ChoiceHandler, ConditionHandler, ActionHandler,
	SceneLifecycleHandler,
	ValidateNextBlockHandler, InvalidateBlockHandler, BeforeBlockHandler,
} from './types.js';

// ─── Tier 1 — Global Registry ────────────────────────────────────────────────

/** Stores global (Tier 1) handlers. Last-write-wins per slot. */
export class HandlerRegistry {

	dialogHandler: DialogHandler | null = null;
	choiceHandler: ChoiceHandler | null = null;
	conditionHandler: ConditionHandler | null = null;
	actionHandler: ActionHandler | null = null;

	sceneEnterHandler: SceneLifecycleHandler | null = null;
	sceneExitHandler: SceneLifecycleHandler | null = null;

	validateNextBlockHandler: ValidateNextBlockHandler | null = null;
	invalidateBlockHandler: InvalidateBlockHandler | null = null;
	beforeBlockHandler: BeforeBlockHandler | null = null;

	getTypeHandler( type: BlockType ): BlockHandler<BlueprintBlock, BaseBlockContext> | null {
		switch ( type ) {
			case 'DIALOG': return this.dialogHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'CHOICE': return this.choiceHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'CONDITION': return this.conditionHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'ACTION': return this.actionHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'NOTE': return null;
		}
	}
}

// ─── Tier 2 — Per-Scene Registry ─────────────────────────────────────────────

/** Stores per-scene (Tier 2) handlers. */
export class SceneHandlerRegistry {

	private readonly blockHandlers = new Map<string, BlockHandler<BlueprintBlock, BaseBlockContext>>();

	dialogHandler: DialogHandler | null = null;
	choiceHandler: ChoiceHandler | null = null;
	conditionHandler: ConditionHandler | null = null;
	actionHandler: ActionHandler | null = null;

	enterHandler: SceneLifecycleHandler | null = null;
	exitHandler: SceneLifecycleHandler | null = null;

	setBlockHandler( blockUuid: string, handler: BlockHandler<BlueprintBlock, BaseBlockContext> ): void {
		this.blockHandlers.set( blockUuid, handler );
	}

	getBlockHandler( blockUuid: string ): BlockHandler<BlueprintBlock, BaseBlockContext> | null {
		return this.blockHandlers.get( blockUuid ) ?? null;
	}

	getTypeHandler( type: BlockType ): BlockHandler<BlueprintBlock, BaseBlockContext> | null {
		switch ( type ) {
			case 'DIALOG': return this.dialogHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'CHOICE': return this.choiceHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'CONDITION': return this.conditionHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'ACTION': return this.actionHandler as BlockHandler<BlueprintBlock, BaseBlockContext> | null;
			case 'NOTE': return null;
		}
	}
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolvedHandlers {
	sceneHandler: BlockHandler<BlueprintBlock, BaseBlockContext> | null;
	globalHandler: BlockHandler<BlueprintBlock, BaseBlockContext> | null;
}

/**
 * Resolve which handlers to call for a given block.
 * Priority: onBlock(uuid) > scene.onType > engine.onType
 */
export function resolveHandler(
	blockType: BlockType,
	blockUuid: string,
	sceneRegistry: SceneHandlerRegistry | null,
	globalRegistry: HandlerRegistry,
): ResolvedHandlers {
	const globalHandler = globalRegistry.getTypeHandler( blockType );

	if ( !sceneRegistry ) {
		return { sceneHandler: null, globalHandler };
	}

	// Most specific: onBlock(uuid)
	const blockOverride = sceneRegistry.getBlockHandler( blockUuid );
	if ( blockOverride ) {
		return { sceneHandler: blockOverride, globalHandler };
	}

	// Scene type override
	const sceneTypeHandler = sceneRegistry.getTypeHandler( blockType );
	if ( sceneTypeHandler ) {
		return { sceneHandler: sceneTypeHandler, globalHandler };
	}

	return { sceneHandler: null, globalHandler };
}

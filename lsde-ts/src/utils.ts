// LSDE Dialog Engine — Shared helpers

import type {
	BlueprintBlock, DialogBlock, ChoiceBlock, ConditionBlock, ActionBlock, NoteBlock,
} from './types.js';

/** Exhaustive switch helper — causes a compile error if a case is missing. */
export function assertNever( x: never ): never {
	throw new Error( `Unexpected value: ${ String( x ) }` );
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

export function isDialogBlock( block: BlueprintBlock ): block is DialogBlock {
	return block.type === 'DIALOG';
}

export function isChoiceBlock( block: BlueprintBlock ): block is ChoiceBlock {
	return block.type === 'CHOICE';
}

export function isConditionBlock( block: BlueprintBlock ): block is ConditionBlock {
	return block.type === 'CONDITION';
}

export function isActionBlock( block: BlueprintBlock ): block is ActionBlock {
	return block.type === 'ACTION';
}

export function isNoteBlock( block: BlueprintBlock ): block is NoteBlock {
	return block.type === 'NOTE';
}


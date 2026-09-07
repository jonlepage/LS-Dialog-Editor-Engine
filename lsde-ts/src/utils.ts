// LSDE Dialog Engine — Shared helpers

import type {
	BlueprintBlock, DialogBlock, ChoiceBlock, ConditionBlock, ActionBlock, NoteBlock,
} from './types.js';
import { BlockType } from './types.js';

// ─── Type Guards ─────────────────────────────────────────────────────────────

export function isDialogBlock( block: BlueprintBlock ): block is DialogBlock {
	return block.type === BlockType.Dialog;
}

export function isChoiceBlock( block: BlueprintBlock ): block is ChoiceBlock {
	return block.type === BlockType.Choice;
}

export function isConditionBlock( block: BlueprintBlock ): block is ConditionBlock {
	return block.type === BlockType.Condition;
}

export function isActionBlock( block: BlueprintBlock ): block is ActionBlock {
	return block.type === BlockType.Action;
}

export function isNoteBlock( block: BlueprintBlock ): block is NoteBlock {
	return block.type === BlockType.Note;
}


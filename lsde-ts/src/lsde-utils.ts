// LSDE Dialog Engine — Public utilities for game developers

import type { BlueprintBlock, ExportCondition, ChoiceItem } from './types.js';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock, isNoteBlock } from './utils.js';
import { evaluateConditionChain, filterVisibleChoices } from './condition-evaluator.js';

/** Public utility class exposing common helpers for game developers integrating the LSDE engine. */
export class LsdeUtils {

	// ─── Type Guards ─────────────────────────────────────────────────────────────

	/** Returns `true` if the block is a {@link DialogBlock}. */
	static isDialogBlock = isDialogBlock;
	/** Returns `true` if the block is a {@link ChoiceBlock}. */
	static isChoiceBlock = isChoiceBlock;
	/** Returns `true` if the block is a {@link ConditionBlock}. */
	static isConditionBlock = isConditionBlock;
	/** Returns `true` if the block is an {@link ActionBlock}. */
	static isActionBlock = isActionBlock;
	/** Returns `true` if the block is a {@link NoteBlock}. */
	static isNoteBlock = isNoteBlock;

	// ─── Display Helpers ─────────────────────────────────────────────────────────

	/** Returns the block's label, or the first 8 characters of its UUID as fallback. */
	static getBlockLabel( block: BlueprintBlock ): string {
		return block.label ?? block.uuid.slice( 0, 8 );
	}

	/**
	 * Looks up a localized text value from a `dialogueText` map.
	 * Works with both `DialogBlock.dialogueText` and `ChoiceItem.dialogueText`.
	 * @returns The localized string, or `undefined` if the locale is not found.
	 */
	static getLocalizedText( dialogueText: Record<string, string> | undefined, locale: string ): string | undefined {
		return dialogueText?.[locale];
	}

	// ─── Condition Helpers ───────────────────────────────────────────────────────

	/**
	 * Returns `true` if the condition references a previous choice selection.
	 * Choice conditions use the key format `"choice:<blockUuid>"` and are
	 * evaluated internally by the engine against the scene's choice history.
	 */
	static isChoiceCondition( condition: ExportCondition ): boolean {
		return condition.key.startsWith( 'choice:' );
	}

	/**
	 * Extracts the referenced choice block UUID from a choice condition.
	 * @returns The block UUID, or `undefined` if the condition is not a choice condition.
	 */
	static getChoiceConditionBlockUuid( condition: ExportCondition ): string | undefined {
		return condition.key.startsWith( 'choice:' ) ? condition.key.slice( 7 ) : undefined;
	}

	/**
	 * Evaluates a chain of conditions with `&` (AND) / `|` (OR) chaining.
	 * Left-to-right evaluation, no operator precedence. Empty array returns `true`.
	 * @param conditions - The condition chain to evaluate.
	 * @param evaluator - A callback that evaluates a single condition.
	 */
	static evaluateConditionChain = evaluateConditionChain;

	/**
	 * Filters choice items by their visibility conditions.
	 * Choices without `visibilityConditions` are always visible.
	 * @param choices - The full list of choices.
	 * @param evaluator - A callback that evaluates a single condition.
	 */
	static filterVisibleChoices = filterVisibleChoices;
}

// LSDE Dialog Engine — Context factory per block type

import type {
	DialogBlock, ChoiceBlock, RuntimeChoiceItem, RuntimeConditionGroup,
	DialogContext, ChoiceContext, ConditionContext, ActionContext, BlockCharacter,
} from './types.js';

// ─── Internal extended types (engine-internal state) ─────────────────────────

export interface InternalDialogContext extends DialogContext {
	_globalPrevented: boolean;
	_characterPortIndex: number | undefined;
}

export interface InternalChoiceContext extends ChoiceContext {
	_globalPrevented: boolean;
	_selectedChoiceUuid: string | undefined;
}

export interface InternalConditionContext extends ConditionContext {
	_globalPrevented: boolean;
	_conditionResult: boolean | number | number[] | undefined;
}

export interface InternalActionContext extends ActionContext {
	_globalPrevented: boolean;
	_actionRejected: boolean;
}

// ─── Factories ───────────────────────────────────────────────────────────────

export function createDialogContext( block: DialogBlock, resolvedCharacter: BlockCharacter | undefined ): InternalDialogContext {
	const characters = block.metadata?.characters ?? [];
	const ctx: InternalDialogContext = {
		_globalPrevented: false,
		_characterPortIndex: undefined,
		character: resolvedCharacter,
		resolveCharacterPort( characterUuid: string ) {
			let index = characters.findIndex( c => c.uuid === characterUuid );
			if ( index < 0 ) {
				index = characters.findIndex( c => c.name === characterUuid );
			}
			ctx._characterPortIndex = index >= 0 ? index : undefined;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createChoiceContext(
	block: ChoiceBlock,
	taggedChoices: RuntimeChoiceItem[],
	onChoiceSelected: ( ( blockUuid: string, choiceUuid: string ) => void ) | undefined,
	resolvedCharacter: BlockCharacter | undefined,
): InternalChoiceContext {
	const choices: RuntimeChoiceItem[] = taggedChoices;
	const ctx: InternalChoiceContext = {
		_globalPrevented: false,
		_selectedChoiceUuid: undefined,
		character: resolvedCharacter,
		choices,
		selectChoice( choiceUuid: string ) {
			ctx._selectedChoiceUuid = choiceUuid;
			if ( onChoiceSelected ) {
				onChoiceSelected( block.uuid, choiceUuid );
			}
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createConditionContext(
	resolvedCharacter: BlockCharacter | undefined,
	conditionGroups: RuntimeConditionGroup[],
): InternalConditionContext {
	const ctx: InternalConditionContext = {
		_globalPrevented: false,
		_conditionResult: undefined,
		character: resolvedCharacter,
		conditionGroups,
		resolve( result: boolean | number | number[] ) {
			ctx._conditionResult = result;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createActionContext( resolvedCharacter: BlockCharacter | undefined ): InternalActionContext {
	const ctx: InternalActionContext = {
		_globalPrevented: false,
		_actionRejected: false,
		character: resolvedCharacter,
		resolve() {
			ctx._actionRejected = false;
		},
		reject() {
			ctx._actionRejected = true;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

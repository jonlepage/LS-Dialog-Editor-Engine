// LSDE Dialog Engine — Context factory per block type

import type {
	DialogBlock, ChoiceBlock, ExportCondition, ChoiceItem,
	DialogContext, ChoiceContext, ConditionContext, ActionContext, BlockCharacter,
} from './types.js';
import { getFirstCharacter } from './utils.js';
import { filterVisibleChoices } from './condition-evaluator.js';

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
	_conditionResult: boolean | undefined;
}

export interface InternalActionContext extends ActionContext {
	_globalPrevented: boolean;
	_actionRejected: boolean;
}

// ─── Factories ───────────────────────────────────────────────────────────────

export function createDialogContext( block: DialogBlock ): InternalDialogContext {
	const character: BlockCharacter | null = getFirstCharacter( block );
	const characters = block.metadata?.characters ?? [];
	const ctx: InternalDialogContext = {
		_globalPrevented: false,
		_characterPortIndex: undefined,
		character,
		resolveCharacterPort( name: string ) {
			const index = characters.findIndex( c => c.name === name );
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
	evaluator: ( condition: ExportCondition ) => boolean,
	onChoiceSelected?: ( blockUuid: string, choiceUuid: string ) => void,
): InternalChoiceContext {
	const visibleChoices: ChoiceItem[] = filterVisibleChoices( block.choices ?? [], evaluator );
	const ctx: InternalChoiceContext = {
		_globalPrevented: false,
		_selectedChoiceUuid: undefined,
		choices: visibleChoices,
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

export function createConditionContext(): InternalConditionContext {
	const ctx: InternalConditionContext = {
		_globalPrevented: false,
		_conditionResult: undefined,
		resolve( result: boolean ) {
			ctx._conditionResult = result;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createActionContext(): InternalActionContext {
	const ctx: InternalActionContext = {
		_globalPrevented: false,
		_actionRejected: false,
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

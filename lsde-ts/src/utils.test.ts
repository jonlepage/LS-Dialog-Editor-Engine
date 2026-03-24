import { describe, it, expect } from 'vitest';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock, isNoteBlock } from './utils.js';
import type { BlueprintBlock } from './types.js';

const baseBlock = {
	uuid: 'test-uuid',
	label: 'Test',
	properties: [],
};

const dialogBlock: BlueprintBlock = { ...baseBlock, type: 'DIALOG' as const };
const choiceBlock: BlueprintBlock = { ...baseBlock, type: 'CHOICE' as const };
const conditionBlock: BlueprintBlock = { ...baseBlock, type: 'CONDITION' as const };
const actionBlock: BlueprintBlock = { ...baseBlock, type: 'ACTION' as const };
const noteBlock: BlueprintBlock = { ...baseBlock, type: 'NOTE' as const };

describe( 'type guards', () => {

	it( 'isDialogBlock narrows correctly', () => {
		expect( isDialogBlock( dialogBlock ) ).toBe( true );
		expect( isDialogBlock( choiceBlock ) ).toBe( false );
	} );

	it( 'isChoiceBlock narrows correctly', () => {
		expect( isChoiceBlock( choiceBlock ) ).toBe( true );
		expect( isChoiceBlock( dialogBlock ) ).toBe( false );
	} );

	it( 'isConditionBlock narrows correctly', () => {
		expect( isConditionBlock( conditionBlock ) ).toBe( true );
		expect( isConditionBlock( dialogBlock ) ).toBe( false );
	} );

	it( 'isActionBlock narrows correctly', () => {
		expect( isActionBlock( actionBlock ) ).toBe( true );
		expect( isActionBlock( dialogBlock ) ).toBe( false );
	} );

	it( 'isNoteBlock narrows correctly', () => {
		expect( isNoteBlock( noteBlock ) ).toBe( true );
		expect( isNoteBlock( dialogBlock ) ).toBe( false );
	} );

} );


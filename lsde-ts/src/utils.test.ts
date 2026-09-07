import { describe, it, expect } from 'vitest';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock, isNoteBlock } from './utils.js';
import type { BlueprintBlock } from './types.js';

// v2 block types are lowercase. A payload still carrying 'DIALOG' matches no guard at all, which
// is the point: an index or a casing mismatch used to route silently, a name does not.
const baseBlock = { id: 'DIALOG-001', key: '__blueprints__.s1.DIALOG-001' };

const dialogBlock = { ...baseBlock, type: 'dialog' } as BlueprintBlock;
const choiceBlock = { ...baseBlock, type: 'choice' } as BlueprintBlock;
const conditionBlock = { ...baseBlock, type: 'condition' } as BlueprintBlock;
const actionBlock = { ...baseBlock, type: 'action' } as BlueprintBlock;
const noteBlock = { ...baseBlock, type: 'note' } as BlueprintBlock;
const v1Block = { ...baseBlock, type: 'DIALOG' } as unknown as BlueprintBlock;

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

	it( 'matches no guard for a v1 uppercase type', () => {
		expect( isDialogBlock( v1Block ) ).toBe( false );
		expect( isNoteBlock( v1Block ) ).toBe( false );
	} );

} );


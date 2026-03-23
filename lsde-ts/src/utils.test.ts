import { describe, it, expect } from 'vitest';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock, isNoteBlock, getFirstCharacter } from './utils.js';
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

describe( 'getFirstCharacter', () => {

	it( 'returns null when no metadata', () => {
		expect( getFirstCharacter( dialogBlock ) ).toBeNull();
	} );

	it( 'returns null when no characters', () => {
		const block: BlueprintBlock = { ...dialogBlock, metadata: { tags: [] } };
		expect( getFirstCharacter( block ) ).toBeNull();
	} );

	it( 'returns null when characters array is empty', () => {
		const block: BlueprintBlock = { ...dialogBlock, metadata: { characters: [] } };
		expect( getFirstCharacter( block ) ).toBeNull();
	} );

	it( 'returns the first character', () => {
		const block: BlueprintBlock = {
			...dialogBlock,
			metadata: {
				characters: [
					{ name: 'Hero', emotion: 'happy', emotionIntensity: 3 },
					{ name: 'Villain', emotion: 'angry', emotionIntensity: 5 },
				],
			},
		};
		const char = getFirstCharacter( block );
		expect( char ).toEqual( { name: 'Hero', emotion: 'happy', emotionIntensity: 3 } );
	} );

} );

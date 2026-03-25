import { describe, it, expect } from 'vitest';
import { LsdeUtils } from './lsde-utils.js';
import type { BlueprintBlock, ExportCondition } from './types.js';

const base = { uuid: 'abcdef12-3456-7890-abcd-ef1234567890', properties: [] as never[] };

describe( 'LsdeUtils', () => {

	// ─── Type Guards ─────────────────────────────────────────────────────────────

	describe( 'type guards', () => {
		it( 'isDialogBlock', () => {
			expect( LsdeUtils.isDialogBlock( { ...base, type: 'DIALOG' } ) ).toBe( true );
			expect( LsdeUtils.isDialogBlock( { ...base, type: 'CHOICE' } ) ).toBe( false );
		} );
		it( 'isChoiceBlock', () => {
			expect( LsdeUtils.isChoiceBlock( { ...base, type: 'CHOICE' } ) ).toBe( true );
		} );
		it( 'isConditionBlock', () => {
			expect( LsdeUtils.isConditionBlock( { ...base, type: 'CONDITION' } ) ).toBe( true );
		} );
		it( 'isActionBlock', () => {
			expect( LsdeUtils.isActionBlock( { ...base, type: 'ACTION' } ) ).toBe( true );
		} );
		it( 'isNoteBlock', () => {
			expect( LsdeUtils.isNoteBlock( { ...base, type: 'NOTE' } ) ).toBe( true );
		} );
	} );

	// ─── Display Helpers ─────────────────────────────────────────────────────────

	describe( 'getBlockLabel', () => {
		it( 'returns label when present', () => {
			const block: BlueprintBlock = { ...base, type: 'DIALOG', label: 'My Dialog' };
			expect( LsdeUtils.getBlockLabel( block ) ).toBe( 'My Dialog' );
		} );
		it( 'falls back to uuid prefix when no label', () => {
			const block: BlueprintBlock = { ...base, type: 'DIALOG' };
			expect( LsdeUtils.getBlockLabel( block ) ).toBe( 'abcdef12' );
		} );
	} );

	describe( 'getLocalizedText', () => {
		it( 'returns text for matching locale', () => {
			expect( LsdeUtils.getLocalizedText( { en: 'Hello', fr: 'Bonjour' }, 'fr' ) ).toBe( 'Bonjour' );
		} );
		it( 'returns undefined for missing locale', () => {
			expect( LsdeUtils.getLocalizedText( { en: 'Hello' }, 'jp' ) ).toBeUndefined();
		} );
		it( 'returns undefined for undefined map', () => {
			expect( LsdeUtils.getLocalizedText( undefined, 'en' ) ).toBeUndefined();
		} );
	} );

	// ─── Condition Helpers ───────────────────────────────────────────────────────

	describe( 'isChoiceCondition', () => {
		it( 'returns true for choice: prefix', () => {
			const cond: ExportCondition = { uuid: 'c1', key: 'choice:abc-123', operator: '==', value: 'x' };
			expect( LsdeUtils.isChoiceCondition( cond ) ).toBe( true );
		} );
		it( 'returns false for regular condition', () => {
			const cond: ExportCondition = { uuid: 'c1', key: 'player_level', operator: '>=', value: '5' };
			expect( LsdeUtils.isChoiceCondition( cond ) ).toBe( false );
		} );
	} );

	describe( 'getChoiceConditionBlockUuid', () => {
		it( 'extracts block UUID from choice condition', () => {
			const cond: ExportCondition = { uuid: 'c1', key: 'choice:block-uuid-here', operator: '==', value: 'x' };
			expect( LsdeUtils.getChoiceConditionBlockUuid( cond ) ).toBe( 'block-uuid-here' );
		} );
		it( 'returns undefined for non-choice condition', () => {
			const cond: ExportCondition = { uuid: 'c1', key: 'has_item', operator: '==', value: 'sword' };
			expect( LsdeUtils.getChoiceConditionBlockUuid( cond ) ).toBeUndefined();
		} );
	} );

	// ─── Delegated helpers (sanity check — full tests in their own files) ────────

	describe( 'evaluateConditionChain', () => {
		it( 'returns true for empty array', () => {
			expect( LsdeUtils.evaluateConditionChain( [], () => false ) ).toBe( true );
		} );
	} );

	describe( 'filterVisibleChoices', () => {
		it( 'keeps choices without conditions', () => {
			const choices = [{ uuid: 'c1', structureKey: 'c1' }];
			expect( LsdeUtils.filterVisibleChoices( choices, () => false ) ).toHaveLength( 1 );
		} );
	} );

} );

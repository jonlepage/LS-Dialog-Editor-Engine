import { describe, it, expect, vi } from 'vitest';
import {
	createDialogContext, createChoiceContext, createConditionContext, createActionContext,
} from './block-context.js';
import type { DialogBlock, ChoiceBlock, BlockCharacter } from './types.js';

const baseProps = { uuid: 'b1', properties: [] as never[] };
const hero: BlockCharacter = { name: 'Hero', emotion: 'happy', emotionIntensity: 2 };

describe( 'createDialogContext', () => {

	it( 'uses the resolved character', () => {
		const block: DialogBlock = {
			...baseProps, type: 'DIALOG',
			metadata: { characters: [hero] },
		};
		const ctx = createDialogContext( block, hero );
		expect( ctx.character?.name ).toBe( 'Hero' );
	} );

	it( 'returns undefined character when none resolved', () => {
		const block: DialogBlock = { ...baseProps, type: 'DIALOG' };
		const ctx = createDialogContext( block, undefined );
		expect( ctx.character ).toBeUndefined();
	} );

	it( 'resolveCharacterPort stores the character index from metadata', () => {
		const block: DialogBlock = {
			...baseProps, type: 'DIALOG',
			metadata: { characters: [{ name: 'Hero' }, { name: 'Boss' }, { name: 'NPC' }] },
		};
		const ctx = createDialogContext( block, hero );
		ctx.resolveCharacterPort( 'Boss' );
		expect( ctx._characterPortIndex ).toBe( 1 );
	} );

	it( 'resolveCharacterPort sets undefined for unknown character', () => {
		const block: DialogBlock = {
			...baseProps, type: 'DIALOG',
			metadata: { characters: [{ name: 'Hero' }] },
		};
		const ctx = createDialogContext( block, hero );
		ctx.resolveCharacterPort( 'Ghost' );
		expect( ctx._characterPortIndex ).toBeUndefined();
	} );

	it( 'preventGlobalHandler sets the flag', () => {
		const block: DialogBlock = { ...baseProps, type: 'DIALOG' };
		const ctx = createDialogContext( block, undefined );
		expect( ctx._globalPrevented ).toBe( false );
		ctx.preventGlobalHandler();
		expect( ctx._globalPrevented ).toBe( true );
	} );

} );

describe( 'createChoiceContext', () => {

	const alwaysTrue = () => true;
	const alwaysFalse = () => false;

	it( 'filters choices by visibility conditions', () => {
		const block: ChoiceBlock = {
			...baseProps, type: 'CHOICE',
			choices: [
				{ uuid: 'c1', structureKey: 'c1' },
				{ uuid: 'c2', structureKey: 'c2', visibilityConditions: [{ uuid: 'v1', key: 'x', operator: '=', value: 'y' }] },
			],
		};
		const ctx = createChoiceContext( block, alwaysFalse, undefined, undefined );
		expect( ctx.choices ).toHaveLength( 1 );
		expect( ctx.choices[0]!.uuid ).toBe( 'c1' );
	} );

	it( 'keeps all choices when all conditions pass', () => {
		const block: ChoiceBlock = {
			...baseProps, type: 'CHOICE',
			choices: [
				{ uuid: 'c1', structureKey: 'c1', visibilityConditions: [{ uuid: 'v1', key: 'x', operator: '=', value: 'y' }] },
				{ uuid: 'c2', structureKey: 'c2' },
			],
		};
		const ctx = createChoiceContext( block, alwaysTrue, undefined, undefined );
		expect( ctx.choices ).toHaveLength( 2 );
	} );

	it( 'selectChoice stores the UUID', () => {
		const block: ChoiceBlock = {
			...baseProps, type: 'CHOICE',
			choices: [{ uuid: 'c1', structureKey: 'c1' }],
		};
		const ctx = createChoiceContext( block, alwaysTrue, undefined, undefined );
		ctx.selectChoice( 'c1' );
		expect( ctx._selectedChoiceUuid ).toBe( 'c1' );
	} );

	it( 'selectChoice invokes onChoiceSelected callback', () => {
		const block: ChoiceBlock = {
			...baseProps, type: 'CHOICE',
			choices: [{ uuid: 'c1', structureKey: 'c1' }],
		};
		const spy = vi.fn();
		const ctx = createChoiceContext( block, alwaysTrue, spy, undefined );
		ctx.selectChoice( 'c1' );
		expect( spy ).toHaveBeenCalledOnce();
		expect( spy ).toHaveBeenCalledWith( 'b1', 'c1' );
	} );

	it( 'exposes resolved character', () => {
		const block: ChoiceBlock = {
			...baseProps, type: 'CHOICE',
			choices: [{ uuid: 'c1', structureKey: 'c1' }],
		};
		const ctx = createChoiceContext( block, alwaysTrue, undefined, hero );
		expect( ctx.character?.name ).toBe( 'Hero' );
	} );

} );

describe( 'createConditionContext', () => {

	it( 'resolve(true) stores true', () => {
		const ctx = createConditionContext( undefined );
		ctx.resolve( true );
		expect( ctx._conditionResult ).toBe( true );
	} );

	it( 'resolve(false) stores false', () => {
		const ctx = createConditionContext( undefined );
		ctx.resolve( false );
		expect( ctx._conditionResult ).toBe( false );
	} );

	it( 'starts with undefined conditionResult', () => {
		const ctx = createConditionContext( undefined );
		expect( ctx._conditionResult ).toBeUndefined();
	} );

	it( 'exposes resolved character', () => {
		const ctx = createConditionContext( hero );
		expect( ctx.character?.name ).toBe( 'Hero' );
	} );

} );

describe( 'createActionContext', () => {

	it( 'resolve() marks success', () => {
		const ctx = createActionContext( undefined );
		ctx.resolve();
		expect( ctx._actionRejected ).toBe( false );
	} );

	it( 'reject() marks failure', () => {
		const ctx = createActionContext( undefined );
		ctx.reject( new Error( 'fail' ) );
		expect( ctx._actionRejected ).toBe( true );
	} );

	it( 'starts as not rejected', () => {
		const ctx = createActionContext( undefined );
		expect( ctx._actionRejected ).toBe( false );
	} );

	it( 'exposes resolved character', () => {
		const ctx = createActionContext( hero );
		expect( ctx.character?.name ).toBe( 'Hero' );
	} );

} );

import { describe, it, expect } from 'vitest';
import { HandlerRegistry, SceneHandlerRegistry, resolveHandler } from './handler-registry.js';
import type { BlockHandler, BlueprintBlock, BaseBlockContext, DialogHandler } from './types.js';

const noop: BlockHandler<BlueprintBlock, BaseBlockContext> = () => {};
const noopDialog: DialogHandler = () => {};

describe( 'resolveHandler', () => {

	it( 'returns global handler when no scene registry', () => {
		const global = new HandlerRegistry();
		global.dialogHandler = noopDialog;
		const result = resolveHandler( 'DIALOG', 'b1', null, global );
		expect( result.sceneHandler ).toBeNull();
		expect( result.globalHandler ).toBe( noopDialog );
	} );

	it( 'returns both null when no handlers registered', () => {
		const global = new HandlerRegistry();
		const scene = new SceneHandlerRegistry();
		const result = resolveHandler( 'DIALOG', 'b1', scene, global );
		expect( result.sceneHandler ).toBeNull();
		expect( result.globalHandler ).toBeNull();
	} );

	it( 'returns scene type handler as sceneHandler', () => {
		const global = new HandlerRegistry();
		global.dialogHandler = noopDialog;
		const scene = new SceneHandlerRegistry();
		const sceneDialogHandler: DialogHandler = () => {};
		scene.dialogHandler = sceneDialogHandler;

		const result = resolveHandler( 'DIALOG', 'b1', scene, global );
		expect( result.sceneHandler ).toBe( sceneDialogHandler );
		expect( result.globalHandler ).toBe( noopDialog );
	} );

	it( 'onBlock takes precedence over scene type handler', () => {
		const global = new HandlerRegistry();
		global.dialogHandler = noopDialog;
		const scene = new SceneHandlerRegistry();
		scene.dialogHandler = noopDialog;
		const blockHandler: BlockHandler<BlueprintBlock, BaseBlockContext> = () => {};
		scene.setBlockHandler( 'b1', blockHandler );

		const result = resolveHandler( 'DIALOG', 'b1', scene, global );
		expect( result.sceneHandler ).toBe( blockHandler );
		expect( result.globalHandler ).toBe( noopDialog );
	} );

	it( 'onBlock for a different UUID does not match', () => {
		const global = new HandlerRegistry();
		const scene = new SceneHandlerRegistry();
		scene.setBlockHandler( 'b2', noop );

		const result = resolveHandler( 'DIALOG', 'b1', scene, global );
		expect( result.sceneHandler ).toBeNull();
	} );

	it( 'returns null for NOTE type handlers', () => {
		const global = new HandlerRegistry();
		global.dialogHandler = noopDialog;
		const result = resolveHandler( 'NOTE', 'b1', null, global );
		expect( result.globalHandler ).toBeNull();
	} );

	it( 'returns correct handler for each block type', () => {
		const global = new HandlerRegistry();
		global.choiceHandler = () => {};
		global.conditionHandler = () => {};
		global.actionHandler = () => {};

		expect( resolveHandler( 'CHOICE', 'b1', null, global ).globalHandler ).toBe( global.choiceHandler );
		expect( resolveHandler( 'CONDITION', 'b1', null, global ).globalHandler ).toBe( global.conditionHandler );
		expect( resolveHandler( 'ACTION', 'b1', null, global ).globalHandler ).toBe( global.actionHandler );
	} );

} );

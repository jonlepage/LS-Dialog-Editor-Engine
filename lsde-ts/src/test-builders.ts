// LSDE Dialog Engine — payload builders for the test suites
//
// Hand-built payloads, for cases a real export cannot produce on demand: a NOTE wired back on
// itself, a link to a block that is not there, three async branches converging on one wait. The
// conformance suite (`blueprint-loading.test.ts`, `cross-language-runner.test.ts`) runs against
// the files LSDE actually wrote — these builders are for everything else.
//
// They exist so no suite invents its own idea of the format. When the payload contract moves,
// this file moves once and every suite follows.

import type {
	Blueprints, Scene, Block, Link, Option, ConditionCase, ConditionTest,
	ActionCall, Card, DictionaryDefinition, FunctionDefinition, PropertyBag, PropertyValue,
} from './types.js';

/** The header every builder produces, so a scene is always loadable on its own. */
export function blueprint( scenes: Scene[], overrides: Partial<Blueprints> = {} ): Blueprints {
	return {
		format: 'lsde-blueprints',
		version: 1,
		generator: { app: 'LSDE', version: '2.0.3' },
		exportedAt: '2026-09-07T00:00:00.000Z',
		project: 'Test',
		locales: ['en'],
		referenceLocale: 'en',
		dictionaries: [],
		functions: [],
		cards: [],
		scenes,
		...overrides,
	};
}

/** One scene. `start` defaults to the first block, which is what a scene almost always wants. */
export function scene( blocks: Block[], overrides: Partial<Scene> = {} ): Scene {
	return {
		scene: 's1',
		id: 'sc_test0001',
		start: blocks[0]?.id,
		blocks,
		...overrides,
	};
}

/** A whole payload holding one scene. The shortest thing `init()` accepts. */
export function oneScene( blocks: Block[], sceneOverrides: Partial<Scene> = {} ): Blueprints {
	return blueprint( [scene( blocks, sceneOverrides )] );
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export interface BlockOptions {
	/** Outgoing wires. */
	next?: Link[];
	/**
	 * The whole `props` bag: natives and the designer's own properties together, by bare id.
	 *
	 * Wider than {@link PropertyBag} on purpose: `waitForBlocks` holds a LIST of block ids, and
	 * the generated `PropertyValue` only admits `boolean | number | string` — a real export
	 * carries the list anyway (`DIALOG-008` in the reference scene does).
	 */
	props?: Record<string, PropertyValue | string[]>;
	/** Card ids of the cast. */
	actors?: string[];
	/** Card id of the block's emotion — the tone of the line, not of a speaker. */
	emotion?: string;
	intensity?: number;
	/** Inline text by locale. Absent in the separate-text export mode. */
	text?: Record<string, string>;
	label?: string;
	note?: string;
}

function base( id: string, type: string, opts: BlockOptions ): Block {
	return {
		id,
		key: `__blueprints__.s1.${ id }`,
		type,
		...opts,
	} as Block;
}

export function dialog( id: string, opts: BlockOptions = {} ): Block {
	return base( id, 'dialog', opts );
}

export function choice( id: string, options: Option[], opts: BlockOptions = {} ): Block {
	return { ...base( id, 'choice', opts ), options } as Block;
}

export function condition( id: string, cases: ConditionCase[], opts: BlockOptions = {} ): Block {
	return { ...base( id, 'condition', opts ), cases } as Block;
}

export function action( id: string, calls: ActionCall[] = [], opts: BlockOptions = {} ): Block {
	return { ...base( id, 'action', opts ), calls } as Block;
}

export function note( id: string, opts: BlockOptions = {} ): Block {
	return base( id, 'note', opts );
}

// ─── Wires ───────────────────────────────────────────────────────────────────

/** A wire on a port. `out` for a dialog, `then`/`catch` for an action, `C1`/`K1`… otherwise. */
export function link( to: string, port = 'out' ): Link {
	return { port, to, toPort: 'in' };
}

/** Several wires on the same port — the fork case. */
export function links( port: string, ...targets: string[] ): Link[] {
	return targets.map( to => ( { port, to, toPort: 'in' } ) );
}

// ─── Options, cases, tests ───────────────────────────────────────────────────

export function option( id: string, opts: { text?: string; when?: ConditionTest[] } = {} ): Option {
	return {
		id,
		key: `__blueprints__.s1.CHOICE-001.${ id }`,
		...( opts.text ? { text: { en: opts.text } } : {} ),
		...( opts.when ? { when: opts.when } : {} ),
	};
}

/** A case. No `when` means always true — which is how "always" is written in v2. */
export function whenCase( port: string, when?: ConditionTest[] ): ConditionCase {
	return when ? { port, when } : { port };
}

export function test(
	dict: string,
	entry: string,
	value: boolean | number | string,
	op: string = 'equals',
	join?: 'and' | 'or',
): ConditionTest {
	return { dict, entry, op, value, ...( join ? { join } : {} ) } as ConditionTest;
}

/** A test on the reserved `choice` dictionary: did the player pick `optionId` at `blockId`? */
export function choiceTest( blockId: string, optionId: string, op: string = 'equals' ): ConditionTest {
	return { dict: 'choice', entry: blockId, op, value: optionId } as ConditionTest;
}

// ─── Header tables ───────────────────────────────────────────────────────────

export function card( id: string, name: string, role = 'characters' ): Card {
	return { id, name, role } as Card;
}

export function dictionary( id: string, entries: string[], valueType = 'boolean' ): DictionaryDefinition {
	return { id, valueType, entries } as DictionaryDefinition;
}

export function fn( id: string, params: string[] = [] ): FunctionDefinition {
	return { id, params: params.map( name => ( { name, type: 'string' } ) ) } as FunctionDefinition;
}

export function call( fnId: string, args: PropertyBag = {} ): ActionCall {
	return { fn: fnId, args };
}

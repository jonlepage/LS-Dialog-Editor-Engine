// LSDE Dialog Engine — Public utilities for game developers
//
// Static helpers, never hooks. Nothing here is called by the engine: a game calls them, with data
// it already has. That distinction is the whole point of the file — the engine reads STRUCTURE and
// never the content of a text, so anything to do with reading a line lives out here.
//
// Which is also why an `onResolveText` callback does not exist and will not. A callback is how the
// engine ASKS for something it needs; it never needs a line. It does not display it, measure it or
// validate it. The handler already has the block — it looks its text up wherever it keeps it.

import type { Block, ConditionTest, TextByLocale, PropertyBag, NativeProperties } from './types.js';
import { NATIVE_PROPERTY_IDS, Ports } from './types.js';
import {
	isDialogBlock, isChoiceBlock, isConditionBlock, isRouterBlock, isActionBlock, isNoteBlock,
} from './utils.js';
import {
	evaluateConditionChain, evaluateConditionCases, evaluateEachCase, pickRouterPorts,
	tagOptionVisibility, isChoiceTest,
} from './condition-evaluator.js';

/**
 * The shape of a `localization/<locale>/__blueprints__.json` file: scene → block, and
 * scene → block → option for a choice.
 *
 * This is what an export writes when "Write texts separately" is on — which is the mode most
 * integrations want. Keeping every locale inline forces a game to load twenty languages to play
 * one; the split lets it load only the one the player picked, and lets writing and translation
 * move at their own pace.
 */
export type LocaleTable = Record<string, Record<string, string | Record<string, string>>>;

/** Public utility class exposing common helpers for game developers integrating the LSDE engine. */
export class LsdeUtils {

	/** Current locale set by `engine.setLocale()`. Used as the default by the text helpers. */
	static locale: string | null = null;

	// ─── Type Guards ─────────────────────────────────────────────────────────────

	/** Returns `true` if the block is a dialog. */
	static isDialogBlock = isDialogBlock;
	/** Returns `true` if the block is a choice. */
	static isChoiceBlock = isChoiceBlock;
	/** Returns `true` if the block is a condition. */
	static isConditionBlock = isConditionBlock;
	/** Returns `true` if the block is a router. */
	static isRouterBlock = isRouterBlock;
	/** Returns `true` if the block is an action. */
	static isActionBlock = isActionBlock;
	/** Returns `true` if the block is a note. */
	static isNoteBlock = isNoteBlock;

	// ─── Display Helpers ─────────────────────────────────────────────────────────

	/**
	 * How to name a block on screen or in a log.
	 *
	 * There is no mandatory block name in v2, and none is needed: `DIALOG-007` already reads
	 * better than the uuid it replaced. A designer note says far more than a three-word label
	 * would, so it comes next; a `label` wins when an export carries one.
	 */
	static getBlockLabel( block: Block ): string {
		return block.label ?? block.note ?? block.id;
	}

	/**
	 * Pick a locale out of an inline `text` map — `block.text`, or an option's.
	 *
	 * Only works when texts were exported INSIDE the payload. With the separate mode, the blocks
	 * carry no `text` at all and {@link getTextFromTable} is the one to use.
	 *
	 * @throws when no locale is set, by parameter or by `engine.setLocale()`.
	 */
	static getLocalizedText( text: TextByLocale | undefined, locale?: string ): string | undefined {
		return text?.[LsdeUtils.requireLocale( locale )];
	}

	/**
	 * Read a line out of a loaded `localization/<locale>/__blueprints__.json`, for the separate
	 * text mode.
	 *
	 * The game loads the file — the engine does no IO, ever. Pass the block's scene and id, plus
	 * an option id for one answer of a choice.
	 *
	 * ```ts
	 * const fr = JSON.parse( await readFile( 'localization/fr/__blueprints__.json', 'utf-8' ) );
	 * LsdeUtils.getTextFromTable( fr, 'reactor_breach', 'DIALOG-001' );
	 * LsdeUtils.getTextFromTable( fr, 'reactor_breach', 'CHOICE-001', 'C1' );
	 * ```
	 */
	static getTextFromTable(
		table: LocaleTable | undefined,
		scene: string,
		blockId: string,
		optionId?: string,
	): string | undefined {
		const entry = table?.[scene]?.[blockId];
		if ( entry === undefined ) return undefined;

		if ( typeof entry === 'string' ) {
			// A plain line. Asking for an option of a block that has none is a miss, not that line.
			return optionId === undefined ? entry : undefined;
		}

		return optionId === undefined ? undefined : entry[optionId];
	}

	/**
	 * The i18n key of a block, or of one option of a choice.
	 *
	 * The key is already in the payload (`block.key`), so this only builds the option variant —
	 * useful for a voice file, whose name is derived from the key.
	 */
	static getTextKey( block: Block, optionId?: string ): string {
		return optionId === undefined ? block.key : `${ block.key }.${ optionId }`;
	}

	// ─── Properties ──────────────────────────────────────────────────────────────

	/**
	 * The properties the ENGINE acts on, pulled out of a block's `props`.
	 *
	 * v2 puts natives and the designer's own properties in one bag, keyed by bare id, and ids
	 * cannot collide — LSDE refuses a project property that takes a native name. So this is a
	 * lookup against {@link NATIVE_PROPERTY_IDS}, not a guess.
	 *
	 * **`delay` and `timeout` are MILLISECONDS.** They were seconds in v1 and nothing reports the
	 * change at runtime: a migrated project turns a 3-second pause into 3 ms.
	 */
	static getNativeProperties( block: Block ): NativeProperties {
		const props = block.props;
		if ( !props ) return {};

		const natives: Record<string, unknown> = {};
		for ( const id of NATIVE_PROPERTY_IDS ) {
			if ( id in props ) natives[id] = props[id];
		}
		return natives as NativeProperties;
	}

	/**
	 * The properties the DESIGNER declared, with the natives taken out — everything the game is
	 * free to give its own meaning to.
	 */
	static getCustomProperties( block: Block ): PropertyBag {
		const props = block.props;
		if ( !props ) return {};

		const natives = new Set<string>( NATIVE_PROPERTY_IDS );
		const custom: PropertyBag = {};
		for ( const key of Object.keys( props ) ) {
			if ( !natives.has( key ) ) custom[key] = props[key]!;
		}
		return custom;
	}

	// ─── Condition Helpers ───────────────────────────────────────────────────────

	/**
	 * Does this test read a past answer of the player rather than game state?
	 *
	 * `choice` is a reserved dictionary id that no project dictionary may take: `entry` is a CHOICE
	 * block id of this scene, `value` an option id of that block. The engine answers these from
	 * its own history, so a game never has to remember what it already told the engine.
	 */
	static isChoiceCondition = isChoiceTest;

	/** The CHOICE block a `choice:` test reads, or `undefined` for any other test. */
	static getChoiceConditionBlockId( test: ConditionTest ): string | undefined {
		return test.dict === Ports.Choice ? test.entry : undefined;
	}

	/**
	 * Evaluate a chain of tests left to right, with NO operator precedence. Absent or empty
	 * means true — which is how "always" is written in v2.
	 */
	static evaluateConditionChain = evaluateConditionChain;

	/**
	 * The exit port of a condition block: `out`/`default` in if mode, `K1`… with `portPerCase`.
	 * Replaces the v1 `evaluateConditionGroups`, which returned an index and had a third,
	 * dispatcher mode that no longer exists.
	 */
	static evaluateConditionCases = evaluateConditionCases;

	/** Each case on its own, in order — to show what matched without changing where the flow goes. */
	static evaluateEachCase = evaluateEachCase;

	/**
	 * The exits of a ROUTER, from case results already computed: the port of every true case, then
	 * `then` when they all held or `catch` when one did not — always last. The router's reading of
	 * the same `cases` a condition carries.
	 */
	static pickRouterPorts = pickRouterPorts;

	/**
	 * Tag every option of a choice with whether its `when` holds, returning them ALL.
	 * Replaces the v1 `filterVisibleChoices`, which shortened the list and took away the ability
	 * to show a locked answer.
	 */
	static tagOptionVisibility = tagOptionVisibility;

	// ─── Internal ────────────────────────────────────────────────────────────────

	private static requireLocale( locale?: string ): string {
		const resolved = locale ?? LsdeUtils.locale;
		if ( !resolved ) {
			throw new Error( 'No locale set. Call engine.setLocale() first or pass a locale parameter.' );
		}
		return resolved;
	}
}

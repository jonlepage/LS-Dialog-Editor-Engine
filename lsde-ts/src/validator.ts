// LSDE Dialog Engine — Init validation + diagnostic report
//
// The first thing this file does is refuse a payload it cannot read.
//
// It did not, before. The engine opened whatever it was handed and went straight to work, so a
// file written by a different exporter version produced no error at all — it produced a scene that
// stopped in the middle, silently, at the point where the flow needed a field that was not there.
// That is the worst failure a loader can have: the game ships, and the dialogue just ends early.
//
// So `format` and `version` are read before anything else, and a mismatch is fatal and named.

import type {
	InitOptions, DiagnosticReport, DiagnosticEntry, DiagnosticStats,
	Blueprints, Scene, Block, ActionCall, ConditionTest, FunctionDefinition,
} from './types.js';
import { BlockType, Ports, ValueType } from './types.js';

/** The only payload this engine reads. A file that says anything else is refused outright. */
const SUPPORTED_FORMAT = 'lsde-blueprints';

/** The format version this engine reads. Bumps only when the payload contract itself changes. */
const SUPPORTED_VERSION = 1;

/**
 * Fold the files of a per-scene export into one payload.
 *
 * Each file carries the whole header, so the first one supplies it and the rest only add scenes.
 * `project` and `exportedAt` are checked first: they are identical across the files of one export
 * and different across two, which is the only way to catch someone passing pieces of two exports.
 * Merging those would produce a payload whose dictionaries do not match its scenes, and nothing
 * downstream would notice.
 *
 * Returns the merged payload, or a diagnostic when the files do not belong together.
 */
export function mergePayloads(
	payloads: Blueprints[],
): { data?: Blueprints; error?: DiagnosticEntry } {
	const first = payloads[0]!;

	for ( let i = 1; i < payloads.length; i++ ) {
		const next = payloads[i]!;
		if ( next.project !== first.project || next.exportedAt !== first.exportedAt ) {
			return {
				error: {
					code: 'MISMATCHED_EXPORTS',
					message: `These files are not from the same export: "${ first.project }" `
						+ `(${ first.exportedAt }) and "${ next.project }" (${ next.exportedAt }). `
						+ `Pass the files of one export at a time.`,
				},
			};
		}
	}

	return { data: { ...first, scenes: payloads.flatMap( p => p.scenes ?? [] ) } };
}

/**
 * Did the exporter write this file in another naming convention?
 *
 * LSDE can write `camelCase` (its default), `snake_case` or `PascalCase`, and the choice RENAMES
 * the fields of the JSON. The engine reads camelCase only, so the point of this check is to say
 * which setting to change instead of leaving the reader with "not an LSDE blueprint" on a file
 * that plainly is one.
 *
 * `format` and `version` are single words and survive every convention, so the tell is a field
 * that is not: `exportedAt`.
 *
 * Only this runtime and the GDScript one can answer it: both are handed the raw payload, keys and
 * all. C# and C++ validate a typed object the game already deserialized — the original key names
 * are gone by then — so they report `INVALID_FORMAT` for the same file. The payload is refused
 * either way; only the message differs.
 */
function detectNamingConvention( raw: Record<string, unknown> ): string | undefined {
	if ( 'exported_at' in raw ) return 'snake_case';
	if ( 'ExportedAt' in raw ) return 'PascalCase';
	return undefined;
}

/**
 * What the header of the export declares, looked up by id — for the checks that read what the
 * blocks USE.
 */
interface Declared {
	functions: Map<string, FunctionDefinition>;
	/** Dictionary id → its entry keys. */
	dictionaries: Map<string, Set<string>>;
}

function declaredBy( payload: Blueprints ): Declared {
	return {
		functions: new Map( ( payload.functions ?? [] ).map( fn => [fn.id, fn] ) ),
		dictionaries: new Map( ( payload.dictionaries ?? [] ).map( dict => [dict.id, new Set( dict.entries ?? [] )] ) ),
	};
}

/**
 * Validate a blueprint payload, and optionally cross-check it against what the game declares.
 *
 * Structural checks: the format header, scene paths, block id uniqueness **within a scene**,
 * the entry block, link targets, and the blocks a `waitForBlocks` names. Always, too: what the
 * blocks USE — the functions and arguments an action calls, the dictionaries and entries a
 * condition tests — against what the export declares. With `check`, also warns about functions,
 * dictionaries and cards the game does not know.
 *
 * @returns a {@link DiagnosticReport}. Errors mean the payload will not play correctly;
 *          warnings mean it will, but something looks wrong.
 */
export function validateBlueprint( options: InitOptions ): DiagnosticReport {
	const errors: DiagnosticEntry[] = [];
	const warnings: DiagnosticEntry[] = [];
	const { data, check } = options;

	const empty: DiagnosticStats = { sceneCount: 0, blockCount: 0, connectionCount: 0 };

	// ─── The header, before anything else ────────────────────────────────

	if ( !data || ( Array.isArray( data ) && data.length === 0 ) ) {
		errors.push( { code: 'MISSING_DATA', message: 'Blueprint data is required.' } );
		return { errors, warnings, stats: empty };
	}

	// A per-scene export arrives as several self-contained files. Fold them before validating,
	// so everything below sees one payload and no rule has to know about split modes.
	let payload: Blueprints;
	if ( Array.isArray( data ) ) {
		const merged = mergePayloads( data );
		if ( merged.error ) {
			errors.push( merged.error );
			return { errors, warnings, stats: empty };
		}
		payload = merged.data!;
	} else {
		payload = data;
	}

	if ( payload.format !== SUPPORTED_FORMAT ) {
		const convention = detectNamingConvention( payload as unknown as Record<string, unknown> );
		errors.push( convention
			? {
				code: 'WRONG_NAMING_CONVENTION',
				message: `This file is exported in ${ convention }; the engine reads camelCase — `
					+ `Project settings › Exporters › Naming convention.`,
			}
			: {
				code: 'INVALID_FORMAT',
				message: `Not an LSDE blueprint: expected format "${ SUPPORTED_FORMAT }", got ${ describe( payload.format ) }.`,
			} );
		return { errors, warnings, stats: empty };
	}

	if ( payload.version !== SUPPORTED_VERSION ) {
		errors.push( {
			code: 'UNSUPPORTED_FORMAT_VERSION',
			message: `This engine reads blueprint format version ${ SUPPORTED_VERSION }, `
				+ `the file is version ${ describe( payload.version ) }. `
				+ `Re-export from LSDE, or install the engine version that matches it.`,
		} );
		return { errors, warnings, stats: empty };
	}

	// ─── Scenes ──────────────────────────────────────────────────────────

	if ( !payload.scenes || payload.scenes.length === 0 ) {
		errors.push( { code: 'NO_SCENES', message: 'Blueprint must contain at least one scene.' } );
		return { errors, warnings, stats: empty };
	}

	const declared = declaredBy( payload );
	const scenePaths = new Set<string>();
	/** Stable id → the path of the first scene that carried it. */
	const sceneIds = new Map<string, string>();
	let totalBlocks = 0;
	let totalConnections = 0;

	for ( const scene of payload.scenes ) {
		if ( scenePaths.has( scene.scene ) ) {
			errors.push( {
				code: 'DUPLICATE_SCENE',
				message: `Scene "${ scene.scene }" appears more than once. `
					+ `When loading a per-scene export, pass each file exactly once.`,
				sceneId: scene.id,
				scenePath: scene.scene,
			} );
		} else if ( scene.id && sceneIds.has( scene.id ) ) {
			// Two paths, one stable id: a scene file copied and renamed by hand. It used to load, and a
			// lookup by that id opened whichever of the two came last, without a word. The same scene
			// passed twice repeats its path as well, and is reported once, just above.
			errors.push( {
				code: 'DUPLICATE_SCENE',
				message: `Scenes "${ sceneIds.get( scene.id ) }" and "${ scene.scene }" share the stable id `
					+ `"${ scene.id }", so a lookup by that id cannot tell them apart.`,
				sceneId: scene.id,
				scenePath: scene.scene,
			} );
		}
		scenePaths.add( scene.scene );
		if ( scene.id && !sceneIds.has( scene.id ) ) sceneIds.set( scene.id, scene.scene );

		validateScene( scene, declared, errors, warnings );

		const blocks = blocksOf( scene );
		totalBlocks += blocks.length;
		for ( const block of blocks ) {
			totalConnections += block.next?.length ?? 0;
		}
	}

	// ─── Cross-validation (optional) ─────────────────────────────────────

	if ( check ) {
		crossValidate( payload, check, warnings );
	}

	const stats: DiagnosticStats = {
		sceneCount: payload.scenes.length,
		blockCount: totalBlocks,
		connectionCount: totalConnections,
	};

	return { errors, warnings, stats };
}

/** A scene's blocks, or an empty list when the payload does not carry any. */
function blocksOf( scene: Scene ): Block[] {
	return Array.isArray( scene.blocks ) ? scene.blocks : [];
}

function validateScene(
	scene: Scene,
	declared: Declared,
	errors: DiagnosticEntry[],
	warnings: DiagnosticEntry[],
): void {
	if ( !scene.scene ) {
		// Named by its id: without a path, that is the one name left to find the scene by.
		errors.push( { code: 'MISSING_SCENE_PATH', message: 'Scene is missing its path.', sceneId: scene.id } );
	}

	// A truncated file, or one written by hand, can carry a scene with no `blocks` at all, and
	// iterating it threw a TypeError straight out of `init()` — from the one function whose whole
	// job is to REFUSE a payload the engine cannot read and say why.
	//
	// Normalised rather than reported, because "absent" and "empty" cannot be told apart in every
	// runtime: a C# List has an initializer and a C++ std::vector always exists. A scene with no
	// blocks already reports NO_START_BLOCK — it cannot play, which is the thing worth saying, and
	// all four runtimes say it the same way.
	const blocks = blocksOf( scene );

	// A block id is unique inside its scene and nowhere else: the counter restarts at 1 in every
	// scene, so DIALOG-001 in two scenes is not a collision, it is the normal case.
	const blockIds = new Set<string>();
	const blocksById = new Map<string, Block>();

	for ( const block of blocks ) {
		if ( blockIds.has( block.id ) ) {
			errors.push( {
				code: 'DUPLICATE_BLOCK_ID',
				message: `Duplicate block id "${ block.id }" within scene "${ scene.scene }".`,
				sceneId: scene.id,
				scenePath: scene.scene,
				blockId: block.id,
			} );
		}
		blockIds.add( block.id );
		blocksById.set( block.id, block );
	}

	// The scene names its own entry, so there is no such thing as two start blocks.
	if ( !scene.start ) {
		warnings.push( {
			code: 'NO_START_BLOCK',
			message: `Scene "${ scene.scene }" has no start block and cannot play.`,
			sceneId: scene.id,
			scenePath: scene.scene,
		} );
	} else if ( !blockIds.has( scene.start ) ) {
		errors.push( {
			code: 'INVALID_START_BLOCK',
			message: `Scene "${ scene.scene }" starts on "${ scene.start }", which is not a block of this scene.`,
			sceneId: scene.id,
			scenePath: scene.scene,
			blockId: scene.start,
		} );
	}

	for ( const block of blocks ) {
		validateLinks( scene, block, blockIds, errors );
		validateWaits( scene, block, blockIds, warnings );
		validateUsage( scene, block, blocksById, declared, warnings );
	}
}

/**
 * `waitForBlocks` names blocks OF THIS SCENE that must have FINISHED before this one is dispatched.
 *
 * A name that is not in the scene can never finish, so the block parks for good. It used to hold the
 * scene open with no `onSceneExit`; the engine now closes it as `deadlocked` — either way the dialogue
 * stops there, and nothing on screen says why, which is why it is said here. A warning, not an error:
 * the rest of the scene still plays.
 */
function validateWaits(
	scene: Scene,
	block: Block,
	blockIds: Set<string>,
	warnings: DiagnosticEntry[],
): void {
	const waits = block.props?.waitForBlocks;
	if ( !Array.isArray( waits ) ) return;

	for ( const id of waits ) {
		if ( typeof id === 'string' && !blockIds.has( id ) ) {
			warnings.push( {
				code: 'UNKNOWN_WAIT_BLOCK',
				message: `${ describeBlock( block ) } waits for "${ id }", which is not a block of `
					+ `scene "${ scene.scene }". It can never be visited, so this block never advances.`,
				sceneId: scene.id,
				scenePath: scene.scene,
				blockId: block.id,
			} );
		}
	}
}

// ─── What the blocks use ─────────────────────────────────────────────────────

/**
 * What a block USES must be what the export DECLARES.
 *
 * An export carries two kinds of facts: the tables its header declares, and what its blocks use.
 * `check` compares the first kind against the game; nothing read the second. So an action calling a
 * function the export does not declare — a v1 id left behind in the project — loaded without a
 * word, and failed in game, far from the cause.
 *
 * Always on, no `check` needed: the export contradicts ITSELF, whatever the game knows. Warnings,
 * not errors — the scene still plays; only the call or the test that names nothing goes wrong. The
 * codes say UNDECLARED where the existing ones say UNKNOWN: those mean "the game does not know it".
 *
 * Two things are left alone on purpose. A declared parameter with no argument: the format does not
 * say which parameters are optional. And the TYPE of a value: a number written `3` or `3.0`, a
 * boolean written as a string by hand, would make the warning noisier than the defect it catches.
 */
function validateUsage(
	scene: Scene,
	block: Block,
	blocksById: Map<string, Block>,
	declared: Declared,
	warnings: DiagnosticEntry[],
): void {
	for ( const call of block.calls ?? [] ) {
		validateCall( scene, block, call, declared, warnings );
	}
	for ( const test of testsOf( block ) ) {
		validateTest( scene, block, test, blocksById, declared, warnings );
	}
}

/** Every condition test a block carries: the cases of a condition or a router, and the options of a choice. */
function testsOf( block: Block ): ConditionTest[] {
	const tests: ConditionTest[] = [];
	for ( const conditionCase of block.cases ?? [] ) tests.push( ...( conditionCase.when ?? [] ) );
	for ( const option of block.options ?? [] ) tests.push( ...( option.when ?? [] ) );
	return tests;
}

function validateCall(
	scene: Scene,
	block: Block,
	call: ActionCall,
	declared: Declared,
	warnings: DiagnosticEntry[],
): void {
	const where = `${ describeBlock( block ) } in scene "${ scene.scene }"`;
	const at = { sceneId: scene.id, scenePath: scene.scene, blockId: block.id };

	// The contract allows it — "not picked yet" — but the game is then handed a call it cannot run.
	if ( !call.fn ) {
		warnings.push( { code: 'EMPTY_FUNCTION', message: `${ where } has a call with no function picked.`, ...at } );
		return;
	}

	const fn = declared.functions.get( call.fn );
	if ( !fn ) {
		warnings.push( {
			code: 'UNDECLARED_FUNCTION',
			message: `${ where } calls "${ call.fn }", which the export does not declare in its functions.`,
			...at,
		} );
		// Nothing more to say about its arguments: nobody knows what they should be.
		return;
	}

	const params = new Map( ( fn.params ?? [] ).map( param => [param.name, param] ) );
	for ( const [name, value] of Object.entries( call.args ?? {} ) ) {
		const param = params.get( name );
		if ( !param ) {
			warnings.push( {
				code: 'UNDECLARED_ARGUMENT',
				message: `${ where } calls "${ fn.id }" with argument "${ name }", which "${ fn.id }" does not declare.`,
				...at,
			} );
			continue;
		}

		if ( param.type !== ValueType.DictionaryKey ) continue;

		const entries = param.dictionary !== undefined ? declared.dictionaries.get( param.dictionary ) : undefined;
		if ( !entries ) {
			warnings.push( {
				code: 'UNDECLARED_DICTIONARY_KEY',
				message: `${ where } passes "${ String( value ) }" as "${ name }" of "${ fn.id }", picked in dictionary `
					+ `"${ param.dictionary ?? '' }", which the export does not declare.`,
				...at,
			} );
		} else if ( !entries.has( String( value ) ) ) {
			warnings.push( {
				code: 'UNDECLARED_DICTIONARY_KEY',
				message: `${ where } passes "${ String( value ) }" as "${ name }" of "${ fn.id }", which is not an entry `
					+ `of dictionary "${ param.dictionary }".`,
				...at,
			} );
		}
	}
}

function validateTest(
	scene: Scene,
	block: Block,
	test: ConditionTest,
	blocksById: Map<string, Block>,
	declared: Declared,
	warnings: DiagnosticEntry[],
): void {
	const where = `${ describeBlock( block ) } in scene "${ scene.scene }"`;
	const at = { sceneId: scene.id, scenePath: scene.scene, blockId: block.id };

	// The reserved `choice` dictionary is not declared anywhere: it reads the answers given IN THIS
	// SCENE, so its entry must be a CHOICE block of this scene and its value one of that block's options.
	if ( test.dict === Ports.Choice ) {
		const target = blocksById.get( test.entry );
		if ( !target || target.type !== BlockType.Choice ) {
			warnings.push( {
				code: 'UNKNOWN_CHOICE_BLOCK',
				message: `${ where } tests the answer given at "${ test.entry }", which is not a CHOICE block of this `
					+ `scene. The engine only remembers the answers given in the scene that is playing.`,
				...at,
			} );
			return;
		}
		if ( !( target.options ?? [] ).some( option => option.id === String( test.value ) ) ) {
			warnings.push( {
				code: 'UNKNOWN_CHOICE_OPTION',
				message: `${ where } tests whether "${ String( test.value ) }" was picked at ${ test.entry }, which has no such option.`,
				...at,
			} );
		}
		return;
	}

	const entries = declared.dictionaries.get( test.dict );
	if ( !entries ) {
		warnings.push( {
			code: 'UNDECLARED_DICTIONARY',
			message: `${ where } tests dictionary "${ test.dict }", which the export does not declare.`,
			...at,
		} );
		return;
	}
	if ( !entries.has( test.entry ) ) {
		warnings.push( {
			code: 'UNDECLARED_ENTRY',
			message: `${ where } tests "${ test.dict }.${ test.entry }", an entry dictionary "${ test.dict }" does not declare.`,
			...at,
		} );
	}
}

function validateLinks(
	scene: Scene,
	block: Block,
	blockIds: Set<string>,
	errors: DiagnosticEntry[],
): void {
	if ( !block.next || block.next.length === 0 ) return;

	// A link's target is relative to the same scene — a wire has never crossed one.
	//
	// Several wires on one port is NOT reported. It used to be, as `MULTIPLE_NON_ASYNC_FORK`:
	// "two non-async targets on one port, mark the secondary ones isAsync". The warning was right
	// about the engine of the day — every wire but the first was detached whatever the designer had
	// ticked — and it asked them to give up what they had drawn. The traversal now walks those
	// wires in turn, which is what the drawing said, so there is nothing left to warn about.
	for ( const link of block.next ) {
		if ( !blockIds.has( link.to ) ) {
			errors.push( {
				code: 'BROKEN_LINK',
				message: `${ describeBlock( block ) } links from port "${ link.port }" to "${ link.to }", `
					+ `which is not a block of scene "${ scene.scene }".`,
				sceneId: scene.id,
				scenePath: scene.scene,
				blockId: block.id,
			} );
		}
	}
}

function crossValidate(
	data: Blueprints,
	check: NonNullable<InitOptions['check']>,
	warnings: DiagnosticEntry[],
): void {

	// Functions
	if ( check.functions && data.functions ) {
		const known = new Set( check.functions );
		for ( const fn of data.functions ) {
			if ( !known.has( fn.id ) ) {
				warnings.push( {
					code: 'UNKNOWN_FUNCTION',
					message: `Blueprint declares function "${ fn.id }" which the game does not implement.`,
				} );
			}
		}
	}

	// Dictionaries
	if ( check.dictionaries && data.dictionaries ) {
		for ( const dict of data.dictionaries ) {
			const knownEntries = check.dictionaries[dict.id];
			if ( !knownEntries ) {
				warnings.push( {
					code: 'UNKNOWN_DICTIONARY',
					message: `Blueprint uses dictionary "${ dict.id }" which the game does not declare.`,
				} );
				continue;
			}
			const knownSet = new Set( knownEntries );
			for ( const entry of dict.entries ?? [] ) {
				if ( !knownSet.has( entry ) ) {
					warnings.push( {
						code: 'UNKNOWN_DICTIONARY_ENTRY',
						message: `Dictionary "${ dict.id }" declares entry "${ entry }" which the game does not know.`,
					} );
				}
			}
		}
	}

	// Cards — matched on the NAME the game gives them, not on the editor id.
	if ( check.cards && data.cards ) {
		const known = new Set( check.cards );
		for ( const card of data.cards ) {
			if ( !known.has( card.name ) ) {
				warnings.push( {
					code: 'UNKNOWN_CARD',
					message: `Blueprint declares card "${ card.name }" (${ card.role }) which the game does not know.`,
				} );
			}
		}
	}
}

// ─── Naming a block in a message ─────────────────────────────────────────────

/**
 * How a block is named in a diagnostic.
 *
 * `DIALOG-007` is already readable on its own — that is what replaced the v1 uuid, and it is why
 * blocks carry no mandatory name. When the designer left a note, it says far more than any label
 * would have, so it is appended. A `label` wins over both when an export happens to carry one.
 */
function describeBlock( block: Block ): string {
	if ( block.label ) return `Block ${ block.id } ("${ block.label }")`;
	if ( block.note ) return `Block ${ block.id } ("${ truncate( block.note, 60 ) }")`;
	return `Block ${ block.id }`;
}

function truncate( text: string, max: number ): string {
	return text.length <= max ? text : `${ text.slice( 0, max - 1 ) }…`;
}

function describe( value: unknown ): string {
	return value === undefined ? 'nothing' : JSON.stringify( value );
}

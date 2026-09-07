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
	Blueprints, Scene, Block,
} from './types.js';

/** The only payload this engine reads. A file that says anything else is refused outright. */
const SUPPORTED_FORMAT = 'lsde-blueprints';

/** The format version this engine reads. Bumps only when the payload contract itself changes. */
const SUPPORTED_VERSION = 1;

/**
 * Validate a blueprint payload, and optionally cross-check it against what the game declares.
 *
 * Structural checks: the format header, scene paths, block id uniqueness **within a scene**,
 * the entry block, link targets, and the fork rule (at most one non-async target per port).
 * With `check`, also warns about functions, dictionaries and cards the game does not know.
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

	if ( !data ) {
		errors.push( { code: 'MISSING_DATA', message: 'Blueprint data is required.' } );
		return { errors, warnings, stats: empty };
	}

	if ( data.format !== SUPPORTED_FORMAT ) {
		errors.push( {
			code: 'INVALID_FORMAT',
			message: `Not an LSDE blueprint: expected format "${ SUPPORTED_FORMAT }", got ${ describe( data.format ) }.`,
		} );
		return { errors, warnings, stats: empty };
	}

	if ( data.version !== SUPPORTED_VERSION ) {
		errors.push( {
			code: 'UNSUPPORTED_FORMAT_VERSION',
			message: `This engine reads blueprint format version ${ SUPPORTED_VERSION }, `
				+ `the file is version ${ describe( data.version ) }. `
				+ `Re-export from LSDE, or install the engine version that matches it.`,
		} );
		return { errors, warnings, stats: empty };
	}

	// ─── Scenes ──────────────────────────────────────────────────────────

	if ( !data.scenes || data.scenes.length === 0 ) {
		errors.push( { code: 'NO_SCENES', message: 'Blueprint must contain at least one scene.' } );
		return { errors, warnings, stats: empty };
	}

	const scenePaths = new Set<string>();
	let totalBlocks = 0;
	let totalConnections = 0;

	for ( const scene of data.scenes ) {
		if ( scenePaths.has( scene.scene ) ) {
			errors.push( {
				code: 'DUPLICATE_SCENE',
				message: `Scene "${ scene.scene }" appears more than once. `
					+ `When loading a per-scene export, pass each file exactly once.`,
				sceneId: scene.scene,
			} );
		}
		scenePaths.add( scene.scene );

		validateScene( scene, errors, warnings );
		totalBlocks += scene.blocks.length;
		for ( const block of scene.blocks ) {
			totalConnections += block.next?.length ?? 0;
		}
	}

	// ─── Cross-validation (optional) ─────────────────────────────────────

	if ( check ) {
		crossValidate( data, check, warnings );
	}

	const stats: DiagnosticStats = {
		sceneCount: data.scenes.length,
		blockCount: totalBlocks,
		connectionCount: totalConnections,
	};

	return { errors, warnings, stats };
}

function validateScene(
	scene: Scene,
	errors: DiagnosticEntry[],
	warnings: DiagnosticEntry[],
): void {
	if ( !scene.scene ) {
		errors.push( { code: 'MISSING_SCENE_PATH', message: 'Scene is missing its path.' } );
	}

	// A block id is unique inside its scene and nowhere else: the counter restarts at 1 in every
	// scene, so DIALOG-001 in two scenes is not a collision, it is the normal case.
	const blockIds = new Set<string>();

	for ( const block of scene.blocks ) {
		if ( blockIds.has( block.id ) ) {
			errors.push( {
				code: 'DUPLICATE_BLOCK_ID',
				message: `Duplicate block id "${ block.id }" within scene "${ scene.scene }".`,
				sceneId: scene.scene,
				blockId: block.id,
			} );
		}
		blockIds.add( block.id );
	}

	// The scene names its own entry, so there is no such thing as two start blocks.
	if ( !scene.start ) {
		warnings.push( {
			code: 'NO_START_BLOCK',
			message: `Scene "${ scene.scene }" has no start block and cannot play.`,
			sceneId: scene.scene,
		} );
	} else if ( !blockIds.has( scene.start ) ) {
		errors.push( {
			code: 'INVALID_START_BLOCK',
			message: `Scene "${ scene.scene }" starts on "${ scene.start }", which is not a block of this scene.`,
			sceneId: scene.scene,
			blockId: scene.start,
		} );
	}

	for ( const block of scene.blocks ) {
		validateLinks( scene, block, blockIds, errors, warnings );
	}
}

function validateLinks(
	scene: Scene,
	block: Block,
	blockIds: Set<string>,
	errors: DiagnosticEntry[],
	warnings: DiagnosticEntry[],
): void {
	if ( !block.next || block.next.length === 0 ) return;

	// A link's target is relative to the same scene — a wire has never crossed one.
	const byPort = new Map<string, string[]>();

	for ( const link of block.next ) {
		if ( !blockIds.has( link.to ) ) {
			errors.push( {
				code: 'BROKEN_LINK',
				message: `${ describeBlock( block ) } links from port "${ link.port }" to "${ link.to }", `
					+ `which is not a block of scene "${ scene.scene }".`,
				sceneId: scene.scene,
				blockId: block.id,
			} );
		}
		const group = byPort.get( link.port );
		if ( group ) { group.push( link.to ); }
		else { byPort.set( link.port, [link.to] ); }
	}

	// One port, several wires: the first non-async target becomes the main flow and the rest run
	// as parallel tracks. Two non-async targets on one port means the second silently never
	// becomes the main track — almost always a wiring mistake rather than an intent.
	const blockById = new Map( scene.blocks.map( b => [b.id, b] ) );
	for ( const [port, targets] of byPort ) {
		if ( targets.length <= 1 ) continue;
		let nonAsyncCount = 0;
		for ( const to of targets ) {
			if ( blockById.get( to )?.props?.isAsync !== true ) nonAsyncCount++;
		}
		if ( nonAsyncCount > 1 ) {
			warnings.push( {
				code: 'MULTIPLE_NON_ASYNC_FORK',
				message: `${ describeBlock( block ) } port "${ port }" has ${ targets.length } outgoing links `
					+ `with ${ nonAsyncCount } non-async targets. Mark the secondary ones isAsync.`,
				sceneId: scene.scene,
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
			for ( const entry of dict.entries ) {
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

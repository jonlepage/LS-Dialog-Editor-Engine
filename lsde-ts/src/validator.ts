// LSDE Dialog Engine — Init validation + diagnostic report
// Implementation: PLAN.md §3.1

import type {
	InitOptions, DiagnosticReport, DiagnosticEntry, DiagnosticStats,
	BlueprintExport, BlueprintScene,
} from './types.js';

/**
 * Validate blueprint data integrity and optionally cross-validate against game capabilities.
 *
 * Checks: scene/block UUID uniqueness, connection integrity, single start block per scene,
 * entryBlockId validity, and fork rules (max 1 non-async target per port).
 * If `check` is provided, also warns about unknown signatures, dictionaries, and characters.
 *
 * @returns DiagnosticReport with errors, warnings, and stats.
 * @see PLAN.md §3.1
 */
export function validateBlueprint( options: InitOptions ): DiagnosticReport {
	const errors: DiagnosticEntry[] = [];
	const warnings: DiagnosticEntry[] = [];
	const { data, check } = options;

	// ─── Structural validation ───────────────────────────────────────────

	if ( !data ) {
		errors.push( { code: 'MISSING_DATA', message: 'Blueprint data is required.' } );
		return { errors, warnings, stats: { sceneCount: 0, blockCount: 0, connectionCount: 0 } };
	}

	if ( !data.version ) {
		errors.push( { code: 'MISSING_VERSION', message: 'Blueprint version is required.' } );
	}

	if ( !data.scenes || data.scenes.length === 0 ) {
		errors.push( { code: 'NO_SCENES', message: 'Blueprint must contain at least one scene.' } );
		return { errors, warnings, stats: { sceneCount: 0, blockCount: 0, connectionCount: 0 } };
	}

	// ─── Per-scene validation ────────────────────────────────────────────

	const globalBlockUuids = new Set<string>();
	let totalBlocks = 0;
	let totalConnections = 0;

	for ( const scene of data.scenes ) {
		validateScene( scene, globalBlockUuids, errors, warnings );
		totalBlocks += scene.blocks.length;
		totalConnections += scene.connections.length;
	}

	// ─── Cross-validation (optional) ────────────────────────────────────

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
	scene: BlueprintScene,
	globalBlockUuids: Set<string>,
	errors: DiagnosticEntry[],
	warnings: DiagnosticEntry[],
): void {
	if ( !scene.uuid ) {
		errors.push( { code: 'MISSING_SCENE_UUID', message: 'Scene is missing a UUID.' } );
	}
	if ( !scene.label ) {
		errors.push( { code: 'MISSING_SCENE_LABEL', message: 'Scene is missing a label.', sceneId: scene.uuid } );
	}

	const sceneBlockUuids = new Set<string>();
	let startBlockCount = 0;

	for ( const block of scene.blocks ) {
		// Duplicate UUID within scene
		if ( sceneBlockUuids.has( block.uuid ) ) {
			errors.push( {
				code: 'DUPLICATE_BLOCK_UUID',
				message: `Duplicate block UUID "${ block.uuid }" within scene "${ scene.label }".`,
				sceneId: scene.uuid,
				blockId: block.uuid,
			} );
		}
		sceneBlockUuids.add( block.uuid );

		// Duplicate UUID across scenes
		if ( globalBlockUuids.has( block.uuid ) ) {
			errors.push( {
				code: 'DUPLICATE_BLOCK_UUID_GLOBAL',
				message: `Block UUID "${ block.uuid }" exists in multiple scenes.`,
				sceneId: scene.uuid,
				blockId: block.uuid,
			} );
		}
		globalBlockUuids.add( block.uuid );

		if ( block.isStartBlock ) {
			startBlockCount++;
		}
	}

	// Multiple start blocks
	if ( startBlockCount > 1 ) {
		errors.push( {
			code: 'MULTIPLE_START_BLOCKS',
			message: `Scene "${ scene.label }" has ${ startBlockCount } start blocks (expected at most 1).`,
			sceneId: scene.uuid,
		} );
	}

	// entryBlockId references a valid block
	if ( scene.entryBlockId && !sceneBlockUuids.has( scene.entryBlockId ) ) {
		errors.push( {
			code: 'INVALID_ENTRY_BLOCK',
			message: `Scene "${ scene.label }" entryBlockId "${ scene.entryBlockId }" does not reference an existing block.`,
			sceneId: scene.uuid,
			blockId: scene.entryBlockId,
		} );
	}

	// Connection integrity
	for ( const conn of scene.connections ) {
		if ( !sceneBlockUuids.has( conn.fromId ) ) {
			errors.push( {
				code: 'BROKEN_CONNECTION_FROM',
				message: `Connection "${ conn.id }" fromId "${ conn.fromId }" references a non-existent block.`,
				sceneId: scene.uuid,
			} );
		}
		if ( !sceneBlockUuids.has( conn.toId ) ) {
			errors.push( {
				code: 'BROKEN_CONNECTION_TO',
				message: `Connection "${ conn.id }" toId "${ conn.toId }" references a non-existent block.`,
				sceneId: scene.uuid,
			} );
		}
	}

	// Fork validation: max 1 non-async target per output port group
	const blockMap = new Map( scene.blocks.map( b => [b.uuid, b] ) );
	const portGroups = new Map<string, string[]>(); // "blockId:portKey" → toId[]
	for ( const conn of scene.connections ) {
		const key = conn.fromPortIndex !== undefined
			? `${ conn.fromId }:idx:${ conn.fromPortIndex }`
			: `${ conn.fromId }:port:${ conn.fromPort }`;
		const group = portGroups.get( key );
		if ( group ) { group.push( conn.toId ); }
		else { portGroups.set( key, [conn.toId] ); }
	}
	for ( const [, targets] of portGroups ) {
		if ( targets.length <= 1 ) continue;
		let nonAsyncCount = 0;
		for ( const toId of targets ) {
			const target = blockMap.get( toId );
			if ( target && !target.nativeProperties?.isAsync ) {
				nonAsyncCount++;
			}
		}
		if ( nonAsyncCount > 1 ) {
			warnings.push( {
				code: 'MULTIPLE_NON_ASYNC_FORK',
				message: `A port has ${ targets.length } outgoing connections with ${ nonAsyncCount } non-async targets. Mark secondary targets as isAsync.`,
				sceneId: scene.uuid,
			} );
		}
	}
}

function crossValidate(
	data: BlueprintExport,
	check: NonNullable<InitOptions['check']>,
	warnings: DiagnosticEntry[],
): void {

	// Signatures
	if ( check.signatures && data.signatures ) {
		const gameSignatures = new Set( check.signatures );
		for ( const sig of data.signatures ) {
			if ( !gameSignatures.has( sig.id ) ) {
				warnings.push( {
					code: 'UNKNOWN_SIGNATURE',
					message: `Blueprint uses signature "${ sig.id }" which is not declared in the game.`,
				} );
			}
		}
	}

	// Dictionaries
	if ( check.dictionaries && data.dictionaries ) {
		for ( const dict of data.dictionaries ) {
			const label = dict.label ?? dict.uuid;
			const gameKeys = check.dictionaries[label];
			if ( !gameKeys ) {
				warnings.push( {
					code: 'UNKNOWN_DICTIONARY_GROUP',
					message: `Blueprint uses dictionary group "${ label }" which is not declared in the game.`,
				} );
				continue;
			}
			const gameKeySet = new Set( gameKeys );
			for ( const row of dict.rows ) {
				if ( !gameKeySet.has( row.key ) ) {
					warnings.push( {
						code: 'UNKNOWN_DICTIONARY_KEY',
						message: `Dictionary group "${ label }" uses key "${ row.key }" not declared in the game.`,
					} );
				}
			}
		}
	}

	// Characters
	if ( check.characters ) {
		const gameCharacters = new Set( check.characters );
		const blueprintCharacters = new Set<string>();
		for ( const scene of data.scenes ) {
			for ( const block of scene.blocks ) {
				if ( block.metadata?.characters ) {
					for ( const char of block.metadata.characters ) {
						blueprintCharacters.add( char.name );
					}
				}
			}
		}
		for ( const name of blueprintCharacters ) {
			if ( !gameCharacters.has( name ) ) {
				warnings.push( {
					code: 'UNKNOWN_CHARACTER',
					message: `Blueprint uses character "${ name }" which is not declared in the game.`,
				} );
			}
		}
	}
}

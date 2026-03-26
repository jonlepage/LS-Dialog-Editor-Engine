// LSDE Dialog Engine — Graph indexing and lookups
// Indexes blocks by UUID, connections by blockId.

import type {
	BlueprintBlock, BlueprintConnection, BlueprintScene,
	BlueprintExport, ActionSignature, Dictionary,
} from './types.js';

// ─── SceneGraph ──────────────────────────────────────────────────────────────

/**
 * Indexed representation of a single scene for O(1) block and connection lookups.
 * Built once during `init()`, used throughout traversal.
 */
export class SceneGraph {

	private readonly scene: BlueprintScene;
	private readonly blocksByUuid: Map<string, BlueprintBlock>;
	private readonly connectionsByFromId: Map<string, BlueprintConnection[]>;

	constructor( scene: BlueprintScene ) {
		this.scene = scene;
		this.blocksByUuid = new Map();
		this.connectionsByFromId = new Map();

		for ( const block of scene.blocks ) {
			this.blocksByUuid.set( block.uuid, block );
		}

		for ( const conn of scene.connections ) {
			const existing = this.connectionsByFromId.get( conn.fromId );
			if ( existing ) {
				existing.push( conn );
			} else {
				this.connectionsByFromId.set( conn.fromId, [conn] );
			}
		}
	}

	getBlock( uuid: string ): BlueprintBlock | undefined {
		return this.blocksByUuid.get( uuid );
	}

	getOutgoingConnections( blockUuid: string ): BlueprintConnection[] {
		return this.connectionsByFromId.get( blockUuid ) ?? [];
	}

	/** Find the start block: isStartBlock flag first, then entryBlockId fallback. */
	getStartBlock(): BlueprintBlock | undefined {
		for ( const block of this.scene.blocks ) {
			if ( block.isStartBlock ) return block;
		}
		if ( this.scene.entryBlockId ) {
			return this.blocksByUuid.get( this.scene.entryBlockId );
		}
		return undefined;
	}

	getScene(): BlueprintScene {
		return this.scene;
	}

	getAllBlocks(): BlueprintBlock[] {
		return this.scene.blocks;
	}
}

// ─── BlueprintGraph ──────────────────────────────────────────────────────────

/**
 * Indexed representation of an entire blueprint export.
 * Provides O(1) access to scenes, signatures, and dictionaries.
 */
export class BlueprintGraph {

	private readonly sceneGraphs: Map<string, SceneGraph>;
	private readonly signaturesById: Map<string, ActionSignature>;
	private readonly dictionariesByLabel: Map<string, Dictionary>;
	private readonly _locales: string[];

	constructor( data: BlueprintExport ) {
		this.sceneGraphs = new Map();
		this.signaturesById = new Map();
		this.dictionariesByLabel = new Map();
		this._locales = data.locales ?? [];

		for ( const scene of data.scenes ) {
			this.sceneGraphs.set( scene.uuid, new SceneGraph( scene ) );
		}

		if ( data.signatures ) {
			for ( const sig of data.signatures ) {
				this.signaturesById.set( sig.id, sig );
			}
		}

		if ( data.dictionaries ) {
			for ( const dict of data.dictionaries ) {
				if ( dict.label ) {
					this.dictionariesByLabel.set( dict.label, dict );
				}
			}
		}
	}

	getSceneGraph( sceneUuid: string ): SceneGraph | undefined {
		return this.sceneGraphs.get( sceneUuid );
	}

	getSignature( actionId: string ): ActionSignature | undefined {
		return this.signaturesById.get( actionId );
	}

	getDictionary( groupLabel: string ): Dictionary | undefined {
		return this.dictionariesByLabel.get( groupLabel );
	}

	getAllSceneIds(): string[] {
		return Array.from( this.sceneGraphs.keys() );
	}

	getSceneConnections( sceneUuid: string ): BlueprintConnection[] {
		const sg = this.sceneGraphs.get( sceneUuid );
		return sg ? sg.getScene().connections : [];
	}

	getLocales(): string[] {
		return this._locales;
	}
}

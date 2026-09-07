// LSDE Dialog Engine — Graph indexing and lookups
//
// Two things changed with the v2 format, and both live here.
//
// **Block ids repeat across scenes.** The counter restarts at 1 in every scene, so DIALOG-001
// legitimately exists in two of them at once. A block is identified by the pair (scene, id) and
// nothing else — which is why every lookup goes through a SceneGraph and there is no global block
// index anywhere in this file.
//
// **Wires are carried by the block they leave.** There is no connection table: a block lists its
// own outgoing links in `next`, and a Link only says where it goes. So an outgoing lookup is a
// field read rather than a map hit, and anything that needs both ends of a wire gets it flattened
// into a BlueprintConnection.

import type {
	Block, BlueprintConnection, Scene, Blueprints,
	FunctionDefinition, DictionaryDefinition, Card, Link,
} from './types.js';

// ─── SceneGraph ──────────────────────────────────────────────────────────────

/**
 * Indexed representation of a single scene for O(1) block lookups.
 * Built once during `init()`, used throughout traversal.
 */
export class SceneGraph {

	private readonly scene: Scene;
	private readonly blocksById: Map<string, Block>;

	constructor( scene: Scene ) {
		this.scene = scene;
		this.blocksById = new Map();

		for ( const block of scene.blocks ) {
			this.blocksById.set( block.id, block );
		}
	}

	/** A block by its id, which is unique WITHIN this scene only. */
	getBlock( id: string ): Block | undefined {
		return this.blocksById.get( id );
	}

	/**
	 * The wires leaving a block, in the order the file lists them.
	 *
	 * Returned as-is: a {@link Link} knows its port and its target, and the caller already knows
	 * which block it asked about. Use {@link getConnections} when the source id has to travel with
	 * the wire.
	 */
	getOutgoingLinks( blockId: string ): Link[] {
		return this.blocksById.get( blockId )?.next ?? [];
	}

	/**
	 * Every wire of the scene, flattened so each one carries the block it leaves.
	 *
	 * Graph inspection only — a debug tool that wants to see how a scene is wired without playing
	 * it. Traversal never needs this: it walks from a block, so it uses {@link getOutgoingLinks}.
	 */
	getConnections(): BlueprintConnection[] {
		const out: BlueprintConnection[] = [];
		for ( const block of this.scene.blocks ) {
			if ( !block.next ) continue;
			for ( const link of block.next ) {
				out.push( { from: block.id, port: link.port, to: link.to, toPort: link.toPort } );
			}
		}
		return out;
	}

	/**
	 * The block the scene starts on, named by `scene.start`.
	 *
	 * There is no per-block start flag in v2 — the scene names its entry, so a scene cannot
	 * declare two of them. `undefined` means the scene has no entry and cannot play.
	 */
	getStartBlock(): Block | undefined {
		return this.scene.start ? this.blocksById.get( this.scene.start ) : undefined;
	}

	getScene(): Scene {
		return this.scene;
	}

	getAllBlocks(): Block[] {
		return this.scene.blocks;
	}
}

// ─── BlueprintGraph ──────────────────────────────────────────────────────────

/**
 * Indexed representation of an entire blueprint export.
 * Provides O(1) access to scenes, functions, dictionaries and cards.
 */
export class BlueprintGraph {

	private readonly sceneGraphs: Map<string, SceneGraph>;
	private readonly scenePathById: Map<string, string>;
	private readonly functionsById: Map<string, FunctionDefinition>;
	private readonly dictionariesById: Map<string, DictionaryDefinition>;
	private readonly cardsById: Map<string, Card>;
	private readonly _locales: string[];
	private readonly _referenceLocale: string;

	constructor( data: Blueprints ) {
		this.sceneGraphs = new Map();
		this.scenePathById = new Map();
		this.functionsById = new Map();
		this.dictionariesById = new Map();
		this.cardsById = new Map();
		this._locales = data.locales ?? [];
		this._referenceLocale = data.referenceLocale ?? '';

		for ( const scene of data.scenes ) {
			this.sceneGraphs.set( scene.scene, new SceneGraph( scene ) );
			// A scene answers to its path AND to its rename-proof id. The path is what builds the
			// i18n keys and what a writer reads; the id is what an asset outside the payload must
			// store, because the path changes the day someone renames the scene.
			if ( scene.id ) {
				this.scenePathById.set( scene.id, scene.scene );
			}
		}

		for ( const fn of data.functions ?? [] ) {
			this.functionsById.set( fn.id, fn );
		}

		for ( const dict of data.dictionaries ?? [] ) {
			this.dictionariesById.set( dict.id, dict );
		}

		for ( const card of data.cards ?? [] ) {
			this.cardsById.set( card.id, card );
		}
	}

	/** A scene by its path (`reactor_breach`) or by its stable id (`sc_u0vqg2g8`). */
	getSceneGraph( sceneRef: string ): SceneGraph | undefined {
		const direct = this.sceneGraphs.get( sceneRef );
		if ( direct ) return direct;
		const path = this.scenePathById.get( sceneRef );
		return path ? this.sceneGraphs.get( path ) : undefined;
	}

	/** A declared engine function, as an action call's `fn` names it. */
	getFunction( functionId: string ): FunctionDefinition | undefined {
		return this.functionsById.get( functionId );
	}

	/** A declared dictionary, as a condition test's `dict` cites it. */
	getDictionary( dictionaryId: string ): DictionaryDefinition | undefined {
		return this.dictionariesById.get( dictionaryId );
	}

	/** A card by its editor id (`var1`), the other end of a block's `actors` and `emotion`. */
	getCard( cardId: string ): Card | undefined {
		return this.cardsById.get( cardId );
	}

	/** Every card holding a given role — `cards` mixes characters, emotions, places and none. */
	getCardsByRole( role: string ): Card[] {
		const out: Card[] = [];
		for ( const card of this.cardsById.values() ) {
			if ( card.role === role ) out.push( card );
		}
		return out;
	}

	/** The path of every scene in the export — what `engine.scene()` takes. */
	getAllSceneIds(): string[] {
		return Array.from( this.sceneGraphs.keys() );
	}

	/** Every wire INSIDE a scene, flattened. Inspection only; see {@link SceneGraph.getConnections}. */
	getSceneConnections( sceneRef: string ): BlueprintConnection[] {
		return this.getSceneGraph( sceneRef )?.getConnections() ?? [];
	}

	getLocales(): string[] {
		return this._locales;
	}

	/** The locale written first in the export. Empty when the project declares none. */
	getReferenceLocale(): string {
		return this._referenceLocale;
	}
}

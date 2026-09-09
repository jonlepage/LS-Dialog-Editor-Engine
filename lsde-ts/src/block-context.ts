// LSDE Dialog Engine — Context factory per block type
//
// A context is what a handler is handed alongside its block: the resolved cards, and the few
// methods that let the game answer back. Everything the engine needs to hear from a handler comes
// back through here, which is why each factory keeps its answer in a `_`-prefixed field the
// traversal reads once the handler returns.
//
// Two v1 habits are gone from this file:
//
// **Actors are card ids now.** A block cites `["var1"]`, not a copy of the character. The ids are
// resolved through the export's `cards` table before the context is built, and the WHOLE list is
// handed over — the engine does not elect a first one, because LSDE deliberately refuses to say
// whether the order means "who speaks" or "who is present". That belongs to the game.
//
// **The emotion belongs to the block.** It used to sit on each character, so two actors saying one
// sentence meant writing the same feeling twice, with nothing stopping them from drifting apart.

import type {
	Block, Card, RuntimeChoiceItem, RuntimeConditionCase,
	DialogContext, ChoiceContext, ConditionContext, RouterContext, ActionContext,
} from './types.js';

// ─── Internal extended types (engine-internal state) ─────────────────────────

export interface InternalDialogContext extends DialogContext {
	_globalPrevented: boolean;
	/** The card id whose port to take, or `undefined` for `out`. */
	_actorPort: string | undefined;
}

export interface InternalChoiceContext extends ChoiceContext {
	_globalPrevented: boolean;
	_selectedOptionId: string | undefined;
}

export interface InternalConditionContext extends ConditionContext {
	_globalPrevented: boolean;
	/** The port the handler picked, overriding what the cases said. */
	_conditionPort: string | undefined;
}

export interface InternalRouterContext extends RouterContext {
	_globalPrevented: boolean;
	/** Every port the block leaves by, the continuation last. See `pickRouterPorts`. */
	_routerPorts: string[] | undefined;
}

export interface InternalActionContext extends ActionContext {
	_globalPrevented: boolean;
	_actionRejected: boolean;
}

/** The cards a block cites, already looked up. Built once per block, shared by every context. */
export interface ResolvedCards {
	/** Every card in `block.actors`, in file order. Ids with no card are dropped. */
	actors: Card[];
	/** The card in `block.emotion`, when the writer set one. */
	emotion: Card | undefined;
	/** The one `onResolveCharacter()` picked out of `actors`, when a resolver is installed. */
	character: Card | undefined;
}

/**
 * Look up a block's `actors` and `emotion` in the export's card table.
 *
 * An id with no card is dropped rather than reported: a payload citing a card that is not in its
 * own tables is an exporter bug, and the traversal is not where a game should learn about it —
 * `init()` is.
 */
export function resolveCards(
	block: Block,
	lookup: ( cardId: string ) => Card | undefined,
	pickCharacter: ( ( actors: Card[] ) => Card | undefined ) | undefined,
	designatedActorId?: string,
): ResolvedCards {
	const actors: Card[] = [];
	for ( const id of block.actors ?? [] ) {
		const card = lookup( id );
		if ( card ) actors.push( card );
	}

	const emotion = block.emotion ? lookup( block.emotion ) : undefined;

	// `inPortPerCharacter`: the wire named ONE actor, so that is the only one offered. The game is
	// still asked — it may answer `undefined`, which says the character does not exist — but it
	// cannot pick a different one, and `actors` stays the whole cast either way.
	const offered = designatedActorId !== undefined
		? actors.filter( card => card.id === designatedActorId )
		: actors;
	const character = pickCharacter ? pickCharacter( offered ) : undefined;

	return { actors, emotion, character };
}

// ─── Factories ───────────────────────────────────────────────────────────────

export function createDialogContext( block: Block, cards: ResolvedCards ): InternalDialogContext {
	// The port of an actor IS its card id — `var1`, the same string `block.actors` lists. Only an
	// id the block actually cites can pick a port; anything else falls through to `out`.
	const cited = new Set( block.actors ?? [] );

	const ctx: InternalDialogContext = {
		_globalPrevented: false,
		_actorPort: undefined,
		character: cards.character,
		actors: cards.actors,
		emotion: cards.emotion,
		intensity: block.intensity,
		resolveCharacterPort( cardId: string ) {
			ctx._actorPort = cited.has( cardId ) ? cardId : undefined;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createChoiceContext(
	block: Block,
	cards: ResolvedCards,
	taggedOptions: RuntimeChoiceItem[],
	onChoiceSelected: ( ( blockId: string, optionId: string ) => void ) | undefined,
): InternalChoiceContext {
	const ctx: InternalChoiceContext = {
		_globalPrevented: false,
		_selectedOptionId: undefined,
		character: cards.character,
		actors: cards.actors,
		emotion: cards.emotion,
		intensity: block.intensity,
		options: taggedOptions,
		selectChoice( optionId: string ) {
			ctx._selectedOptionId = optionId;
			// Recorded even for an option that does not exist: the history is what the reserved
			// `choice` dictionary reads back, and silently dropping an answer would make a later
			// condition lie about what the player did.
			if ( onChoiceSelected ) {
				onChoiceSelected( block.id, optionId );
			}
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createConditionContext(
	block: Block,
	cards: ResolvedCards,
	cases: RuntimeConditionCase[],
): InternalConditionContext {
	const ctx: InternalConditionContext = {
		_globalPrevented: false,
		_conditionPort: undefined,
		character: cards.character,
		actors: cards.actors,
		emotion: cards.emotion,
		intensity: block.intensity,
		cases,
		resolve( port: string ) {
			ctx._conditionPort = port;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

/**
 * A ROUTER's context: the same pre-evaluated cases, and nothing to answer with.
 *
 * No `resolve`. By the time a handler could speak, every true case has launched its port and the
 * continuation is picked — there is no single exit left to override. The handler is an observation
 * point, which is why the type requires none at all.
 */
export function createRouterContext(
	block: Block,
	cards: ResolvedCards,
	cases: RuntimeConditionCase[],
): InternalRouterContext {
	const ctx: InternalRouterContext = {
		_globalPrevented: false,
		_routerPorts: undefined,
		character: cards.character,
		actors: cards.actors,
		emotion: cards.emotion,
		intensity: block.intensity,
		cases,
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

export function createActionContext( block: Block, cards: ResolvedCards ): InternalActionContext {
	const ctx: InternalActionContext = {
		_globalPrevented: false,
		_actionRejected: false,
		character: cards.character,
		actors: cards.actors,
		emotion: cards.emotion,
		intensity: block.intensity,
		calls: block.calls ?? [],
		resolve() {
			ctx._actionRejected = false;
		},
		reject() {
			ctx._actionRejected = true;
		},
		preventGlobalHandler() {
			ctx._globalPrevented = true;
		},
	};
	return ctx;
}

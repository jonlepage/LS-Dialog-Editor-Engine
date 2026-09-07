// LSDE Dialog Engine — Context factory per block type (C# port of block-context.ts)
//
// A context is what a handler is handed alongside its block: the resolved cards, and the few
// methods that let the game answer back. Everything the engine needs to hear from a handler comes
// back through here, which is why each context keeps its answer in an internal field the traversal
// reads once the handler returns.
//
// Two v1 habits are gone from this file:
//
// **Actors are card ids now.** A block cites ["var1"], not a copy of the character. The ids are
// resolved through the export's Cards table before the context is built, and the WHOLE list is
// handed over — the engine does not elect a first one, because LSDE deliberately refuses to say
// whether the order means "who speaks" or "who is present". That belongs to the game.
//
// **The emotion belongs to the block.** It used to sit on each character, so two actors saying one
// sentence meant writing the same feeling twice, with nothing stopping them from drifting apart.

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>The cards a block cites, already looked up. Built once per block.</summary>
    public class ResolvedCards
    {
        /// <summary>Every card in Block.Actors, in file order. Ids with no card are dropped.</summary>
        public List<Card> Actors { get; set; } = new List<Card>();

        /// <summary>The card in Block.Emotion, when the writer set one.</summary>
        public Card? Emotion { get; set; }

        /// <summary>The one OnResolveCharacter picked out of Actors, when a resolver is installed.</summary>
        public Card? Character { get; set; }

        /// <summary>
        /// Look up a block's Actors and Emotion in the export's card table.
        /// <para>An id with no card is dropped rather than reported: a payload citing a card that
        /// is not in its own tables is an exporter bug, and the traversal is not where a game
        /// should learn about it — Init() is.</para>
        /// </summary>
        public static ResolvedCards Resolve(
            BlueprintBlock block,
            Func<string, Card?> lookup,
            Func<List<Card>, Card?>? pickCharacter)
        {
            var cards = new ResolvedCards();

            if (block.Actors != null)
            {
                foreach (var id in block.Actors)
                {
                    var card = lookup(id);
                    if (card != null) cards.Actors.Add(card);
                }
            }

            cards.Emotion = string.IsNullOrEmpty(block.Emotion) ? null : lookup(block.Emotion!);
            cards.Character = pickCharacter?.Invoke(cards.Actors);

            return cards;
        }
    }

    // ─── Internal context classes (engine-internal state) ─────────────────────────

    /// <summary>What every context carries, whatever the block type.</summary>
    internal abstract class InternalBlockContext : IBaseBlockContext
    {
        internal bool GlobalPrevented;

        public Card? Character { get; }
        public IReadOnlyList<Card> Actors { get; }
        public Card? Emotion { get; }
        public double? Intensity { get; }

        protected InternalBlockContext(BlueprintBlock block, ResolvedCards cards)
        {
            Character = cards.Character;
            Actors = cards.Actors;
            Emotion = cards.Emotion;
            Intensity = block.Intensity;
        }

        public void PreventGlobalHandler() => GlobalPrevented = true;
    }

    internal class InternalDialogContext : InternalBlockContext, IDialogContext
    {
        /// <summary>The card id whose port to take, or null for Out.</summary>
        internal string? ActorPort;

        private readonly HashSet<string> _cited;

        internal InternalDialogContext(BlueprintBlock block, ResolvedCards cards)
            : base(block, cards)
        {
            // The port of an actor IS its card id — var1, the same string Block.Actors lists. Only
            // an id the block actually cites can pick a port; anything else falls through to Out.
            _cited = new HashSet<string>(block.Actors ?? new List<string>());
        }

        public void ResolveCharacterPort(string cardId)
        {
            ActorPort = _cited.Contains(cardId) ? cardId : null;
        }
    }

    internal class InternalChoiceContext : InternalBlockContext, IChoiceContext
    {
        internal string? SelectedOptionId;

        private readonly string _blockId;
        private readonly Action<string, string>? _onChoiceSelected;

        public IReadOnlyList<RuntimeChoiceItem> Options { get; }

        internal InternalChoiceContext(
            BlueprintBlock block,
            ResolvedCards cards,
            List<RuntimeChoiceItem> taggedOptions,
            Action<string, string>? onChoiceSelected)
            : base(block, cards)
        {
            _blockId = block.Id;
            _onChoiceSelected = onChoiceSelected;
            Options = taggedOptions;
        }

        public void SelectChoice(string optionId)
        {
            SelectedOptionId = optionId;
            // Recorded even for an option that does not exist: the history is what the reserved
            // "choice" dictionary reads back, and silently dropping an answer would make a later
            // condition lie about what the player did.
            _onChoiceSelected?.Invoke(_blockId, optionId);
        }
    }

    internal class InternalConditionContext : InternalBlockContext, IConditionContext
    {
        /// <summary>The port the handler picked, overriding what the cases said.</summary>
        internal string? ConditionPort;

        public IReadOnlyList<RuntimeConditionCase> Cases { get; }

        internal InternalConditionContext(
            BlueprintBlock block,
            ResolvedCards cards,
            List<RuntimeConditionCase> cases)
            : base(block, cards)
        {
            Cases = cases;
        }

        public void Resolve(string port) => ConditionPort = port;
    }

    internal class InternalActionContext : InternalBlockContext, IActionContext
    {
        internal bool ActionRejected;

        public IReadOnlyList<ActionCall> Calls { get; }

        internal InternalActionContext(BlueprintBlock block, ResolvedCards cards)
            : base(block, cards)
        {
            Calls = block.Calls ?? new List<ActionCall>();
        }

        public void Resolve() => ActionRejected = false;

        public void Reject(object? error) => ActionRejected = true;
    }
}

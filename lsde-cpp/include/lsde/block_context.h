// LSDE Dialog Engine — Context factory per block type (C++ port of block-context.ts)
//
// A context is what a handler is handed alongside its block: the resolved cards, and the few
// methods that let the game answer back. Everything the engine needs to hear from a handler comes
// back through here, which is why each context keeps its answer in a public field the traversal
// reads once the handler returns.
//
// Two v1 habits are gone from this file:
//
// **Actors are card ids now.** A block cites ["var1"], not a copy of the character. The ids are
// resolved through the export's cards table before the context is built, and the WHOLE list is
// handed over — the engine does not elect a first one, because LSDE deliberately refuses to say
// whether the order means "who speaks" or "who is present". That belongs to the game.
//
// **The emotion belongs to the block.** It used to sit on each character, so two actors saying one
// sentence meant writing the same feeling twice, with nothing stopping them from drifting apart.

#pragma once

#include <lsde/types.h>

namespace lsde {

/// The cards a block cites, already looked up. Built once per block.
struct ResolvedCards {
    /// Every card in block.actors, in file order. Ids with no card are dropped.
    std::vector<Card> actors;
    /// The card in block.emotion, when the writer set one.
    std::optional<Card> emotion;
    /// The one onResolveCharacter picked out of `actors`, when a resolver is installed.
    std::optional<Card> character;

    /// Look up a block's actors and emotion in the export's card table.
    ///
    /// An id with no card is dropped rather than reported: a payload citing a card that is not in
    /// its own tables is an exporter bug, and the traversal is not where a game should learn about
    /// it — init() is.
    static ResolvedCards resolve(
        const BlueprintBlock& block,
        const std::function<const Card*(const std::string&)>& lookup,
        const std::function<const Card*(const std::vector<Card>&)>& pickCharacter);
};

// ─── Internal context classes ────────────────────────────────────────────────

// Every Internal*Context below sits at the bottom of a deliberate diamond: it inherits the
// implementation from InternalBlockContext and the pure declaration from IDialogContext & co,
// both reaching IBaseBlockContext virtually. Dominance resolves that to the implementation,
// which is exactly the intent — but MSVC announces the resolution once per member per class,
// and those 160 warnings would land in the build of every game that includes this header.
#if defined(_MSC_VER)
#  pragma warning(push)
#  pragma warning(disable : 4250) // inherits via dominance
#endif

/// What every context carries, whatever the block type.
class InternalBlockContext : public virtual IBaseBlockContext {
public:
    /// When true, the global (Tier 1) handler will be skipped.
    bool globalPrevented = false;

    InternalBlockContext(const BlueprintBlock& block, ResolvedCards cards);

    const Card* character() const override;
    const std::vector<Card>& actors() const override;
    const Card* emotion() const override;
    std::optional<double> intensity() const override;
    void preventGlobalHandler() override;

protected:
    ResolvedCards _cards;
    std::optional<double> _intensity;
};

/// Internal context for DIALOG block handlers.
class InternalDialogContext : public InternalBlockContext, public IDialogContext {
public:
    /// The card id whose port to take, or nullopt for `out`.
    std::optional<std::string> actorPort;

    InternalDialogContext(const BlueprintBlock& block, ResolvedCards cards);

    void resolveCharacterPort(const std::string& cardId) override;

private:
    /// Only an id the block actually cites can pick a port; anything else falls through to `out`.
    std::unordered_set<std::string> _cited;
};

/// Internal context for CHOICE block handlers.
class InternalChoiceContext : public InternalBlockContext, public IChoiceContext {
public:
    /// The option id the player picked. It is also the port the flow leaves by.
    std::optional<std::string> selectedOptionId;

    InternalChoiceContext(
        const BlueprintBlock& block,
        ResolvedCards cards,
        std::vector<RuntimeChoiceItem> taggedOptions,
        std::function<void(const std::string&, const std::string&)> onChoiceSelected = {});

    const std::vector<RuntimeChoiceItem>& options() const override;
    void selectChoice(const std::string& optionId) override;

private:
    std::vector<RuntimeChoiceItem> _options;
    std::string _blockId;
    std::function<void(const std::string&, const std::string&)> _onChoiceSelected;
};

/// Internal context for CONDITION block handlers.
class InternalConditionContext : public InternalBlockContext, public IConditionContext {
public:
    /// The exit port. Pre-filled from the cases; a handler may override it with resolve().
    std::optional<std::string> conditionPort;

    InternalConditionContext(
        const BlueprintBlock& block,
        ResolvedCards cards,
        std::vector<RuntimeConditionCase> cases);

    const std::vector<RuntimeConditionCase>& cases() const override;
    void resolve(const std::string& port) override;

private:
    std::vector<RuntimeConditionCase> _cases;
};

/// Internal context for ACTION block handlers.
class InternalActionContext : public InternalBlockContext, public IActionContext {
public:
    /// true if reject() was called, false if resolve() was called.
    bool actionRejected = false;

    InternalActionContext(const BlueprintBlock& block, ResolvedCards cards);

    const std::vector<ActionCall>& calls() const override;
    void resolve() override;
    void reject(const std::string& error) override;

private:
    std::vector<ActionCall> _calls;
};

#if defined(_MSC_VER)
#  pragma warning(pop)
#endif

} // namespace lsde

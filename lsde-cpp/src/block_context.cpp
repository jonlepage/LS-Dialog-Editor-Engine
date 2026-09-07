// LSDE Dialog Engine — Context factory per block type (C++ port of block-context.ts)

#include "lsde/block_context.h"

namespace lsde {

// ─── ResolvedCards ───────────────────────────────────────────────────────────

ResolvedCards ResolvedCards::resolve(
    const BlueprintBlock& block,
    const std::function<const Card*(const std::string&)>& lookup,
    const std::function<const Card*(const std::vector<Card>&)>& pickCharacter) {
    ResolvedCards cards;

    for (const auto& id : block.actors) {
        const Card* card = lookup ? lookup(id) : nullptr;
        if (card != nullptr) cards.actors.push_back(*card);
    }

    if (block.emotion.has_value() && !block.emotion->empty() && lookup) {
        const Card* card = lookup(*block.emotion);
        if (card != nullptr) cards.emotion = *card;
    }

    if (pickCharacter) {
        const Card* picked = pickCharacter(cards.actors);
        if (picked != nullptr) cards.character = *picked;
    }

    return cards;
}

// ─── InternalBlockContext ────────────────────────────────────────────────────

InternalBlockContext::InternalBlockContext(const BlueprintBlock& block, ResolvedCards cards)
    : _cards(std::move(cards)), _intensity(block.intensity) {}

const Card* InternalBlockContext::character() const {
    return _cards.character.has_value() ? &(*_cards.character) : nullptr;
}

const std::vector<Card>& InternalBlockContext::actors() const { return _cards.actors; }

const Card* InternalBlockContext::emotion() const {
    return _cards.emotion.has_value() ? &(*_cards.emotion) : nullptr;
}

std::optional<double> InternalBlockContext::intensity() const { return _intensity; }

void InternalBlockContext::preventGlobalHandler() { globalPrevented = true; }

// ─── Dialog ──────────────────────────────────────────────────────────────────

InternalDialogContext::InternalDialogContext(const BlueprintBlock& block, ResolvedCards cards)
    : InternalBlockContext(block, std::move(cards)) {
    // The port of an actor IS its card id — var1, the same string block.actors lists.
    for (const auto& id : block.actors) _cited.insert(id);
}

void InternalDialogContext::resolveCharacterPort(const std::string& cardId) {
    if (_cited.count(cardId) > 0) {
        actorPort = cardId;
    } else {
        actorPort.reset();
    }
}

// ─── Choice ──────────────────────────────────────────────────────────────────

InternalChoiceContext::InternalChoiceContext(
    const BlueprintBlock& block,
    ResolvedCards cards,
    std::vector<RuntimeChoiceItem> taggedOptions,
    std::function<void(const std::string&, const std::string&)> onChoiceSelected)
    : InternalBlockContext(block, std::move(cards)),
      _options(std::move(taggedOptions)),
      _blockId(block.id),
      _onChoiceSelected(std::move(onChoiceSelected)) {}

const std::vector<RuntimeChoiceItem>& InternalChoiceContext::options() const { return _options; }

void InternalChoiceContext::selectChoice(const std::string& optionId) {
    selectedOptionId = optionId;
    // Recorded even for an option that does not exist: the history is what the reserved "choice"
    // dictionary reads back, and silently dropping an answer would make a later condition lie
    // about what the player did.
    if (_onChoiceSelected) _onChoiceSelected(_blockId, optionId);
}

// ─── Condition ───────────────────────────────────────────────────────────────

InternalConditionContext::InternalConditionContext(
    const BlueprintBlock& block,
    ResolvedCards cards,
    std::vector<RuntimeConditionCase> cases)
    : InternalBlockContext(block, std::move(cards)), _cases(std::move(cases)) {}

const std::vector<RuntimeConditionCase>& InternalConditionContext::cases() const { return _cases; }

void InternalConditionContext::resolve(const std::string& port) { conditionPort = port; }

// ─── Action ──────────────────────────────────────────────────────────────────

InternalActionContext::InternalActionContext(const BlueprintBlock& block, ResolvedCards cards)
    : InternalBlockContext(block, std::move(cards)), _calls(block.calls) {}

const std::vector<ActionCall>& InternalActionContext::calls() const { return _calls; }

void InternalActionContext::resolve() { actionRejected = false; }

void InternalActionContext::reject(const std::string&) { actionRejected = true; }

} // namespace lsde

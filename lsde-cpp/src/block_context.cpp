// LSDE Dialog Engine — Context factory per block type

#include <lsde/block_context.h>
#include <lsde/condition_evaluator.h>

namespace lsde {

// ─── InternalDialogContext ───────────────────────────────────────────────────

InternalDialogContext::InternalDialogContext(const DialogBlock& block, const BlockCharacter* resolvedCharacter) {
    _character = resolvedCharacter;
    if (block.metadata) {
        _characters = &block.metadata->characters;
    }
}

const BlockCharacter* InternalDialogContext::character() const {
    return _character;
}

void InternalDialogContext::resolveCharacterPort(const std::string& name) {
    if (!_characters) { characterPortIndex = std::nullopt; return; }
    for (size_t i = 0; i < _characters->size(); ++i) {
        if ((*_characters)[i].name == name) {
            characterPortIndex = static_cast<int>(i);
            return;
        }
    }
    characterPortIndex = std::nullopt;
}

void InternalDialogContext::preventGlobalHandler() { globalPrevented = true; }

// ─── InternalChoiceContext ───────────────────────────────────────────────────

InternalChoiceContext::InternalChoiceContext(std::vector<ChoiceItem> visibleChoices, const BlockCharacter* resolvedCharacter)
    : _character(resolvedCharacter), _choices(std::move(visibleChoices)) {}

const BlockCharacter* InternalChoiceContext::character() const { return _character; }
const std::vector<ChoiceItem>& InternalChoiceContext::choices() const { return _choices; }

void InternalChoiceContext::selectChoice(const std::string& choiceUuid) {
    selectedChoiceUuid = choiceUuid;
}

void InternalChoiceContext::preventGlobalHandler() { globalPrevented = true; }

// ─── InternalConditionContext ────────────────────────────────────────────────

InternalConditionContext::InternalConditionContext(const BlockCharacter* resolvedCharacter)
    : _character(resolvedCharacter) {}

const BlockCharacter* InternalConditionContext::character() const { return _character; }
void InternalConditionContext::resolve(bool result) { conditionResult = result; }
void InternalConditionContext::preventGlobalHandler() { globalPrevented = true; }

// ─── InternalActionContext ───────────────────────────────────────────────────

InternalActionContext::InternalActionContext(const BlockCharacter* resolvedCharacter)
    : _character(resolvedCharacter) {}

const BlockCharacter* InternalActionContext::character() const { return _character; }
void InternalActionContext::resolve() { actionRejected = false; }
void InternalActionContext::reject(const std::string&) { actionRejected = true; }
void InternalActionContext::preventGlobalHandler() { globalPrevented = true; }

// ─── Factories ───────────────────────────────────────────────────────────────

std::unique_ptr<InternalDialogContext> createDialogContext(const DialogBlock& block, const BlockCharacter* resolvedCharacter) {
    return std::make_unique<InternalDialogContext>(block, resolvedCharacter);
}

std::unique_ptr<InternalChoiceContext> createChoiceContext(
    const ChoiceBlock& block,
    const std::function<bool(const ExportCondition&)>& evaluator,
    const BlockCharacter* resolvedCharacter)
{
    auto visible = filterVisibleChoices(block.choices, evaluator);
    return std::make_unique<InternalChoiceContext>(std::move(visible), resolvedCharacter);
}

std::unique_ptr<InternalConditionContext> createConditionContext(const BlockCharacter* resolvedCharacter) {
    return std::make_unique<InternalConditionContext>(resolvedCharacter);
}

std::unique_ptr<InternalActionContext> createActionContext(const BlockCharacter* resolvedCharacter) {
    return std::make_unique<InternalActionContext>(resolvedCharacter);
}

} // namespace lsde

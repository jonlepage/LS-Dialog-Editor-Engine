// LSDE Dialog Engine — Context factory per block type

#include <lsde/block_context.h>
#include <lsde/utils.h>
#include <lsde/condition_evaluator.h>

namespace lsde {

// ─── InternalDialogContext ───────────────────────────────────────────────────

InternalDialogContext::InternalDialogContext(const DialogBlock& block) {
    _character = getFirstCharacter(block);
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

InternalChoiceContext::InternalChoiceContext(std::vector<ChoiceItem> visibleChoices)
    : _choices(std::move(visibleChoices)) {}

const std::vector<ChoiceItem>& InternalChoiceContext::choices() const { return _choices; }

void InternalChoiceContext::selectChoice(const std::string& choiceUuid) {
    selectedChoiceUuid = choiceUuid;
}

void InternalChoiceContext::preventGlobalHandler() { globalPrevented = true; }

// ─── InternalConditionContext ────────────────────────────────────────────────

void InternalConditionContext::resolve(bool result) { conditionResult = result; }
void InternalConditionContext::preventGlobalHandler() { globalPrevented = true; }

// ─── InternalActionContext ───────────────────────────────────────────────────

void InternalActionContext::resolve() { actionRejected = false; }
void InternalActionContext::reject(const std::string&) { actionRejected = true; }
void InternalActionContext::preventGlobalHandler() { globalPrevented = true; }

// ─── Factories ───────────────────────────────────────────────────────────────

std::unique_ptr<InternalDialogContext> createDialogContext(const DialogBlock& block) {
    return std::make_unique<InternalDialogContext>(block);
}

std::unique_ptr<InternalChoiceContext> createChoiceContext(
    const ChoiceBlock& block,
    const std::function<bool(const ExportCondition&)>& evaluator)
{
    auto visible = filterVisibleChoices(block.choices, evaluator);
    return std::make_unique<InternalChoiceContext>(std::move(visible));
}

std::unique_ptr<InternalConditionContext> createConditionContext() {
    return std::make_unique<InternalConditionContext>();
}

std::unique_ptr<InternalActionContext> createActionContext() {
    return std::make_unique<InternalActionContext>();
}

} // namespace lsde

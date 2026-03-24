// LSDE Dialog Engine — Context factory per block type

#pragma once

#include <lsde/types.h>

namespace lsde {

// ─── Internal context classes ────────────────────────────────────────────────

class InternalDialogContext : public IDialogContext {
public:
    bool globalPrevented = false;
    std::optional<int> characterPortIndex;

    InternalDialogContext(const DialogBlock& block, const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    void resolveCharacterPort(const std::string& name) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
    const std::vector<BlockCharacter>* _characters = nullptr;
};

class InternalChoiceContext : public IChoiceContext {
public:
    bool globalPrevented = false;
    std::optional<std::string> selectedChoiceUuid;

    InternalChoiceContext(std::vector<ChoiceItem> visibleChoices, const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    const std::vector<ChoiceItem>& choices() const override;
    void selectChoice(const std::string& choiceUuid) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
    std::vector<ChoiceItem> _choices;
};

class InternalConditionContext : public IConditionContext {
public:
    bool globalPrevented = false;
    std::optional<bool> conditionResult;

    explicit InternalConditionContext(const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    void resolve(bool result) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
};

class InternalActionContext : public IActionContext {
public:
    bool globalPrevented = false;
    bool actionRejected = false;

    explicit InternalActionContext(const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    void resolve() override;
    void reject(const std::string& error) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
};

// ─── Factory functions ───────────────────────────────────────────────────────

std::unique_ptr<InternalDialogContext> createDialogContext(const DialogBlock& block, const BlockCharacter* resolvedCharacter);

std::unique_ptr<InternalChoiceContext> createChoiceContext(
    const ChoiceBlock& block,
    const std::function<bool(const ExportCondition&)>& evaluator,
    const BlockCharacter* resolvedCharacter);

std::unique_ptr<InternalConditionContext> createConditionContext(const BlockCharacter* resolvedCharacter);
std::unique_ptr<InternalActionContext> createActionContext(const BlockCharacter* resolvedCharacter);

} // namespace lsde

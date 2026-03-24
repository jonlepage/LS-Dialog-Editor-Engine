// LSDE Dialog Engine — Context factory per block type

#pragma once

#include <lsde/types.h>

namespace lsde {

// ─── Internal context classes ────────────────────────────────────────────────

class InternalDialogContext : public IDialogContext {
public:
    bool globalPrevented = false;
    std::optional<int> characterPortIndex;

    explicit InternalDialogContext(const BlueprintBlock& block);
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

    explicit InternalChoiceContext(std::vector<ChoiceItem> visibleChoices);
    const std::vector<ChoiceItem>& choices() const override;
    void selectChoice(const std::string& choiceUuid) override;
    void preventGlobalHandler() override;

private:
    std::vector<ChoiceItem> _choices;
};

class InternalConditionContext : public IConditionContext {
public:
    bool globalPrevented = false;
    std::optional<bool> conditionResult;

    void resolve(bool result) override;
    void preventGlobalHandler() override;
};

class InternalActionContext : public IActionContext {
public:
    bool globalPrevented = false;
    bool actionRejected = false;

    void resolve() override;
    void reject(const std::string& error) override;
    void preventGlobalHandler() override;
};

// ─── Factory functions ───────────────────────────────────────────────────────

std::unique_ptr<InternalDialogContext> createDialogContext(const BlueprintBlock& block);

std::unique_ptr<InternalChoiceContext> createChoiceContext(
    const BlueprintBlock& block,
    const std::function<bool(const ExportCondition&)>& evaluator);

std::unique_ptr<InternalConditionContext> createConditionContext();
std::unique_ptr<InternalActionContext> createActionContext();

} // namespace lsde

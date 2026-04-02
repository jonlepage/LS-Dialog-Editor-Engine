// LSDE Dialog Engine — Context factory per block type

#pragma once

#include <lsde/types.h>

namespace lsde {

// ─── Internal context classes ────────────────────────────────────────────────

/// Internal context for DIALOG block handlers.
/// Exposes character resolution and port selection for portPerCharacter mode.
class InternalDialogContext : public IDialogContext {
public:
    /// When true, the global (Tier 1) handler will be skipped.
    bool globalPrevented = false;
    /// Character port index selected via resolveCharacterPort(), or nullopt if not set.
    std::optional<int> characterPortIndex;

    InternalDialogContext(const DialogBlock& block, const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    /// Resolve which character port to follow. Matches by UUID first, then by name as fallback.
    void resolveCharacterPort(const std::string& characterUuid) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
    const std::vector<BlockCharacter>* _characters = nullptr;
};

/// Internal context for CHOICE block handlers.
/// Holds the tagged choices (RuntimeChoiceItem) and tracks the player's selection.
class InternalChoiceContext : public IChoiceContext {
public:
    /// When true, the global (Tier 1) handler will be skipped.
    bool globalPrevented = false;
    /// UUID of the selected choice, set by selectChoice().
    std::optional<std::string> selectedChoiceUuid;

    /// @param taggedChoices All choices with optional visibility tags from tagChoiceVisibility().
    /// @param resolvedCharacter Character resolved by onResolveCharacter, or nullptr.
    /// @param blockUuid UUID of the parent ChoiceBlock (for history recording).
    /// @param onChoiceSelected Callback to record the selection in choice history.
    InternalChoiceContext(
        std::vector<RuntimeChoiceItem> taggedChoices,
        const BlockCharacter* resolvedCharacter,
        std::string blockUuid,
        std::function<void(const std::string&, const std::string&)> onChoiceSelected = {});
    const BlockCharacter* character() const override;
    /// All choices with optional visibility tags.
    const std::vector<RuntimeChoiceItem>& choices() const override;
    /// Select a choice by UUID. Records in choice history for condition evaluation.
    void selectChoice(const std::string& choiceUuid) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
    std::vector<RuntimeChoiceItem> _choices;
    std::string _blockUuid;
    std::function<void(const std::string&, const std::string&)> _onChoiceSelected;
};

/// Internal context for CONDITION block handlers.
/// Stores the evaluation result set by resolve().
class InternalConditionContext : public IConditionContext {
public:
    /// When true, the global (Tier 1) handler will be skipped.
    bool globalPrevented = false;
    /// Condition result. bool (legacy), int (switch), or vector<int> (dispatcher).
    std::optional<ConditionResult> conditionResult;

    explicit InternalConditionContext(const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    void resolve(const ConditionResult& result) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
};

/// Internal context for ACTION block handlers.
/// Tracks whether the action was resolved (success) or rejected (failure).
class InternalActionContext : public IActionContext {
public:
    /// When true, the global (Tier 1) handler will be skipped.
    bool globalPrevented = false;
    /// true if reject() was called, false if resolve() was called.
    bool actionRejected = false;

    explicit InternalActionContext(const BlockCharacter* resolvedCharacter);
    const BlockCharacter* character() const override;
    /// Mark action as succeeded. Engine follows the "then" port.
    void resolve() override;
    /// Mark action as failed. Engine follows the "catch" port (fallback "then").
    void reject(const std::string& error) override;
    void preventGlobalHandler() override;

private:
    const BlockCharacter* _character = nullptr;
};

// ─── Factory functions ───────────────────────────────────────────────────────

/// Create a dialog context with character resolution from block metadata.
std::unique_ptr<InternalDialogContext> createDialogContext(const DialogBlock& block, const BlockCharacter* resolvedCharacter);

/// Create a choice context with pre-tagged choices (from tagChoiceVisibility).
/// @param block The parent ChoiceBlock.
/// @param taggedChoices Choices already tagged with visible by the engine.
/// @param resolvedCharacter Character resolved by onResolveCharacter, or nullptr.
/// @param onChoiceSelected Callback to record selections in choice history.
std::unique_ptr<InternalChoiceContext> createChoiceContext(
    const ChoiceBlock& block,
    std::vector<RuntimeChoiceItem> taggedChoices,
    const BlockCharacter* resolvedCharacter,
    std::function<void(const std::string&, const std::string&)> onChoiceSelected = {});

/// Create a condition context.
std::unique_ptr<InternalConditionContext> createConditionContext(const BlockCharacter* resolvedCharacter);
/// Create an action context.
std::unique_ptr<InternalActionContext> createActionContext(const BlockCharacter* resolvedCharacter);

} // namespace lsde

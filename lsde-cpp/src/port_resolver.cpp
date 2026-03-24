// LSDE Dialog Engine — Port resolution (critical algorithm)

#include <lsde/port_resolver.h>

namespace lsde {

static PortResolutionResult filterByFromPort(
    const std::vector<BlueprintConnection>& connections,
    const std::string& port)
{
    PortResolutionResult result;
    for (const auto& c : connections) {
        if (c.fromPort == port)
            result.connections.push_back(&c);
    }
    return result;
}

static PortResolutionResult resolveDialogPort(
    const std::vector<BlueprintConnection>& connections,
    const std::optional<int>& characterPortIndex)
{
    if (characterPortIndex.has_value()) {
        PortResolutionResult result;
        for (const auto& c : connections) {
            if (c.fromPortIndex && *c.fromPortIndex == *characterPortIndex)
                result.connections.push_back(&c);
        }
        if (!result.connections.empty()) return result;
        // Fallback to 'out' when character port index not found
    }
    return filterByFromPort(connections, "out");
}

static PortResolutionResult resolveChoicePort(
    const std::vector<BlueprintConnection>& connections,
    const std::optional<std::string>& selectedChoiceUuid)
{
    if (!selectedChoiceUuid.has_value()) return {};
    return filterByFromPort(connections, *selectedChoiceUuid);
}

static PortResolutionResult resolveConditionPort(
    const std::vector<BlueprintConnection>& connections,
    const std::optional<bool>& conditionResult)
{
    if (!conditionResult.has_value()) return {};
    int targetIndex = *conditionResult ? 0 : 1;
    PortResolutionResult result;
    for (const auto& c : connections) {
        if (c.fromPortIndex && *c.fromPortIndex == targetIndex)
            result.connections.push_back(&c);
    }
    return result;
}

static PortResolutionResult resolveActionPort(
    const std::vector<BlueprintConnection>& connections,
    const std::optional<bool>& actionRejected)
{
    if (actionRejected && *actionRejected) {
        PortResolutionResult result;
        for (const auto& c : connections) {
            if (c.fromPort == "catch")
                result.connections.push_back(&c);
        }
        if (!result.connections.empty()) return result;
        // Fallback to 'then' on reject when no catch port
    }
    return filterByFromPort(connections, "then");
}

PortResolutionResult resolvePort(const PortResolutionInput& input) {
    if (!input.block || !input.connections) return {};

    const auto& connections = *input.connections;

    switch (input.block->type) {
        case BlockType::Dialog:
            return resolveDialogPort(connections, input.characterPortIndex);
        case BlockType::Choice:
            return resolveChoicePort(connections, input.selectedChoiceUuid);
        case BlockType::Condition:
            return resolveConditionPort(connections, input.conditionResult);
        case BlockType::Action:
            return resolveActionPort(connections, input.actionRejected);
        case BlockType::Note: {
            PortResolutionResult result;
            for (const auto& c : connections)
                result.connections.push_back(&c);
            return result;
        }
    }
    return {};
}

} // namespace lsde

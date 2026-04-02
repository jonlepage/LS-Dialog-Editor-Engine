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

static PortResolutionResult filterDefaultPort(const std::vector<BlueprintConnection>& connections) {
    PortResolutionResult result;
    for (const auto& c : connections) {
        if (c.fromPort == "default" || c.fromPort == "false")
            result.connections.push_back(&c);
    }
    return result;
}

static PortResolutionResult resolveConditionPort(
    const std::vector<BlueprintConnection>& connections,
    const std::optional<ConditionResult>& conditionResult)
{
    if (!conditionResult.has_value()) return {};

    return std::visit([&connections](const auto& val) -> PortResolutionResult {
        using T = std::decay_t<decltype(val)>;

        if constexpr (std::is_same_v<T, bool>) {
            // Legacy boolean: true → port 0, false → port 1
            int targetIndex = val ? 0 : 1;
            PortResolutionResult result;
            for (const auto& c : connections) {
                if (c.fromPortIndex && *c.fromPortIndex == targetIndex)
                    result.connections.push_back(&c);
            }
            return result;
        }
        else if constexpr (std::is_same_v<T, int>) {
            if (val >= 0) {
                // Switch mode: matched case index
                PortResolutionResult result;
                for (const auto& c : connections) {
                    if (c.fromPortIndex && *c.fromPortIndex == val)
                        result.connections.push_back(&c);
                }
                return result;
            }
            // No match (-1): default/false port
            return filterDefaultPort(connections);
        }
        else if constexpr (std::is_same_v<T, std::vector<int>>) {
            // Dispatcher mode: all matched case ports + default port
            std::unordered_set<int> indices(val.begin(), val.end());
            PortResolutionResult result;
            // Default port (main continuation)
            for (const auto& c : connections) {
                if (c.fromPort == "default" || c.fromPort == "false")
                    result.connections.push_back(&c);
            }
            // Matched case ports (async tracks)
            for (const auto& c : connections) {
                if (c.fromPortIndex && indices.count(*c.fromPortIndex))
                    result.connections.push_back(&c);
            }
            return result;
        }
        else {
            return {};
        }
    }, *conditionResult);
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

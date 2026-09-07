// LSDE Dialog Engine — Port resolution (C++ port of port-resolver.ts)
//
// This function decides where the flow goes next, and it is the one piece of the engine that must
// behave identically in all four runtimes — a divergence here does not throw, it sends a player
// down the wrong branch.
//
// It routes on PORT NAMES. In v1 it routed on fromPortIndex, a position in a list, and that is the
// single change that broke the loudest: a v1 engine on a v2 payload found no connection at all on
// a dialog with per-character ports, on the true branch of a condition, on every switch case. The
// scene stopped where the player expected a branch, and nothing was logged.
//
// The ports, per block type:
//
//   dialog     "out", or one port per actor CARD ID with portPerCharacter — "out" is the fallback
//   choice     the picked option's id (C1…) — there is no "out" on a choice
//   condition  "out" (true) and "default" (false), or K1… per case with portPerCase
//   action     "then", and "catch" when a call failed
//   note       never dispatched; the traversal steps over it
//
// The block decides WHICH port; this file only finds the wires on it. A port the writer left
// unwired resolves to nothing, and nothing is a legitimate end of flow — "default" is the fallback
// for "no case matched", not for "that exit has no wire".

#include "lsde/port_resolver.h"

namespace lsde {

namespace {

std::vector<Link> onPort(const std::vector<Link>& links, const std::string& port) {
    std::vector<Link> matches;
    for (const auto& link : links) {
        if (link.port == port) matches.push_back(link);
    }
    return matches;
}

/// A dialog leaves by "out".
///
/// With portPerCharacter it grows one port per actor instead, named by the actor's CARD ID (var1,
/// var2) — the same id block.actors lists. "out" stays as the "else" exit: a dialog whose actor
/// has no port of its own still goes somewhere.
PortResolutionResult resolveDialogPort(
    const std::vector<Link>& links,
    const std::optional<std::string>& actorPort) {
    if (actorPort.has_value()) {
        auto matches = onPort(links, *actorPort);
        if (!matches.empty()) return {matches};
        // The actor has no port of its own — fall through to "out".
    }
    return {onPort(links, Ports::Out)};
}

/// A choice leaves by the id of the option the player picked — C1, C2. That id IS the port.
///
/// There is no "out" and no fallback: until an option is picked there is nowhere to go, and an
/// option the writer left unwired ends the flow. Both are the drawing, not an error.
PortResolutionResult resolveChoicePort(
    const std::vector<Link>& links,
    const std::optional<std::string>& selectedOptionId) {
    // Empty counts as "nothing picked", like the reference implementation: an empty string is
    // not an option id, and a game writing selectChoice(picked ? picked->id : "") must not send
    // the flow looking for a port named "".
    if (!selectedOptionId.has_value() || selectedOptionId->empty()) return {};
    return {onPort(links, *selectedOptionId)};
}

/// A condition leaves by the port its cases picked — "out" or "default" in if mode, K1… or
/// "default" with portPerCase.
///
/// Which port that is was decided before we got here, by the condition evaluator: it is the only
/// thing that knows the two modes and the game's answers. This function does not re-derive it.
/// nullopt means nothing was decided, so nowhere to go.
PortResolutionResult resolveConditionPort(
    const std::vector<Link>& links,
    const std::optional<std::string>& conditionPort) {
    if (!conditionPort.has_value()) return {};
    return {onPort(links, *conditionPort)};
}

/// An action leaves by "then" once its calls went through, and by "catch" when one failed.
///
/// A failure with no "catch" wired falls back to "then": the writer who drew no error branch meant
/// the flow to carry on, and stopping the scene on an unhandled failure would strand the player
/// mid-dialogue.
PortResolutionResult resolveActionPort(
    const std::vector<Link>& links,
    const std::optional<bool>& actionRejected) {
    if (actionRejected.value_or(false)) {
        auto caught = onPort(links, Ports::Catch);
        if (!caught.empty()) return {caught};
        // No error branch drawn — carry on through "then".
    }
    return {onPort(links, Ports::Then)};
}

} // namespace

PortResolutionResult resolvePort(const PortResolutionInput& input) {
    if (input.block == nullptr) return {};

    const std::string& type = input.block->type;

    if (type == BlockType::Dialog) return resolveDialogPort(input.links, input.actorPort);
    if (type == BlockType::Choice) return resolveChoicePort(input.links, input.selectedOptionId);
    if (type == BlockType::Condition) return resolveConditionPort(input.links, input.conditionPort);
    if (type == BlockType::Action) return resolveActionPort(input.links, input.actionRejected);
    if (type == BlockType::Note) return {input.links};

    // A block type this engine does not know — a v1 payload, say — routes nowhere rather than to
    // the wrong handler.
    return {};
}

} // namespace lsde

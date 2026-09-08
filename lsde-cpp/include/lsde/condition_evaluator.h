// LSDE Dialog Engine — Condition evaluation (C++ port of condition-evaluator.ts)
//
// The engine never compares anything itself. It does not read a dictionary, does not know what
// "credits" holds, does not implement greaterOrEqual. It hands each test to the game's
// onResolveCondition and only assembles the answers — which is why the v2 operator set going from
// a free string to six closed values changed nothing here.
//
// v2 replaced the 2D ExportCondition[][] with a flat list of cases that each carry their own port,
// so there is no index to derive any more. It also dropped the dispatcher mode entirely: a switch
// picks ONE path, a dispatcher took them all, and having both behind a checkbox on the same block
// meant a writer read three wires leaving a condition as a choice when it was three simultaneous
// launches. isAsync already covers that need, on any block, visibly.

#pragma once

#include <lsde/types.h>

namespace lsde {

/// What the game answers for one comparison.
using ConditionEvaluatorFn = std::function<bool(const ConditionTest&)>;

/// Evaluate a chain of tests left to right, **with no operator precedence**.
///
/// "a AND b OR c" reads as "(a AND b) OR c", never as "a AND (b OR c)". That is deliberate: the
/// editor draws a flat list, so the engine evaluates a flat list. A writer who needs grouping uses
/// two condition blocks in a row, which is also what the reader of the graph sees.
///
/// `join` links a test to the one ABOVE it and is absent on the first. Missing means AND.
///
/// **Every test is evaluated, even once the answer is settled.** No short-circuit: the game's
/// evaluator is also where a project logs, counts or displays what was asked, and skipping calls
/// would make that log depend on the order the writer happened to use.
///
/// No tests at all = true. That is how "always" is written in v2 — by the ABSENCE of `when`.
bool evaluateConditionChain(
    const std::optional<std::vector<ConditionTest>>& tests,
    const ConditionEvaluatorFn& evaluator);

/// Same, for a list that is always present.
bool evaluateConditionChain(
    const std::vector<ConditionTest>& tests,
    const ConditionEvaluatorFn& evaluator);

/// Pick the exit port of a condition block. There are two modes and only two.
///
/// | portPerCase | rule | exit |
/// |---|---|---|
/// | false | every case must hold | "out" if they all do, "default" otherwise |
/// | true  | the first case that holds, in order | its own port (K1…), "default" if none |
///
/// A case with no `when` is always true, and makes every case below it unreachable in portPerCase
/// mode. That is the writer's drawing, not an error to report.
///
/// A block with no cases at all leaves by "out": nothing was asked, so nothing failed.
std::string evaluateConditionCases(
    const std::vector<ConditionCase>& cases,
    bool portPerCase,
    const ConditionEvaluatorFn& evaluator);

/// Pick the exit port from case results that were ALREADY computed.
///
/// Same rules as evaluateConditionCases, same answer - it just does not ask again.
///
/// The engine needs both halves for every condition block: a result per case, so the handler is
/// handed answers rather than questions, and the port to leave by. Calling the two in a row asked
/// the game's evaluator about the same test twice, and how many times depended on the mode and on
/// which case matched - which broke the one promise this file makes, that a project can count and
/// log what it was asked.
///
/// evaluateConditionCases keeps its short-circuit: a game calling it on its own really does stop at
/// the first case that holds. That saves nothing HERE, because filling `result` for every case has
/// already asked about all of them.
std::string pickPortFromResults(
    const std::vector<ConditionCase>& cases,
    bool portPerCase,
    const std::vector<bool>& results);

/// Evaluate every case on its own, without picking a port.
///
/// Handed to a game that wants to show what matched without changing where the flow goes. The
/// engine fills cases()[i].result with the same rule, then reads the exit port off those results
/// with pickPortFromResults - never by calling this and deciding for itself.
std::vector<bool> evaluateEachCase(
    const std::vector<ConditionCase>& cases,
    const ConditionEvaluatorFn& evaluator);

/// Tag every option of a choice with whether its `when` holds.
///
/// The engine hands over **all** the options, tagged — never a shortened list. A game that wants
/// only the offered ones filters on `visible != false`; a game that wants to grey out the others,
/// or show "[locked]", still has them. Filtering here would take that away.
///
/// `visible` is left nullopt when no evaluator is given: unknown, not hidden.
std::vector<RuntimeChoiceItem> tagOptionVisibility(
    const std::vector<Option>& options,
    const ConditionEvaluatorFn* evaluator);

/// Is this test about what the player already answered, rather than about game state?
///
/// "choice" is a reserved dictionary id — no project dictionary may take it. `entry` is a CHOICE
/// block id of this scene and `value` an option id of that block. The engine answers these from
/// the history it kept during the scene, so they never reach the game's evaluator.
bool isChoiceTest(const ConditionTest& test);

} // namespace lsde

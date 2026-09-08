// LSDE Dialog Engine — Condition evaluation (C# port of condition-evaluator.ts)
//
// The engine never compares anything itself. It does not read a dictionary, does not know what
// "credits" holds, does not implement GreaterOrEqual. It hands each test to the game's
// OnResolveCondition and only assembles the answers — which is why the v2 operator set going from
// a free string to six closed values changed nothing here.
//
// v2 replaced the 2D ExportCondition[][] with a flat list of cases that each carry their own port,
// so there is no index to derive any more. It also dropped the dispatcher mode entirely: a switch
// picks ONE path, a dispatcher took them all, and having both behind a checkbox on the same block
// meant a writer read three wires leaving a condition as a choice when it was three simultaneous
// launches. IsAsync already covers that need, on any block, visibly.

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    public static class ConditionEvaluator
    {
        /// <summary>
        /// Evaluate a chain of tests left to right, <b>with no operator precedence</b>.
        /// <para>"a AND b OR c" reads as "(a AND b) OR c", never as "a AND (b OR c)". That is
        /// deliberate: the editor draws a flat list, so the engine evaluates a flat list. A writer
        /// who needs grouping uses two condition blocks in a row, which is also what the reader of
        /// the graph sees.</para>
        /// <para>Join links a test to the one ABOVE it and is absent on the first. Missing means AND.</para>
        /// <para><b>Every test is evaluated, even once the answer is settled.</b> No short-circuit:
        /// the game's evaluator is also where a project logs, counts or displays what was asked,
        /// and skipping calls would make that log depend on the order the writer happened to use.</para>
        /// <para>No tests at all = true. That is how "always" is written in v2 — by the ABSENCE of
        /// When, never by an empty list.</para>
        /// </summary>
        public static bool EvaluateConditionChain(
            List<ConditionTest>? tests,
            Func<ConditionTest, bool> evaluator)
        {
            if (tests == null || tests.Count == 0) return true;

            bool result = evaluator(tests[0]);

            for (int i = 1; i < tests.Count; i++)
            {
                var test = tests[i];
                bool current = evaluator(test);

                if (test.Join == ConditionJoin.Or)
                {
                    result = result || current;
                }
                else
                {
                    result = result && current;
                }
            }

            return result;
        }

        /// <summary>
        /// Pick the exit port of a condition block. There are two modes and only two.
        /// <para>PortPerCase absent: every case must hold — "out" if they all do, "default" otherwise.</para>
        /// <para>PortPerCase true: the first case that holds, in order, takes its own port (K1…);
        /// "default" when none does.</para>
        /// <para>A case with no When is always true, and makes every case below it unreachable in
        /// PortPerCase mode. That is the writer's drawing, not an error to report.</para>
        /// <para>A block with no cases at all leaves by "out": nothing was asked, so nothing failed.</para>
        /// </summary>
        public static string EvaluateConditionCases(
            List<ConditionCase>? cases,
            bool portPerCase,
            Func<ConditionTest, bool> evaluator)
        {
            if (cases == null || cases.Count == 0) return Ports.Out;

            if (portPerCase)
            {
                foreach (var conditionCase in cases)
                {
                    if (EvaluateConditionChain(conditionCase.When, evaluator))
                        return conditionCase.Port;
                }
                return Ports.Default;
            }

            // if mode: the cases share one exit, so they all have to hold to take it.
            foreach (var conditionCase in cases)
            {
                if (!EvaluateConditionChain(conditionCase.When, evaluator))
                    return Ports.Default;
            }
            return Ports.Out;
        }

        /// <summary>Pick the exit port from case results that were ALREADY computed.</summary>
        /// <remarks>Same rules as EvaluateConditionCases, same answer — it just does not ask again.
        /// <para>The engine needs both halves for every condition block: a result per case, so the
        /// handler is handed answers rather than questions, and the port to leave by. Calling the
        /// two in a row asked the game's evaluator about the same test twice, and how many times
        /// depended on the mode and on which case matched — which broke the one promise this file
        /// makes, that a project can count and log what it was asked.</para>
        /// <para>EvaluateConditionCases keeps its short-circuit: a game calling it on its own
        /// really does stop at the first case that holds. That saves nothing HERE, because filling
        /// Result for every case has already asked about all of them.</para></remarks>
        public static string PickPortFromResults(
            List<ConditionCase>? cases,
            bool portPerCase,
            List<bool> results)
        {
            if (cases == null || cases.Count == 0) return Ports.Out;

            if (portPerCase)
            {
                for (int i = 0; i < cases.Count; i++)
                {
                    if (i < results.Count && results[i]) return cases[i].Port;
                }
                return Ports.Default;
            }

            // if mode: the cases share one exit, so they all have to hold to take it.
            for (int i = 0; i < cases.Count; i++)
            {
                if (i >= results.Count || !results[i]) return Ports.Default;
            }
            return Ports.Out;
        }

        /// <summary>Evaluate every case on its own, without picking a port.</summary>
        /// <remarks>Handed to a game that wants to show what matched without changing where the
        /// flow goes. The engine fills Cases[i].Result with the same rule, then reads the exit port
        /// off those results with PickPortFromResults — never by calling this and deciding for
        /// itself.</remarks>
        public static List<bool> EvaluateEachCase(
            List<ConditionCase>? cases,
            Func<ConditionTest, bool> evaluator)
        {
            var results = new List<bool>();
            if (cases == null) return results;

            foreach (var conditionCase in cases)
            {
                results.Add(EvaluateConditionChain(conditionCase.When, evaluator));
            }
            return results;
        }

        /// <summary>
        /// Tag every option of a choice with whether its When holds.
        /// <para>The engine hands over <b>all</b> the options, tagged — never a shortened list. A
        /// game that wants only the offered ones filters on Visible != false; a game that wants to
        /// grey out the others, or show "[locked]", still has them. Filtering here would take that
        /// away.</para>
        /// <para>Visible is left null when no evaluator is installed: unknown, not hidden.</para>
        /// </summary>
        public static List<RuntimeChoiceItem> TagOptionVisibility(
            List<Option>? options,
            Func<ConditionTest, bool>? evaluator)
        {
            var tagged = new List<RuntimeChoiceItem>();
            if (options == null) return tagged;

            foreach (var option in options)
            {
                tagged.Add(new RuntimeChoiceItem
                {
                    Id = option.Id,
                    Key = option.Key,
                    Text = option.Text,
                    When = option.When,
                    Visible = evaluator == null
                        ? (bool?)null
                        : EvaluateConditionChain(option.When, evaluator),
                });
            }
            return tagged;
        }

        /// <summary>
        /// Is this test about what the player already answered, rather than about game state?
        /// <para>"choice" is a reserved dictionary id — no project dictionary may take it. Entry is
        /// a CHOICE block id of this scene and Value an option id of that block. The engine answers
        /// these from the history it kept during the scene, so they never reach the game's
        /// evaluator: a game does not have to remember what it already told the engine.</para>
        /// </summary>
        public static bool IsChoiceTest(ConditionTest test)
        {
            return test.Dict == Ports.Choice;
        }
    }
}

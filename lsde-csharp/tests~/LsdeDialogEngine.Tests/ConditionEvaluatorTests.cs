// LSDE Dialog Engine — Condition evaluation (C# port of condition-evaluator.test.ts)
//
// The engine assembles answers, it never compares. Every test below feeds a fake evaluator and
// checks how the answers are combined — which is the whole of what this module owns.

using System;
using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class ConditionEvaluatorTests
    {
        /// <summary>A test whose truth is written into its Entry, so a case reads like what it asserts.</summary>
        private static ConditionTest T(string entry, string? join = null)
            => Build.Test("switches", entry, true, ConditionOperator.Equals, join);

        /// <summary>Answers by what the test asks for, so the chain logic is what is under test.</summary>
        private static bool Answer(ConditionTest test) => test.Entry.StartsWith("T");

        private static List<ConditionTest> Chain(params ConditionTest[] tests) => new(tests);

        // ─── Chaining tests inside a case ────────────────────────────────────

        [Fact]
        public void NoTestsAtAllIsTrue()
        {
            // This is how "always" is written in v2 — by the ABSENCE of When.
            Assert.True(ConditionEvaluator.EvaluateConditionChain(null, Answer));
            Assert.True(ConditionEvaluator.EvaluateConditionChain(new List<ConditionTest>(), Answer));
        }

        [Fact]
        public void ASingleTestStandsOnItsOwn()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(Chain(T("T1")), Answer));
            Assert.False(ConditionEvaluator.EvaluateConditionChain(Chain(T("F1")), Answer));
        }

        [Fact]
        public void JoinsWithAndByDefault()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(Chain(T("T1"), T("T2")), Answer));
            Assert.False(ConditionEvaluator.EvaluateConditionChain(Chain(T("T1"), T("F1")), Answer));
            Assert.False(ConditionEvaluator.EvaluateConditionChain(Chain(T("F1"), T("T1")), Answer));
        }

        [Fact]
        public void JoinsWithOrWhenTheJoinSaysSo()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(
                Chain(T("F1"), T("T1", ConditionJoin.Or)), Answer));
            Assert.False(ConditionEvaluator.EvaluateConditionChain(
                Chain(T("F1"), T("F2", ConditionJoin.Or)), Answer));
        }

        [Fact]
        public void IgnoresAJoinOnTheFirstTest()
        {
            // It links to the one ABOVE, and there is none.
            Assert.False(ConditionEvaluator.EvaluateConditionChain(
                Chain(T("F1", ConditionJoin.Or)), Answer));
        }

        [Fact]
        public void ReadsLeftToRightWithNoPrecedence()
        {
            // F AND T OR T → (F AND T) OR T = true.
            // With AND binding tighter it would be F AND (T OR T) = false. It does not.
            Assert.True(ConditionEvaluator.EvaluateConditionChain(
                Chain(T("F1"), T("T1", ConditionJoin.And), T("T2", ConditionJoin.Or)), Answer));

            // T OR F AND F → (T OR F) AND F = false.
            // With precedence it would be T OR (F AND F) = true. It does not.
            Assert.False(ConditionEvaluator.EvaluateConditionChain(
                Chain(T("T1"), T("F1", ConditionJoin.Or), T("F2", ConditionJoin.And)), Answer));
        }

        [Fact]
        public void EvaluatesEveryTestEvenOnceTheAnswerIsSettled()
        {
            // No short-circuit: the game's evaluator is also where a project logs and counts, and
            // skipping calls would make that log depend on the order the writer happened to use.
            int calls = 0;
            Func<ConditionTest, bool> counting = test => { calls++; return Answer(test); };

            ConditionEvaluator.EvaluateConditionChain(
                Chain(T("F1"), T("T1", ConditionJoin.And), T("T2", ConditionJoin.And)), counting);

            Assert.Equal(3, calls);
        }

        // ─── Picking a port — if mode ────────────────────────────────────────

        [Fact]
        public void IfMode_LeavesByOutWhenTheCaseHolds()
        {
            var cases = new List<ConditionCase> { Build.Case(Ports.Out, Chain(T("T1"))) };
            Assert.Equal(Ports.Out, ConditionEvaluator.EvaluateConditionCases(cases, false, Answer));
        }

        [Fact]
        public void IfMode_LeavesByDefaultWhenItDoesNot()
        {
            var cases = new List<ConditionCase> { Build.Case(Ports.Out, Chain(T("F1"))) };
            Assert.Equal(Ports.Default, ConditionEvaluator.EvaluateConditionCases(cases, false, Answer));
        }

        [Fact]
        public void IfMode_RequiresEveryCaseToHold()
        {
            var all = new List<ConditionCase>
            {
                Build.Case(Ports.Out, Chain(T("T1"))),
                Build.Case(Ports.Out, Chain(T("T2"))),
            };
            Assert.Equal(Ports.Out, ConditionEvaluator.EvaluateConditionCases(all, false, Answer));

            var one = new List<ConditionCase>
            {
                Build.Case(Ports.Out, Chain(T("T1"))),
                Build.Case(Ports.Out, Chain(T("F1"))),
            };
            Assert.Equal(Ports.Default, ConditionEvaluator.EvaluateConditionCases(one, false, Answer));
        }

        [Fact]
        public void IfMode_ACaseWithNoWhenIsAlwaysTrue()
        {
            var cases = new List<ConditionCase> { Build.Case(Ports.Out) };
            Assert.Equal(Ports.Out, ConditionEvaluator.EvaluateConditionCases(cases, false, Answer));
        }

        [Fact]
        public void NoCasesAtAllLeavesByOut()
        {
            // Nothing was asked, so nothing failed.
            Assert.Equal(Ports.Out, ConditionEvaluator.EvaluateConditionCases(null, false, Answer));
            Assert.Equal(Ports.Out, ConditionEvaluator.EvaluateConditionCases(
                new List<ConditionCase>(), true, Answer));
        }

        // ─── Picking a port — switch mode ────────────────────────────────────

        [Fact]
        public void SwitchMode_TakesTheFirstCaseThatHolds()
        {
            var cases = new List<ConditionCase>
            {
                Build.Case("K1", Chain(T("F1"))),
                Build.Case("K2", Chain(T("T1"))),
                Build.Case("K3", Chain(T("T2"))),
            };
            Assert.Equal("K2", ConditionEvaluator.EvaluateConditionCases(cases, true, Answer));
        }

        [Fact]
        public void SwitchMode_TakesDefaultWhenNoneHolds()
        {
            var cases = new List<ConditionCase>
            {
                Build.Case("K1", Chain(T("F1"))),
                Build.Case("K2", Chain(T("F2"))),
            };
            Assert.Equal(Ports.Default, ConditionEvaluator.EvaluateConditionCases(cases, true, Answer));
        }

        [Fact]
        public void SwitchMode_ACatchAllShadowsEverythingBelowIt()
        {
            // The reference export does exactly this: COND-001 K3 has no comparison at all.
            var cases = new List<ConditionCase>
            {
                Build.Case("K1", Chain(T("F1"))),
                Build.Case("K2"),
                Build.Case("K3", Chain(T("T1"))),
            };
            Assert.Equal("K2", ConditionEvaluator.EvaluateConditionCases(cases, true, Answer));
        }

        [Fact]
        public void SwitchMode_StopsAskingOnceACaseHolds()
        {
            // Unlike the chain inside a case, cases DO short-circuit: a later case is a different
            // question, and asking it would let a game log a branch that was never taken.
            int calls = 0;
            Func<ConditionTest, bool> counting = test => { calls++; return Answer(test); };

            var cases = new List<ConditionCase>
            {
                Build.Case("K1", Chain(T("F1"))),
                Build.Case("K2", Chain(T("T1"))),
                Build.Case("K3", Chain(T("T2"))),
            };
            ConditionEvaluator.EvaluateConditionCases(cases, true, counting);

            Assert.Equal(2, calls);
        }

        // ─── The dispatcher is gone ──────────────────────────────────────────

        [Fact]
        public void NeverReturnsMoreThanOnePort()
        {
            // v1 had a third mode: EnableDispatcher fired EVERY matching case at once, in parallel.
            // Nothing in v2 turns it on, and nothing here can produce it.
            var allTrue = new List<ConditionCase>
            {
                Build.Case("K1", Chain(T("T1"))),
                Build.Case("K2", Chain(T("T2"))),
                Build.Case("K3", Chain(T("T3"))),
            };
            Assert.Equal("K1", ConditionEvaluator.EvaluateConditionCases(allTrue, true, Answer));
        }

        [Fact]
        public void StillLetsAGameSeeEveryCaseThatHolds()
        {
            // The need the dispatcher served is covered: read the results, then use IsAsync on the
            // blocks you want running in parallel — where a reader of the graph can see it.
            var cases = new List<ConditionCase>
            {
                Build.Case("K1", Chain(T("T1"))),
                Build.Case("K2", Chain(T("F1"))),
                Build.Case("K3"),
            };
            Assert.Equal(new List<bool> { true, false, true },
                ConditionEvaluator.EvaluateEachCase(cases, Answer));
        }

        // ─── Tagging the options of a choice ─────────────────────────────────

        [Fact]
        public void HandsBackEveryOptionTagged()
        {
            var options = new List<Option>
            {
                Build.Opt("C1"),
                Build.Opt("C2", Chain(T("T1"))),
                Build.Opt("C3", Chain(T("F1"))),
            };

            var tagged = ConditionEvaluator.TagOptionVisibility(options, Answer);

            Assert.Equal(3, tagged.Count);
            Assert.True(tagged[0].Visible);
            Assert.True(tagged[1].Visible);
            Assert.False(tagged[2].Visible);
        }

        [Fact]
        public void LeavesVisibleNullWithNoResolver()
        {
            // Unknown, not hidden.
            var options = new List<Option> { Build.Opt("C1", Chain(T("T1"))) };
            var tagged = ConditionEvaluator.TagOptionVisibility(options, null);

            Assert.Single(tagged);
            Assert.Null(tagged[0].Visible);
        }

        [Fact]
        public void KeepsTheKeyOfEachOption()
        {
            var tagged = ConditionEvaluator.TagOptionVisibility(
                new List<Option> { Build.Opt("C1") }, Answer);

            Assert.Equal("__blueprints__.s1.CHOICE-001.C1", tagged[0].Key);
        }

        // ─── The reserved choice dictionary ──────────────────────────────────

        // ─── The router's reading of the same cases ──────────────────────────

        [Fact]
        public void Router_EveryTrueCaseThenThenWhenAllHeld()
        {
            var cases = new List<ConditionCase> { Build.Case("K1"), Build.Case("K2"), Build.Case("K3") };
            Assert.Equal(new List<string> { "K1", "K2", "K3", Ports.Then },
                ConditionEvaluator.PickRouterPorts(cases, new List<bool> { true, true, true }));
        }

        [Fact]
        public void Router_NoBreakAFalseCaseHidesNothingAndTheExitIsCatch()
        {
            var cases = new List<ConditionCase> { Build.Case("K1"), Build.Case("K2"), Build.Case("K3") };
            Assert.Equal(new List<string> { "K1", "K3", Ports.Catch },
                ConditionEvaluator.PickRouterPorts(cases, new List<bool> { true, false, true }));
            Assert.Equal(new List<string> { Ports.Catch },
                ConditionEvaluator.PickRouterPorts(cases, new List<bool> { false, false, false }));
        }

        [Fact]
        public void Router_NoCasesAtAllIsThenLikePromiseAllOfNothing()
        {
            Assert.Equal(new List<string> { Ports.Then },
                ConditionEvaluator.PickRouterPorts(new List<ConditionCase>(), new List<bool>()));
            Assert.Equal(new List<string> { Ports.Then },
                ConditionEvaluator.PickRouterPorts(null, new List<bool>()));
        }

        [Fact]
        public void RecognisesATestThatReadsAPastAnswer()
        {
            Assert.True(ConditionEvaluator.IsChoiceTest(Build.ChoiceTest("CHOICE-001", "C1")));
            Assert.False(ConditionEvaluator.IsChoiceTest(T("T1")));
            Assert.False(ConditionEvaluator.IsChoiceTest(
                Build.Test("choices", "x", 1)));
        }
    }
}

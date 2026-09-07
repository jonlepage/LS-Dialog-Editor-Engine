// LSDE Dialog Engine — the condition resolver, end to end (C# port).
//
// OnResolveCondition is the SINGLE game-state evaluator: it answers option visibility and it
// pre-evaluates the cases of a condition block. Once it is installed the engine already knows
// which port a condition leaves by, which is what makes OnCondition optional.

using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class OnResolveConditionTests
    {
        private static List<ConditionTest> When(string entry)
            => new() { Build.Test("switches", entry, true) };

        /// <summary>A condition in if mode: out when it holds, default when it does not.</summary>
        private static BlueprintExport Branching() => Build.OneScene(
            Build.Condition("k1", Build.Case(Ports.Out, When("flag")))
                .Wire("yes", Ports.Out)
                .Wire("no", Ports.Default),
            Build.Dialog("yes"),
            Build.Dialog("no"));

        private static DialogueEngine Engine(BlueprintExport data, bool withCondition = true)
        {
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);

            engine.OnDialog(args => { args.Next(); });
            engine.OnChoice(args =>
            {
                if (args.Context.Options.Count > 0) args.Context.SelectChoice(args.Context.Options[0].Id);
                args.Next();
            });
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            if (withCondition) engine.OnCondition(args => { args.Next(); });

            return engine;
        }

        private static List<string> Play(DialogueEngine engine)
        {
            var visited = new List<string>();
            engine.OnDialog(args => { visited.Add(args.Block.Id); args.Next(); });
            engine.Scene("s1").Start();
            return visited;
        }

        // ─── OnCondition is optional ─────────────────────────────────────────

        [Fact]
        public void StartDoesNotThrowWhenOnConditionIsOmittedButAResolverIsInstalled()
        {
            var engine = Engine(Branching(), withCondition: false);
            engine.OnResolveCondition(_ => true);

            var handle = engine.Scene("s1");
            var error = Record.Exception(() => handle.Start());

            Assert.Null(error);
        }

        [Fact]
        public void StartThrowsWhenNeitherIsInstalled()
        {
            var engine = Engine(Branching(), withCondition: false);
            var handle = engine.Scene("s1");

            var error = Assert.Throws<InvalidOperationException>(() => handle.Start());
            Assert.Contains("onCondition", error.Message, StringComparison.OrdinalIgnoreCase);
        }

        // ─── Routing ─────────────────────────────────────────────────────────

        [Fact]
        public void RoutesOnItsOwnWhenTheHandlerOnlyCallsNext()
        {
            var engine = Engine(Branching());
            engine.OnResolveCondition(_ => true);

            Assert.Equal(new List<string> { "yes" }, Play(engine));
        }

        [Fact]
        public void RoutesToDefaultWhenTheCaseDoesNotHold()
        {
            var engine = Engine(Branching());
            engine.OnResolveCondition(_ => false);

            Assert.Equal(new List<string> { "no" }, Play(engine));
        }

        [Fact]
        public void RoutesWithNoOnConditionHandlerAtAll()
        {
            var engine = Engine(Branching(), withCondition: false);
            engine.OnResolveCondition(_ => true);

            Assert.Equal(new List<string> { "yes" }, Play(engine));
        }

        [Fact]
        public void HandsTheHandlerEachCaseWithItsPortAndResult()
        {
            var seen = new List<(string, bool?)>();
            var engine = Engine(Branching());
            engine.OnResolveCondition(_ => true);
            engine.OnCondition(args =>
            {
                seen = args.Context.Cases.Select(c => (c.Port, c.Result)).ToList();
                args.Next();
            });

            Play(engine);

            Assert.Equal(new List<(string, bool?)> { (Ports.Out, true) }, seen);
        }

        [Fact]
        public void TheHandlerCanOverrideThePortItPicked()
        {
            var engine = Engine(Branching());
            engine.OnResolveCondition(_ => true);
            engine.OnCondition(args => { args.Context.Resolve(Ports.Default); args.Next(); });

            Assert.Equal(new List<string> { "no" }, Play(engine));
        }

        // ─── portPerCase ─────────────────────────────────────────────────────

        [Fact]
        public void RoutesToTheCasePortWithPortPerCase()
        {
            var data = Build.OneScene(
                Build.Condition("k1",
                        Build.Case("K1", When("a")),
                        Build.Case("K2", When("b")))
                    .Prop("portPerCase", true)
                    .Wire("first", "K1")
                    .Wire("second", "K2")
                    .Wire("none", Ports.Default),
                Build.Dialog("first"), Build.Dialog("second"), Build.Dialog("none"));

            var engine = Engine(data);
            engine.OnResolveCondition(test => test.Entry == "b");

            Assert.Equal(new List<string> { "second" }, Play(engine));
        }

        [Fact]
        public void RoutesToDefaultWithPortPerCaseWhenNoCaseHolds()
        {
            var data = Build.OneScene(
                Build.Condition("k1", Build.Case("K1", When("a")))
                    .Prop("portPerCase", true)
                    .Wire("first", "K1")
                    .Wire("none", Ports.Default),
                Build.Dialog("first"), Build.Dialog("none"));

            var engine = Engine(data);
            engine.OnResolveCondition(_ => false);

            Assert.Equal(new List<string> { "none" }, Play(engine));
        }

        // ─── Option visibility comes from the same resolver ──────────────────

        [Fact]
        public void TagsOptionVisibilityFromTheSameResolver()
        {
            var seen = new List<bool?>();
            var data = Build.OneScene(
                Build.Choice("c1", Build.Opt("C1"), Build.Opt("C2", When("flag"))));

            var engine = Engine(data);
            engine.OnResolveCondition(_ => false);
            engine.OnChoice(args =>
            {
                seen = args.Context.Options.Select(o => o.Visible).ToList();
                args.Next();
            });

            engine.Scene("s1").Start();

            Assert.Equal(new List<bool?> { true, false }, seen);
        }

        [Fact]
        public void LeavesOptionVisibilityUnknownWithNoResolver()
        {
            // Saying false about a question nobody could answer would HIDE an answer.
            var seen = new List<bool?>();
            var data = Build.OneScene(
                Build.Choice("c1", Build.Opt("C1"), Build.Opt("C2", When("flag"))));

            var engine = Engine(data);
            engine.OnChoice(args =>
            {
                seen = args.Context.Options.Select(o => o.Visible).ToList();
                args.Next();
            });

            engine.Scene("s1").Start();

            Assert.Equal(new List<bool?> { null, null }, seen);
        }

        // ─── The reserved choice dictionary ──────────────────────────────────

        [Fact]
        public void AChoiceTestIsAnsweredFromTheSceneHistoryNeverByTheGame()
        {
            var asked = new List<string>();
            var data = Build.OneScene(
                Build.Choice("c1", Build.Opt("C1"), Build.Opt("C2"))
                    .Wire("k1", "C1").Wire("k1", "C2"),
                Build.Condition("k1", Build.Case(Ports.Out, new List<ConditionTest> { Build.ChoiceTest("c1", "C1") }))
                    .Wire("yes", Ports.Out).Wire("no", Ports.Default),
                Build.Dialog("yes"), Build.Dialog("no"));

            var engine = Engine(data);
            engine.OnResolveCondition(test => { asked.Add(test.Dict); return false; });
            engine.OnChoice(args => { args.Context.SelectChoice("C1"); args.Next(); });

            Assert.Equal(new List<string> { "yes" }, Play(engine));
            Assert.Empty(asked);
        }

        [Fact]
        public void EvaluateConditionAnswersThroughTheSceneHandle()
        {
            var engine = Engine(Branching());
            engine.OnResolveCondition(test => test.Entry == "flag");
            var handle = engine.Scene("s1");

            Assert.True(handle.EvaluateCondition(Build.Test("switches", "flag", true)));
            Assert.False(handle.EvaluateCondition(Build.Test("switches", "other", true)));
        }

        [Fact]
        public void EvaluateConditionIsFalseWithNoResolver()
        {
            var engine = Engine(Branching());
            Assert.False(engine.Scene("s1").EvaluateCondition(Build.Test("switches", "flag", true)));
        }
    }
}

// LSDE Dialog Engine — the ROUTER block (C# port of the ROUTER section of branch-queue.test.ts)
//
// A router launches every route whose case holds, then continues by "then" when all of them held
// or by "catch" when one did not. It has NO handler: by the time one could speak, every true case
// has launched and the exit is picked, so the engine dispatches nothing and advances on its own.
// "R" never appears in the played list, and that is the contract. A game that wants to watch one
// router still can, through OnBlock(id) — the last test here.
//
// The K* routes are walked like any other port: an isAsync target opens its own track, the others
// are this track's, in turn, and the continuation comes LAST — which is what lets then/catch stay
// the main flow when the case routes are async.

using System;
using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class RouterTests
    {
        private static List<ConditionTest> When(string entry)
            => new() { Build.Test("party", entry, true) };

        private sealed class PlayResult
        {
            public readonly List<string> Played = new();
            public bool Running;
            public ISceneHandle Handle = null!;
        }

        /// <summary>Play a scene to the end, advancing every block as soon as its handler is called.
        /// Nothing is deferred, so the order in Played is the order the engine chose.</summary>
        private static PlayResult Play(
            BlueprintExport data,
            Func<string, bool>? resolve = null,
            Action<ISceneHandle>? before = null)
        {
            var result = new PlayResult();
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            engine.OnResolveCondition(test => resolve == null || resolve(test.Entry));

            engine.OnDialog(args => { result.Played.Add(args.Block.Id); args.Next(); });
            engine.OnChoice(args => { result.Played.Add(args.Block.Id); args.Next(); });
            engine.OnAction(args => { result.Played.Add(args.Block.Id); args.Next(); });
            engine.OnCondition(args => { result.Played.Add(args.Block.Id); args.Next(); });

            var handle = engine.Scene("s1");
            before?.Invoke(handle);
            handle.Start();
            result.Running = handle.IsRunning();
            result.Handle = handle;
            return result;
        }

        /// <summary>A three-case router. The continuation ports are wired FIRST on purpose: the flow
        /// follows the order of the ports the router resolved, never the order of the file.</summary>
        private static BlueprintExport RouterScene(bool beside)
        {
            BlueprintBlock Target(string id)
                => beside ? Build.Dialog(id).Prop("isAsync", true) : Build.Dialog(id);

            return Build.OneScene(
                Build.Router("R", Build.Case("K1", When("a")), Build.Case("K2", When("b")), Build.Case("K3", When("c")))
                    .Wire("THEN", Ports.Then).Wire("CATCH", Ports.Catch)
                    .Wire("R1", "K1").Wire("R2", "K2").Wire("R3", "K3"),
                Target("R1"), Target("R2"), Target("R3"),
                Build.Dialog("THEN"), Build.Dialog("CATCH"));
        }

        [Fact]
        public void EveryCaseTrueTargetsNotAsyncK1K2K3ThenThen()
        {
            var r = Play(RouterScene(beside: false));
            Assert.Equal(new List<string> { "R1", "R2", "R3", "THEN" }, r.Played);
        }

        [Fact]
        public void EveryCaseTrueTargetsAsyncTheRoutesRunBesideThenContinues()
        {
            var r = Play(RouterScene(beside: true));
            Assert.Equal(new List<string> { "R1", "R2", "R3", "THEN" }, r.Played);
        }

        [Fact]
        public void OneCaseFalseTheTrueRoutesStillRunAndTheExitIsCatch()
        {
            var r = Play(RouterScene(beside: false), entry => entry != "b");
            Assert.Equal(new List<string> { "R1", "R3", "CATCH" }, r.Played);
        }

        [Fact]
        public void NoCaseTrueCatchAloneNothingQueued()
        {
            var r = Play(RouterScene(beside: false), _ => false);
            Assert.Equal(new List<string> { "CATCH" }, r.Played);
        }

        [Fact]
        public void NoCaseDeclaredThenLikePromiseAllOfNothing()
        {
            var r = Play(Build.OneScene(
                Build.Router("R").Wire("THEN", Ports.Then).Wire("CATCH", Ports.Catch),
                Build.Dialog("THEN"), Build.Dialog("CATCH")));
            Assert.Equal(new List<string> { "THEN" }, r.Played);
        }

        [Fact]
        public void TheContinuationPortHasNoWireTheQueueIsStillWalkedThenTheTrackEnds()
        {
            var r = Play(Build.OneScene(
                Build.Router("R", Build.Case("K1", When("a")), Build.Case("K2", When("b")))
                    .Wire("R1", "K1").Wire("R2", "K2"),
                Build.Dialog("R1"), Build.Dialog("R2")));
            Assert.Equal(new List<string> { "R1", "R2" }, r.Played);
            Assert.False(r.Running);
        }

        [Fact]
        public void ACaseRouteWithItsOwnBranchFinishesItBeforeTheNextCase()
        {
            var r = Play(Build.OneScene(
                Build.Router("R", Build.Case("K1", When("a")), Build.Case("K2", When("b")))
                    .Wire("R1", "K1").Wire("R2", "K2").Wire("THEN", Ports.Then),
                Build.Dialog("R1").Wire("R1b"),
                Build.Dialog("R1b"),
                Build.Dialog("R2"),
                Build.Dialog("THEN")));
            Assert.Equal(new List<string> { "R1", "R1b", "R2", "THEN" }, r.Played);
        }

        [Fact]
        public void ARouterIsVisitedThoughNeverDispatched()
        {
            // The traversal marks a block reached before it looks for a handler, so the router is
            // in the visited set — and absent from Played, which only the handlers fill.
            var r = Play(RouterScene(beside: false));
            Assert.Contains("R", r.Handle.GetVisitedBlocks());
            Assert.DoesNotContain("R", r.Played);
        }

        [Fact]
        public void ARouterIsObservableThroughOnBlockAndItsContextHasNoResolve()
        {
            // IRouterContext declares Cases and nothing to answer with — no Resolve — which the
            // compiler enforces. What a test can check is that the observation point gets the same
            // pre-evaluated cases a condition would, ALL of them, and that the flow still goes on.
            IRouterContext? seen = null;
            var r = Play(RouterScene(beside: false), entry => entry != "b", handle =>
            {
                handle.OnBlock("R", args =>
                {
                    seen = args.Context as IRouterContext;
                    args.Next();
                    return null;
                });
            });

            Assert.NotNull(seen);
            Assert.Equal(3, seen!.Cases.Count);
            Assert.Equal(new List<bool?> { true, false, true },
                new List<bool?> { seen.Cases[0].Result, seen.Cases[1].Result, seen.Cases[2].Result });
            Assert.Equal(new List<string> { "R1", "R3", "CATCH" }, r.Played);
        }
    }
}

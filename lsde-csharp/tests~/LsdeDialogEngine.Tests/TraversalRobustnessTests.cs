// LSDE Dialog Engine — a scene is never left open with nothing able to move it
// (C# port of traversal-robustness.test.ts)
//
// Found during a Unity integration, and every one of them reproduced before a line was changed:
//
//   1. an exception on an IsAsync track, or on a track a join released, escaped through the track
//      that opened it — which was left running on a block it had already left
//   2. every synchronous Next() added frames to the stack: the shared spec's condition/action loop
//      crashed the test host with a StackOverflowException — in Unity, the whole process
//   3. only the type handler sat inside the try: a throwing validation, OnBeforeBlock, resolver,
//      OnSceneEnter or OnSceneExit froze the scene — the last one beyond engine.Stop()
//   4. a deadlock was only noticed when a track ENDED, never when the last one PARKED
//   5. nothing told OnSceneExit why the scene ended
//
// And one that only C# can have: a Next() called from a thread-pool continuation ran every handler
// after it off the main thread, with nothing to say so.
//
// The rule these tests hold is problem 11 of MIGRATION-V2.md: a fault closes the WHOLE scene —
// cleanups run, tracks cancelled, OnSceneExit fired — and only then reaches whoever called Start(),
// Next() or Resolve().

using System;
using System.Collections.Generic;
using System.Threading;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class TraversalRobustnessTests
    {
        // ─── Harness ─────────────────────────────────────────────────────

        private sealed class Played
        {
            internal DialogueEngine Engine = null!;
            internal ISceneHandle Handle = null!;
            internal readonly List<SceneContext> Exits = new List<SceneContext>();
            internal readonly List<string> Cleaned = new List<string>();
            /// <summary>The Next() of every block whose handler kept it, by block id.</summary>
            internal readonly Dictionary<string, Action> Held = new Dictionary<string, Action>();
        }

        /// <summary>A scene whose handlers advance at once, except the blocks listed in hold: those
        /// keep their Next() for the test to call — the player clicking.</summary>
        private static Played Setup(
            BlueprintExport data,
            string[]? hold = null,
            string? throwAt = null,
            Action<DialogueEngine>? configure = null)
        {
            var p = new Played { Engine = new DialogueEngine() };
            Assert.Empty(p.Engine.Init(new InitOptions { Data = data }).Errors);

            Action? Dispatch(BlueprintBlock block, IBaseBlockContext context, Action next)
            {
                if (block.Id == throwAt) throw new InvalidOperationException("boom in " + block.Id);
                if (context is IActionContext action) action.Resolve();
                if (hold != null && Array.IndexOf(hold, block.Id) >= 0) p.Held[block.Id] = next;
                else next();
                return () => p.Cleaned.Add(block.Id);
            }

            p.Engine.OnDialog(a => Dispatch(a.Block, a.Context, a.Next));
            p.Engine.OnChoice(a => Dispatch(a.Block, a.Context, a.Next));
            p.Engine.OnAction(a => Dispatch(a.Block, a.Context, a.Next));
            p.Engine.OnResolveCondition(_ => true);
            p.Engine.OnSceneExit(a => p.Exits.Add(a.Context));
            configure?.Invoke(p.Engine);

            p.Handle = p.Engine.Scene("s1");
            return p;
        }

        /// <summary>The whole contract of a fault, in one place.</summary>
        private static void ExpectClosedByFault(Played p, Action run, string message)
        {
            var error = Assert.Throws<InvalidOperationException>(run);
            Assert.Equal(message, error.Message);
            Assert.False(p.Handle.IsRunning());
            Assert.False(p.Engine.IsRunning());
            Assert.Single(p.Exits);
            Assert.Equal(SceneEndReason.Faulted, p.Exits[0].Reason);
        }

        private static BlueprintBlock Async(BlueprintBlock block) => block.Prop("isAsync", true);

        private static BlueprintBlock WaitsFor(BlueprintBlock block, params string[] ids)
            => block.Prop("waitForBlocks", new List<string>(ids));

        private static List<ConditionTest> Flag() => new List<ConditionTest> { Build.Test("game", "flag", true) };

        private static BlueprintBlock[] TwoBlocks() => new[] { Build.Dialog("D1").Wire("D2"), Build.Dialog("D2") };

        // ─── 1. A fault on another track ─────────────────────────────────

        [Fact]
        public void AnIsAsyncChildThatThrowsClosesTheSceneAndTheParentLeavesItsBlock()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("D2").Wire("BG"), Build.Dialog("D2"), Async(Build.Dialog("BG"))),
                hold: new[] { "D1" }, throwAt: "BG");
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "boom in BG");
            Assert.Contains("D1", p.Cleaned);
        }

        [Fact]
        public void ATrackReleasedByAJoinThatThrowsClosesTheScene()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("J").Wire("BG"), WaitsFor(Build.Dialog("J"), "BG"), Async(Build.Dialog("BG"))),
                hold: new[] { "BG" }, throwAt: "J");
            p.Handle.Start();
            Assert.True(p.Handle.IsRunning());

            ExpectClosedByFault(p, () => p.Held["BG"](), "boom in J");
            Assert.Contains("BG", p.Cleaned);
        }

        [Fact]
        public void AParallelTrackThatThrowsWhileTheMainFlowWaitsForAClickClosesTheScene()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("M").Wire("BG"), Build.Dialog("M"),
                    Async(Build.Dialog("BG")).Wire("BG2"), Build.Dialog("BG2")),
                hold: new[] { "M", "BG" }, throwAt: "BG2");
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["BG"](), "boom in BG2");
            // The main flow's bubble is released too: the scene is gone, not just the branch.
            Assert.Contains("M", p.Cleaned);
        }

        [Fact]
        public void ACleanupThatThrowsWhileAParallelTrackIsAliveClosesTheScene()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("D2").Wire("BG"), Build.Dialog("D2"), Async(Build.Dialog("BG"))),
                hold: new[] { "D1", "BG" });
            p.Handle.OnDialogId("D1", args =>
            {
                p.Held["D1"] = args.Next;
                return () => throw new InvalidOperationException("cleanup boom");
            });
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "cleanup boom");
            Assert.Contains("BG", p.Cleaned);
        }

        // ─── 3. Every callback of the game, not only the type handler ────

        [Fact]
        public void OnValidateNextBlockThatThrows()
        {
            var p = Setup(Build.OneScene(TwoBlocks()), hold: new[] { "D1" },
                configure: e => e.OnValidateNextBlock(args =>
                {
                    if (args.NextBlock.Id == "D2") throw new InvalidOperationException("validate boom");
                    return ValidationResult.Ok();
                }));
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "validate boom");
            Assert.Contains("D1", p.Cleaned);
        }

        [Fact]
        public void OnInvalidateBlockThatThrows()
        {
            var p = Setup(Build.OneScene(TwoBlocks()), hold: new[] { "D1" },
                configure: e =>
                {
                    e.OnValidateNextBlock(args => new ValidationResult { Valid = args.NextBlock.Id != "D2" });
                    e.OnInvalidateBlock(_ => throw new InvalidOperationException("invalidate boom"));
                });
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "invalidate boom");
        }

        [Fact]
        public void OnBeforeBlockThatThrowsBeforeItResolves()
        {
            var p = Setup(Build.OneScene(TwoBlocks()), hold: new[] { "D1" },
                configure: e => e.OnBeforeBlock(args =>
                {
                    if (args.Block.Id == "D2") throw new InvalidOperationException("before boom");
                    args.Resolve();
                }));
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "before boom");
        }

        [Fact]
        public void OnBeforeBlockThatThrowsAfterASynchronousResolve()
        {
            var p = Setup(Build.OneScene(TwoBlocks()), hold: new[] { "D1" },
                configure: e => e.OnBeforeBlock(args =>
                {
                    args.Resolve();
                    throw new InvalidOperationException("before boom");
                }));

            ExpectClosedByFault(p, () => p.Handle.Start(), "before boom");
        }

        [Fact]
        public void OnResolveConditionThatThrowsOnACondition()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("C"),
                    Build.Condition("C", Build.Case("out", Flag())).Wire("D2", "out"),
                    Build.Dialog("D2")),
                hold: new[] { "D1" },
                configure: e => e.OnResolveCondition(_ => throw new InvalidOperationException("resolver boom")));
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "resolver boom");
        }

        [Fact]
        public void OnResolveConditionThatThrowsOnARouter()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("R"),
                    Build.Router("R", Build.Case("K1", Flag())).Wire("D2", "K1"),
                    Build.Dialog("D2")),
                hold: new[] { "D1" },
                configure: e => e.OnResolveCondition(_ => throw new InvalidOperationException("resolver boom")));
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "resolver boom");
        }

        [Fact]
        public void OnResolveConditionThatThrowsWhileTaggingTheOptionsOfAChoice()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("CH"),
                    Build.Choice("CH", Build.Opt("C1", Flag())).Wire("D2", "C1"),
                    Build.Dialog("D2")),
                hold: new[] { "D1" },
                configure: e => e.OnResolveCondition(_ => throw new InvalidOperationException("resolver boom")));
            p.Handle.Start();

            ExpectClosedByFault(p, () => p.Held["D1"](), "resolver boom");
        }

        [Fact]
        public void OnResolveCharacterThatThrows()
        {
            // The resolver is asked for EVERY block, cast or not, so the first block already throws.
            var data = Build.OneScene(Build.Dialog("D1").WithActors("var1"));
            data.Cards.Add(Build.MakeCard("var1", "kael"));
            var p = Setup(data,
                configure: e => e.OnResolveCharacter(_ => throw new InvalidOperationException("character boom")));

            ExpectClosedByFault(p, () => p.Handle.Start(), "character boom");
        }

        [Fact]
        public void OnSceneEnterThatThrows()
        {
            var p = Setup(Build.OneScene(TwoBlocks()),
                configure: e => e.OnSceneEnter(_ => throw new InvalidOperationException("enter boom")));

            ExpectClosedByFault(p, () => p.Handle.Start(), "enter boom");
        }

        [Fact]
        public void OnSceneExitThatThrowsDoesNotKeepTheSceneForever()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")),
                configure: e => e.OnSceneExit(_ => throw new InvalidOperationException("exit boom")));

            var error = Assert.Throws<InvalidOperationException>(() => p.Handle.Start());
            Assert.Equal("exit boom", error.Message);
            Assert.False(p.Handle.IsRunning());
            Assert.False(p.Engine.IsRunning());
            Assert.Empty(p.Engine.GetActiveScenes());
            p.Engine.Stop();
        }

        // ─── Closing is not re-entrant ───────────────────────────────────

        [Fact]
        public void ACleanupThatCancelsTheSceneDoesNotFireOnSceneExitTwice()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")), hold: new[] { "D1" });
            p.Handle.OnDialogId("D1", args => () => args.Scene.Cancel());
            p.Handle.Start();

            p.Handle.Cancel();

            Assert.Single(p.Exits);
            Assert.False(p.Engine.IsRunning());
        }

        [Fact]
        public void ACleanupThatStopsTheEngineDoesNotFireOnSceneExitTwice()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")), hold: new[] { "D1" });
            p.Handle.OnDialogId("D1", args => () => p.Engine.Stop());
            p.Handle.Start();

            p.Engine.Stop();

            Assert.Single(p.Exits);
            Assert.False(p.Engine.IsRunning());
        }

        // ─── 2. The stack does not grow with the graph ───────────────────

        private const int Passes = 10_000;

        private static (Played, Func<int>) ConditionLoop(bool withBeforeBlock)
        {
            int counter = 0;
            var p = Setup(Build.OneScene(
                    Build.Condition("C", Build.Case("out", new List<ConditionTest> { Build.Test("game", "counter", Passes) }))
                        .Wire("A", "out").Wire("END", "default"),
                    Build.Action("A").Wire("C", "then"),
                    Build.Dialog("END")),
                configure: e =>
                {
                    e.OnResolveCondition(_ => counter < Passes);
                    e.OnAction(args => { counter++; args.Context.Resolve(); args.Next(); });
                    if (withBeforeBlock) e.OnBeforeBlock(args => args.Resolve());
                });
            p.Handle.Start();
            return (p, () => counter);
        }

        [Fact]
        public void AConditionActionLoopOfTenThousandPasses()
        {
            var (p, counter) = ConditionLoop(false);
            Assert.Equal(Passes, counter());
            Assert.Single(p.Exits);
        }

        [Fact]
        public void TheSameLoopWithAnOnBeforeBlockThatResolvesAtOnce()
        {
            var (p, counter) = ConditionLoop(true);
            Assert.Equal(Passes, counter());
            Assert.Single(p.Exits);
        }

        [Fact]
        public void AQueueOfTenThousandWiresWalkedInTurn()
        {
            var blocks = new List<BlueprintBlock>();
            var first = Build.Dialog("A");
            blocks.Add(first);
            for (int i = 0; i < Passes; i++)
            {
                first.Wire("Q" + i);
                blocks.Add(Build.Dialog("Q" + i));
            }
            var p = Setup(Build.OneScene(blocks.ToArray()));
            p.Handle.Start();

            Assert.Equal(Passes + 1, p.Cleaned.Count);
            Assert.Single(p.Exits);
        }

        [Fact]
        public void ARouterLoopOfTenThousandPasses()
        {
            int counter = 0;
            var p = Setup(Build.OneScene(
                    Build.Router("R", Build.Case("K1", new List<ConditionTest> { Build.Test("game", "counter", Passes) }))
                        .Wire("A", "K1").Wire("END", "catch"),
                    Build.Action("A").Wire("R", "then"),
                    Build.Dialog("END")),
                configure: e =>
                {
                    e.OnResolveCondition(_ => counter < Passes);
                    e.OnAction(args => { counter++; args.Context.Resolve(); args.Next(); });
                });
            p.Handle.Start();

            Assert.Equal(Passes, counter);
            Assert.Single(p.Exits);
        }

        // ─── 4. A deadlock closes the scene, whichever track parks last ──

        [Fact]
        public void ASingleTrackParkedOnABlockThatExistsButIsNeverReachedClosesTheScene()
        {
            var p = Setup(Build.OneScene(
                Build.Dialog("D1").Wire("D2"), WaitsFor(Build.Dialog("D2"), "NEVER"), Build.Dialog("NEVER")));
            p.Handle.Start();

            Assert.False(p.Handle.IsRunning());
            Assert.False(p.Engine.IsRunning());
            Assert.Single(p.Exits);
            Assert.Equal(SceneEndReason.Deadlocked, p.Exits[0].Reason);
            Assert.Equal(new List<string> { "NEVER" }, p.Exits[0].WaitingFor);
        }

        [Fact]
        public void TwoTracksWaitingForEachOtherTheMainFlowParkingLastCloseTheScene()
        {
            var p = Setup(Build.OneScene(
                Build.Dialog("D1").Wire("A").Wire("M"),
                WaitsFor(Async(Build.Dialog("A")), "M"),
                WaitsFor(Build.Dialog("M"), "A")));
            p.Handle.Start();

            Assert.False(p.Handle.IsRunning());
            Assert.Single(p.Exits);
            Assert.Equal(SceneEndReason.Deadlocked, p.Exits[0].Reason);
            Assert.Equal(new List<string> { "M", "A" }, p.Exits[0].WaitingFor);
        }

        [Fact]
        public void ATrackParkedWhileAnotherStillRunsIsNotADeadlock()
        {
            var p = Setup(Build.OneScene(
                    Build.Dialog("D1").Wire("J").Wire("BG"), WaitsFor(Build.Dialog("J"), "BG"), Async(Build.Dialog("BG"))),
                hold: new[] { "BG" });
            p.Handle.Start();

            Assert.True(p.Handle.IsRunning());
            Assert.Empty(p.Exits);
        }

        // ─── 5. Why the scene ended ──────────────────────────────────────

        [Fact]
        public void OnSceneExitIsToldCompleted()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")));
            p.Handle.Start();
            Assert.Equal(SceneEndReason.Completed, Assert.Single(p.Exits).Reason);
        }

        [Fact]
        public void OnSceneExitIsToldCancelledByTheHandle()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")), hold: new[] { "D1" });
            p.Handle.Start();
            p.Handle.Cancel();
            Assert.Equal(SceneEndReason.Cancelled, Assert.Single(p.Exits).Reason);
        }

        [Fact]
        public void OnSceneExitIsToldCancelledByEngineStop()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")), hold: new[] { "D1" });
            p.Handle.Start();
            p.Engine.Stop();
            Assert.Equal(SceneEndReason.Cancelled, Assert.Single(p.Exits).Reason);
        }

        [Fact]
        public void OnSceneExitIsToldInvalidatedWhenTheGameRefusesTheNextBlock()
        {
            var p = Setup(Build.OneScene(TwoBlocks()),
                configure: e => e.OnValidateNextBlock(args => new ValidationResult { Valid = args.NextBlock.Id != "D2" }));
            p.Handle.Start();
            Assert.Equal(SceneEndReason.Invalidated, Assert.Single(p.Exits).Reason);
        }

        [Fact]
        public void OnSceneEnterIsNotToldAReason()
        {
            var entered = new List<SceneContext>();
            var p = Setup(Build.OneScene(Build.Dialog("D1")), hold: new[] { "D1" },
                configure: e => e.OnSceneEnter(a => entered.Add(a.Context)));
            p.Handle.Start();
            Assert.Null(Assert.Single(entered).Reason);
        }

        // ─── The thread the scene was started on ─────────────────────────

        [Fact]
        public void NextFromAnotherThreadIsRefusedAndConsumesNothing()
        {
            var p = Setup(Build.OneScene(TwoBlocks()), hold: new[] { "D1", "D2" });
            p.Handle.Start();

            Exception? caught = null;
            var worker = new Thread(() =>
            {
                try { p.Held["D1"](); }
                catch (Exception err) { caught = err; }
            });
            worker.Start();
            worker.Join();

            var error = Assert.IsType<InvalidOperationException>(caught);
            Assert.Contains("thread", error.Message);
            Assert.True(p.Handle.IsRunning());
            Assert.Equal("D1", p.Handle.GetCurrentBlock()?.Id);

            // The refused call consumed nothing: the same Next(), from the right thread, still advances.
            p.Held["D1"]();
            Assert.Equal("D2", p.Handle.GetCurrentBlock()?.Id);
        }

        [Fact]
        public void CancelFromAnotherThreadIsRefused()
        {
            var p = Setup(Build.OneScene(Build.Dialog("D1")), hold: new[] { "D1" });
            p.Handle.Start();

            Exception? caught = null;
            var worker = new Thread(() =>
            {
                try { p.Handle.Cancel(); }
                catch (Exception err) { caught = err; }
            });
            worker.Start();
            worker.Join();

            Assert.IsType<InvalidOperationException>(caught);
            Assert.True(p.Handle.IsRunning());
            Assert.Empty(p.Exits);
        }
    }
}

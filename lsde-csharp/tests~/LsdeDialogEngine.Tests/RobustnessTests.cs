// LSDE Dialog Engine — Robustness tests (C# port of robustness.test.ts)
//
// Every case here is something a game integration does by accident: a coroutine that resolves
// twice, a Resolve() kept past the end of the scene, a NOTE block a designer wired back on itself,
// a handler that throws.
//
// The engine cannot prevent any of these. It can only refuse to make them worse — and, since the
// v2 work, refuse to hide them: an exception now reaches the game instead of vanishing.
//
// The NOTE case matters most in C#: before the walk kept a `seen` set, a self-wired NOTE recursed
// until the stack gave out, and a StackOverflowException is not catchable in .NET. A designer's
// stray wire did not fail a scene — it killed the whole Unity process.

using System;
using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class RobustnessTests
    {
        private static void RegisterAllHandlers(DialogueEngine engine)
        {
            engine.OnDialog(args => { args.Next(); });
            engine.OnChoice(args =>
            {
                if (args.Context.Options.Count > 0) args.Context.SelectChoice(args.Context.Options[0].Id);
                args.Next();
            });
            engine.OnCondition(args => { args.Next(); });
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
        }

        private static DialogueEngine Ready(BlueprintExport data)
        {
            var engine = new DialogueEngine();
            var report = engine.Init(new InitOptions { Data = data });
            Assert.Empty(report.Errors);
            RegisterAllHandlers(engine);
            return engine;
        }

        // ─── onBeforeBlock Resolve() called twice ────────────────────────────

        [Fact]
        public void SecondResolveDoesNotRunTheBlockHandlerTwice()
        {
            var dispatched = new List<string>();
            var engine = Ready(Build.OneScene(
                Build.Dialog("b1").Wire("b2"),
                Build.Dialog("b2")));

            engine.OnBeforeBlock(args =>
            {
                args.Resolve();
                args.Resolve(); // a double-fired coroutine, or a retry — must be ignored
            });
            engine.OnDialog(args => { dispatched.Add(args.Block.Id); args.Next(); });

            engine.Scene("s1").Start();

            Assert.Equal(new List<string> { "b1", "b2" }, dispatched);
        }

        // ─── A stale Resolve() must not restart a finished scene ─────────────

        [Fact]
        public void ResolveAfterTheSceneEndedDoesNotReviveIt()
        {
            var dispatched = new List<string>();
            var stale = new List<Action>();
            int exits = 0;

            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            engine.OnSceneExit(_ => exits++);
            engine.OnBeforeBlock(args => { stale.Add(args.Resolve); args.Resolve(); });
            engine.OnDialog(args => { dispatched.Add(args.Block.Id); args.Next(); });

            var handle = engine.Scene("s1");
            handle.Start();

            Assert.False(handle.IsRunning());
            Assert.Single(dispatched);

            // The game's UI kept the Resolve() from a delay it never cancelled.
            foreach (var resolve in stale) resolve();

            Assert.Single(dispatched);
            Assert.Equal(1, exits);
        }

        [Fact]
        public void ResolveAfterCancelDoesNotDispatch()
        {
            var dispatched = new List<string>();
            var stale = new List<Action>();

            var engine = Ready(Build.OneScene(
                Build.Dialog("b1").Wire("b2"),
                Build.Dialog("b2")));

            engine.OnBeforeBlock(args => stale.Add(args.Resolve));
            engine.OnDialog(args => { dispatched.Add(args.Block.Id); args.Next(); });

            var handle = engine.Scene("s1");
            handle.Start();
            handle.Cancel();

            foreach (var resolve in stale) resolve();

            Assert.Empty(dispatched);
        }

        // ─── A NOTE wired back on itself ─────────────────────────────────────

        [Fact]
        public void NoteWiredToItselfEndsTheSceneInsteadOfKillingTheProcess()
        {
            var engine = Ready(Build.OneScene(Build.Note("n1").Wire("n1")));
            var handle = engine.Scene("s1");

            handle.Start();

            Assert.False(handle.IsRunning());
        }

        [Fact]
        public void TwoNotesWiredInALoopEndTheScene()
        {
            var engine = Ready(Build.OneScene(
                Build.Note("n1").Wire("n2"),
                Build.Note("n2").Wire("n1")));
            var handle = engine.Scene("s1");

            handle.Start();

            Assert.False(handle.IsRunning());
        }

        [Fact]
        public void ANoteChainStillReachesTheRealBlockBehindIt()
        {
            var dispatched = new List<string>();
            var engine = Ready(Build.OneScene(
                Build.Note("n1").Wire("n2"),
                Build.Note("n2").Wire("b1"),
                Build.Dialog("b1")));

            engine.OnDialog(args => { dispatched.Add(args.Block.Id); args.Next(); });
            engine.Scene("s1").Start();

            Assert.Equal(new List<string> { "b1" }, dispatched);
        }

        // ─── A handler that throws ───────────────────────────────────────────

        [Fact]
        public void AnExceptionInAHandlerReachesTheCaller()
        {
            // v1 swallowed this one, silently, while an exception from the cleanup that same
            // handler returned reached the caller. One fault, two opposite behaviours.
            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            engine.OnDialog(_ => throw new InvalidOperationException("game blew up"));

            var handle = engine.Scene("s1");

            var error = Assert.Throws<InvalidOperationException>(() => handle.Start());
            Assert.Equal("game blew up", error.Message);
        }

        [Fact]
        public void TheSceneIsClosedDownBeforeTheErrorSurfaces()
        {
            // The order is what makes it usable: by the time the game sees the error, the cleanups
            // have run and OnSceneExit has fired. The dialogue stopped properly.
            var events = new List<string>();
            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            engine.OnSceneExit(_ => events.Add("exit"));
            engine.OnDialog(_ => throw new InvalidOperationException("boom"));

            var handle = engine.Scene("s1");

            Assert.Throws<InvalidOperationException>(() => handle.Start());
            Assert.Equal(new List<string> { "exit" }, events);
            Assert.False(handle.IsRunning());
        }

        [Fact]
        public void AnExceptionInACleanupReachesTheCallerToo()
        {
            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            engine.OnDialog(args =>
            {
                args.Next();
                return () => throw new InvalidOperationException("cleanup blew up");
            });

            var handle = engine.Scene("s1");

            var error = Assert.Throws<InvalidOperationException>(() => handle.Start());
            Assert.Equal("cleanup blew up", error.Message);
        }

        // ─── Next() kept for later ───────────────────────────────────────────
        //
        // The normal way a game drives this engine: the handler shows the line, returns, and
        // Next() is called a frame later when the player presses a key. Nothing covered it in any
        // of the four runtimes — and the C++ port was broken, because its next() read its guards
        // off a stack frame that was already gone.

        [Fact]
        public void NextKeptForLaterStillAdvancesTheFlow()
        {
            var seen = new List<string>();
            Action? deferred = null;

            var engine = Ready(Build.OneScene(
                Build.Dialog("b1").Wire("b2"),
                Build.Dialog("b2").Wire("b3"),
                Build.Dialog("b3")));

            engine.OnDialog(args =>
            {
                seen.Add(args.Block.Id);
                if (args.Block.Id == "b1")
                {
                    deferred = args.Next;  // the game waits for the player
                    return null;
                }
                args.Next();
                return null;
            });

            var handle = engine.Scene("s1");
            handle.Start();

            Assert.Equal(new List<string> { "b1" }, seen);
            Assert.True(handle.IsRunning());

            deferred!();

            Assert.Equal(new List<string> { "b1", "b2", "b3" }, seen);
            Assert.False(handle.IsRunning());
        }

        [Fact]
        public void AKeptNextCalledTwiceIsIgnored()
        {
            var seen = new List<string>();
            Action? deferred = null;

            var engine = Ready(Build.OneScene(
                Build.Dialog("b1").Wire("b2"),
                Build.Dialog("b2").Wire("b3"),
                Build.Dialog("b3")));

            engine.OnDialog(args =>
            {
                seen.Add(args.Block.Id);
                if (args.Block.Id == "b1")
                {
                    deferred = args.Next;
                    return null;
                }
                args.Next();
                return null;
            });

            engine.Scene("s1").Start();
            deferred!();
            deferred!();  // a double-fired input event

            Assert.Equal(new List<string> { "b1", "b2", "b3" }, seen);
        }

        // ─── A teardown must finish, whatever throws ─────────────────────────
        //
        // `fault = fault ?? track.Cancel()` reads like an accumulator and is not one: ?? does not
        // evaluate its right side once the left is set. So the FIRST cleanup that threw ended the
        // loop, and every track after it stayed alive with its cleanup unrun. C++ and GDScript had
        // it right; C# and TypeScript did not.

        [Fact]
        public void CancellingASceneRunsEveryTrackCleanupEvenAfterOneThrows()
        {
            var cleaned = new List<string>();
            var engine = Ready(Build.OneScene(
                Build.Dialog("FORK").Wire("MAIN").Wire("SIDE-1").Wire("SIDE-2"),
                Build.Dialog("MAIN"),
                Build.Dialog("SIDE-1").Prop("isAsync", true),
                Build.Dialog("SIDE-2").Prop("isAsync", true)));

            engine.OnDialog(args =>
            {
                if (args.Block.Id == "FORK") { args.Next(); return null; }
                var id = args.Block.Id;
                return () =>
                {
                    cleaned.Add(id);
                    if (id == "MAIN") throw new InvalidOperationException("boom");
                };
            });

            var handle = engine.Scene("s1");
            handle.Start();
            Assert.Equal(2, handle.GetActiveTracks());

            Assert.Throws<InvalidOperationException>(() => handle.Cancel());

            cleaned.Sort();
            Assert.Equal(new List<string> { "MAIN", "SIDE-1", "SIDE-2" }, cleaned);
        }

        [Fact]
        public void StopCancelsEverySceneEvenAfterOneCleanupThrows()
        {
            var engine = new DialogueEngine();
            var data = Build.Blueprint(
                Build.Scene(new List<BlueprintBlock> { Build.Dialog("A") }, "sA"),
                Build.Scene(new List<BlueprintBlock> { Build.Dialog("B") }, "sB"));
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            RegisterAllHandlers(engine);
            engine.OnDialog(args =>
            {
                if (args.Block.Id == "A") return () => throw new InvalidOperationException("boom");
                return null;  // park, holding nothing
            });

            var a = engine.Scene("sA");
            var b = engine.Scene("sB");
            a.Start();
            b.Start();

            Assert.Throws<InvalidOperationException>(() => engine.Stop());

            Assert.False(a.IsRunning());
            Assert.False(b.IsRunning());
            Assert.False(engine.IsRunning());
        }

        // ─── The same scene opened twice ─────────────────────────────────────
        //
        // The registry used to be keyed by the scene REFERENCE, so a second start evicted the
        // first handle and it then played on with nothing able to see or stop it.

        [Fact]
        public void TheSameSceneOpenedTwiceIsTrackedAndStoppedTwice()
        {
            var engine = Ready(Build.OneScene(Build.Dialog("DIALOG-001")));
            engine.OnDialog(_ => null);  // both runs park on their first block

            var first = engine.Scene("s1");
            var second = engine.Scene("s1");
            first.Start();
            second.Start();

            Assert.Equal(2, engine.GetActiveScenes().Count);

            engine.Stop();

            Assert.False(first.IsRunning());
            Assert.False(second.IsRunning());
            Assert.False(engine.IsRunning());
        }
    }
}

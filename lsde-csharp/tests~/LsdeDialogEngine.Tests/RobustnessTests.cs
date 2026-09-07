// LSDE Dialog Engine — Robustness tests (C# port of robustness.test.ts)
//
// Every case here is something a game integration does by accident: a coroutine that
// resolves twice, a Resolve() kept past the end of the scene, a NOTE block a designer
// wired back on itself. The engine cannot prevent any of these; it can only refuse to
// make them worse than they are.

using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class RobustnessTests
    {
        // ─── Helpers ─────────────────────────────────────────────────────────────

        private static BlueprintExport MakeExport(params BlueprintScene[] scenes) =>
            new() { Version = "1.0.0", ExportDate = "2025-01-01", Locales = new List<string> { "en" }, Scenes = scenes.ToList() };

        private static DialogBlock Dialog(string uuid, bool start = false) =>
            new() { Uuid = uuid, Type = BlockType.DIALOG, Properties = new List<BlockProperty>(), IsStartBlock = start };

        private static NoteBlock Note(string uuid, bool start = false) =>
            new() { Uuid = uuid, Type = BlockType.NOTE, Properties = new List<BlockProperty>(), IsStartBlock = start };

        private static BlueprintConnection Conn(string from, string to, string port = "out") =>
            new() { Id = $"{from}-{to}", FromId = from, ToId = to, FromPort = port, ToPort = "in" };

        private static void RegisterAllHandlers(DialogueEngine engine)
        {
            engine.OnDialog(args => { args.Next(); });
            engine.OnChoice(args =>
            {
                if (args.Context.Choices.Count > 0) args.Context.SelectChoice(args.Context.Choices[0].Uuid);
                args.Next();
            });
            engine.OnCondition(args => { args.Context.Resolve(true); args.Next(); });
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
        }

        private static BlueprintScene Scene(List<BlueprintBlock> blocks, List<BlueprintConnection> connections) =>
            new() { Uuid = "s1", Label = "S1", Date = "2025-01-01", Blocks = blocks, Connections = connections };

        // ─── OnBeforeBlock Resolve() called twice ────────────────────────────────

        [Fact]
        public void SecondResolveDoesNotDispatchTheBlockTwice()
        {
            var dispatched = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions
            {
                Data = MakeExport(Scene(
                    new List<BlueprintBlock> { Dialog("b1", start: true), Dialog("b2") },
                    new List<BlueprintConnection> { Conn("b1", "b2") }))
            });

            RegisterAllHandlers(engine);
            engine.OnBeforeBlock(args =>
            {
                args.Resolve();
                args.Resolve(); // a coroutine that resumed twice — must be ignored
            });
            engine.OnDialog(args => { dispatched.Add(args.Block.Uuid); args.Next(); });

            engine.Scene("s1").Start();

            Assert.Equal(new[] { "b1", "b2" }, dispatched);
        }

        // ─── A stale Resolve() must not revive a finished scene ──────────────────

        [Fact]
        public void ResolveAfterTheSceneEndedDoesNotReviveIt()
        {
            var dispatched = new List<string>();
            var stale = new List<Action>();
            var exits = 0;

            var engine = new DialogueEngine();
            engine.Init(new InitOptions
            {
                Data = MakeExport(Scene(
                    new List<BlueprintBlock> { Dialog("b1", start: true) },
                    new List<BlueprintConnection>()))
            });

            RegisterAllHandlers(engine);
            engine.OnSceneExit(_ => exits++);
            engine.OnBeforeBlock(args => { stale.Add(args.Resolve); args.Resolve(); });
            engine.OnDialog(args => { dispatched.Add(args.Block.Uuid); args.Next(); });

            var handle = engine.Scene("s1");
            handle.Start();

            Assert.False(handle.IsRunning());
            Assert.Single(dispatched);

            foreach (var resolve in stale) resolve();

            Assert.Single(dispatched);
            Assert.Equal(1, exits);
        }

        [Fact]
        public void ResolveAfterCancelDoesNotDispatch()
        {
            var dispatched = new List<string>();
            var stale = new List<Action>();

            var engine = new DialogueEngine();
            engine.Init(new InitOptions
            {
                Data = MakeExport(Scene(
                    new List<BlueprintBlock> { Dialog("b1", start: true), Dialog("b2") },
                    new List<BlueprintConnection> { Conn("b1", "b2") }))
            });

            RegisterAllHandlers(engine);
            engine.OnBeforeBlock(args => stale.Add(args.Resolve));
            engine.OnDialog(args => { dispatched.Add(args.Block.Uuid); args.Next(); });

            var handle = engine.Scene("s1");
            handle.Start();
            handle.Cancel();

            foreach (var resolve in stale) resolve();

            Assert.Empty(dispatched);
        }

        // ─── A NOTE wired back on itself ─────────────────────────────────────────

        [Fact]
        public void NoteWiredToItselfEndsTheSceneInsteadOfOverflowingTheStack()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions
            {
                Data = MakeExport(Scene(
                    new List<BlueprintBlock> { Note("n1", start: true) },
                    new List<BlueprintConnection> { Conn("n1", "n1") }))
            });
            RegisterAllHandlers(engine);

            var handle = engine.Scene("s1");
            handle.Start();

            Assert.False(handle.IsRunning());
        }

        [Fact]
        public void TwoNotesWiredInALoopEndTheScene()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions
            {
                Data = MakeExport(Scene(
                    new List<BlueprintBlock> { Note("n1", start: true), Note("n2") },
                    new List<BlueprintConnection> { Conn("n1", "n2"), Conn("n2", "n1") }))
            });
            RegisterAllHandlers(engine);

            var handle = engine.Scene("s1");
            handle.Start();

            Assert.False(handle.IsRunning());
        }

        [Fact]
        public void ANoteChainStillReachesTheRealBlockBehindIt()
        {
            var dispatched = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions
            {
                Data = MakeExport(Scene(
                    new List<BlueprintBlock> { Note("n1", start: true), Note("n2"), Dialog("b1") },
                    new List<BlueprintConnection> { Conn("n1", "n2"), Conn("n2", "b1") }))
            });
            RegisterAllHandlers(engine);
            engine.OnDialog(args => { dispatched.Add(args.Block.Uuid); args.Next(); });

            engine.Scene("s1").Start();

            Assert.Equal(new[] { "b1" }, dispatched);
        }
    }
}

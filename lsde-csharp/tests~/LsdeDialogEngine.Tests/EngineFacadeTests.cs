// LSDE Dialog Engine — the facade (C# port of the "init", "setLocale", "getSceneConnections" and
// "cleanups" suites of engine.test.ts and scene-handle.test.ts)

using System;
using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class EngineFacadeTests
    {
        private static DialogueEngine Ready(BlueprintExport data)
        {
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            engine.OnDialog(args => { args.Next(); });
            engine.OnChoice(args => { args.Next(); });
            engine.OnCondition(args => { args.Next(); });
            engine.OnAction(args => { args.Next(); });
            return engine;
        }

        // ─── GetSceneConnections ─────────────────────────────────────────────

        [Fact]
        public void GetSceneConnectionsReturnsTheWiresInsideASceneEachWithTheBlockItLeaves()
        {
            var engine = Ready(Build.OneScene(
                Build.Dialog("b1").Wire("b2").Wire("b3"),
                Build.Dialog("b2").Wire("b3"),
                Build.Dialog("b3")));

            var wires = engine.GetSceneConnections("s1");

            Assert.Equal(3, wires.Count);
            Assert.Equal("b1", wires[0].From);
            Assert.Equal("b2", wires[0].To);
            Assert.Equal(Ports.Out, wires[0].Port);
            Assert.Equal(Ports.In, wires[0].ToPort);
            Assert.Equal("b2", wires[2].From);
        }

        [Fact]
        public void GetSceneConnectionsReturnsNothingForASceneThatIsNotThere()
        {
            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            Assert.Empty(engine.GetSceneConnections("nowhere"));
        }

        [Fact]
        public void GetSceneConnectionsReturnsNothingBeforeInit()
        {
            Assert.Empty(new DialogueEngine().GetSceneConnections("s1"));
        }

        // ─── SetLocale ───────────────────────────────────────────────────────

        [Fact]
        public void SetLocaleAcceptsALocaleTheProjectDeclares()
        {
            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            var error = Record.Exception(() => engine.SetLocale("en"));
            Assert.Null(error);
            Assert.Equal("en", LsdeUtils.Locale);
        }

        [Fact]
        public void SetLocaleRefusesOneItDoesNotAndListsTheRealOnes()
        {
            var engine = Ready(Build.OneScene(Build.Dialog("b1")));
            var error = Assert.Throws<InvalidOperationException>(() => engine.SetLocale("xx"));
            Assert.Contains("xx", error.Message);
            Assert.Contains("en", error.Message);
        }

        // ─── Init ────────────────────────────────────────────────────────────

        [Fact]
        public void ASecondInitReplacesTheDataCleanly()
        {
            var engine = Ready(Build.Blueprint(Build.Scene(new List<BlueprintBlock> { Build.Dialog("A") }, "sA")));
            Assert.Empty(engine.Init(new InitOptions
            {
                Data = Build.Blueprint(Build.Scene(new List<BlueprintBlock> { Build.Dialog("B") }, "sB")),
            }).Errors);

            Assert.Throws<InvalidOperationException>(() => engine.Scene("sA"));
            Assert.NotNull(engine.Scene("sB"));
        }

        [Fact]
        public void RecoversFromAFailedInit()
        {
            var engine = new DialogueEngine();
            Assert.NotEmpty(engine.Init(new InitOptions { Data = new BlueprintExport { Format = "nope" } }).Errors);
            Assert.Throws<InvalidOperationException>(() => engine.Scene("s1"));

            Assert.Empty(engine.Init(new InitOptions { Data = Build.OneScene(Build.Dialog("b1")) }).Errors);
            Assert.NotNull(engine.Scene("s1"));
        }

        // ─── Cleanups ────────────────────────────────────────────────────────

        [Fact]
        public void RunsTheCleanupWhenLeavingABlockBeforeTheNextOneIsDispatched()
        {
            var log = new List<string>();
            var engine = Ready(Build.OneScene(
                Build.Dialog("A").Wire("B").Wire("C"),
                Build.Dialog("B"),
                Build.Dialog("C")));
            engine.OnDialog(args =>
            {
                var id = args.Block.Id;
                log.Add("dispatch " + id);
                args.Next();
                return () => log.Add("cleanup " + id);
            });

            engine.Scene("s1").Start();

            // Each block is released as the track walks off it — B and C are walked in turn from
            // the queue, and A's cleanup runs before B is dispatched, not when the queue empties.
            Assert.Equal(new List<string>
            {
                "dispatch A", "cleanup A", "dispatch B", "cleanup B", "dispatch C", "cleanup C",
            }, log);
        }
    }
}

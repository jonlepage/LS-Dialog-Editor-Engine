// LSDE Dialog Engine — the three tiers of handlers (C# port of the "handler tiers" and
// "handlers" suites of scene-handle.test.ts and engine.test.ts)
//
//   handle.OnBlock(id) / OnDialogId(id) …        most specific
//     ↓ unless context.PreventGlobalHandler()
//   handle.OnDialog / OnChoice / …               Tier 2 — this scene
//     ↓ unless context.PreventGlobalHandler()
//   engine.OnDialog / OnChoice / …               Tier 1 — global
//
// Without PreventGlobalHandler() both fire in sequence: scene first, then global. These rules were
// implemented in every runtime and pinned by the reference alone.

using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class HandlerTierTests
    {
        private static DialogueEngine Engine(BlueprintExport data)
        {
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            engine.OnChoice(args => { args.Next(); });
            engine.OnCondition(args => { args.Next(); });
            engine.OnAction(args => { args.Next(); });
            return engine;
        }

        private static BlueprintExport TwoLines() => Build.OneScene(
            Build.Dialog("b1").Wire("b2"),
            Build.Dialog("b2"));

        [Fact]
        public void RunsTheSceneHandlerThenTheGlobalOne()
        {
            var order = new List<string>();
            var engine = Engine(Build.OneScene(Build.Dialog("b1")));
            engine.OnDialog(args => { order.Add("global"); args.Next(); });

            var handle = engine.Scene("s1");
            handle.OnDialog(args => { order.Add("scene"); args.Next(); return null; });
            handle.Start();

            Assert.Equal(new List<string> { "scene", "global" }, order);
        }

        [Fact]
        public void PreventGlobalHandlerStopsTheGlobalOne()
        {
            var order = new List<string>();
            var engine = Engine(Build.OneScene(Build.Dialog("b1")));
            engine.OnDialog(args => { order.Add("global"); args.Next(); });

            var handle = engine.Scene("s1");
            handle.OnDialog(args =>
            {
                order.Add("scene");
                args.Context.PreventGlobalHandler();
                args.Next();
                return null;
            });
            handle.Start();

            Assert.Equal(new List<string> { "scene" }, order);
        }

        [Fact]
        public void OnBlockBeatsTheSceneTypeHandler()
        {
            var order = new List<string>();
            var engine = Engine(TwoLines());
            engine.OnDialog(args => { order.Add("global:" + args.Block.Id); args.Next(); });

            var handle = engine.Scene("s1");
            handle.OnDialog(args => { order.Add("scene:" + args.Block.Id); args.Next(); return null; });
            handle.OnBlock("b1", args => { order.Add("block:" + args.Block.Id); args.Next(); return null; });
            handle.Start();

            // On b1 the block override IS the scene tier; the scene type handler does not run.
            Assert.Equal(new List<string> { "block:b1", "global:b1", "scene:b2", "global:b2" }, order);
        }

        [Fact]
        public void OnDialogIdTargetsOneBlockByIdWithATypedContext()
        {
            var hits = new List<string>();
            var engine = Engine(TwoLines());
            engine.OnDialog(args => { args.Next(); });

            var handle = engine.Scene("s1");
            handle.OnDialogId("b2", args =>
            {
                // Typed: an IDialogContext, with ResolveCharacterPort on it.
                IDialogContext ctx = args.Context;
                Assert.NotNull(ctx);
                hits.Add(args.Block.Id);
                args.Next();
                return null;
            });
            handle.Start();

            Assert.Equal(new List<string> { "b2" }, hits);
        }

        [Fact]
        public void TheLastRegistrationWins()
        {
            var order = new List<string>();
            var engine = Engine(Build.OneScene(Build.Dialog("b1")));
            engine.OnDialog(args => { order.Add("first"); args.Next(); });
            engine.OnDialog(args => { order.Add("second"); args.Next(); });

            engine.Scene("s1").Start();

            Assert.Equal(new List<string> { "second" }, order);
        }

        [Fact]
        public void Tier2OnEnterAndOnExitOverrideTheGlobalOnes()
        {
            var fired = new List<string>();
            var engine = Engine(Build.OneScene(Build.Dialog("b1")));
            engine.OnDialog(args => { args.Next(); });
            engine.OnSceneEnter(_ => fired.Add("global-enter"));
            engine.OnSceneExit(_ => fired.Add("global-exit"));

            var handle = engine.Scene("s1");
            handle.OnEnter(_ => fired.Add("scene-enter"));
            handle.OnExit(_ => fired.Add("scene-exit"));
            handle.Start();

            // An override, not a cascade: the global lifecycle hooks do not fire for this scene.
            Assert.Equal(new List<string> { "scene-enter", "scene-exit" }, fired);
        }
    }
}

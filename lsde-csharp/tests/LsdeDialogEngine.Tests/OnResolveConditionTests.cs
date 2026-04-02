// LSDE Dialog Engine — Integration tests for OnResolveCondition (C# port of engine.test.ts §onResolveCondition)

using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class OnResolveConditionTests
    {
        // ─── Helpers ─────────────────────────────────────────────────────────────

        private static BlueprintExport MakeExport(params BlueprintScene[] scenes) =>
            new() { Version = "1.0.0", ExportDate = "2025-01-01", Locales = new List<string> { "en" }, Scenes = scenes.ToList() };

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

        // ─── Shared Blueprints ──────────────────────────────────────────────────

        /// <summary>Single-group condition scene: COND → yes (portIndex 0) / no (portIndex 1).</summary>
        private static BlueprintScene CondScene() => new()
        {
            Uuid = "scene-rc", Label = "ResolveCondition", Date = "2025-01-01",
            Blocks = new List<BlueprintBlock>
            {
                new ConditionBlock
                {
                    Uuid = "cond1", Type = BlockType.CONDITION, Properties = new List<BlockProperty>(), IsStartBlock = true,
                    Conditions = new List<List<ExportCondition>>
                    {
                        new() { new ExportCondition { Uuid = "c1", Key = "flag", Operator = "=", Value = "true" } }
                    }
                },
                new DialogBlock { Uuid = "yes", Type = BlockType.DIALOG, Properties = new List<BlockProperty>() },
                new DialogBlock { Uuid = "no", Type = BlockType.DIALOG, Properties = new List<BlockProperty>() },
            },
            Connections = new List<BlueprintConnection>
            {
                new() { Id = "ct", FromId = "cond1", ToId = "yes", FromPort = "true", ToPort = "in", FromPortIndex = 0 },
                new() { Id = "cf", FromId = "cond1", ToId = "no", FromPort = "false", ToPort = "in", FromPortIndex = 1 },
            },
        };

        /// <summary>Multi-group switch scene: COND(2 groups) → case0 / case1 / default.</summary>
        private static BlueprintScene SwitchScene(string uuid = "scene-sw") => new()
        {
            Uuid = uuid, Label = "Switch", Date = "2025-01-01",
            Blocks = new List<BlueprintBlock>
            {
                new ConditionBlock
                {
                    Uuid = "cond", Type = BlockType.CONDITION, Properties = new List<BlockProperty>(), IsStartBlock = true,
                    Conditions = new List<List<ExportCondition>>
                    {
                        new() { new ExportCondition { Uuid = "c1", Key = "x", Operator = "=", Value = "1" } },
                        new() { new ExportCondition { Uuid = "c2", Key = "y", Operator = "=", Value = "2" } },
                    }
                },
                new DialogBlock { Uuid = "case0", Type = BlockType.DIALOG, Properties = new List<BlockProperty>() },
                new DialogBlock { Uuid = "case1", Type = BlockType.DIALOG, Properties = new List<BlockProperty>() },
                new DialogBlock { Uuid = "default", Type = BlockType.DIALOG, Properties = new List<BlockProperty>() },
            },
            Connections = new List<BlueprintConnection>
            {
                new() { Id = "s0", FromId = "cond", ToId = "case0", FromPort = "case_0", ToPort = "in", FromPortIndex = 0 },
                new() { Id = "s1", FromId = "cond", ToId = "case1", FromPort = "case_1", ToPort = "in", FromPortIndex = 1 },
                new() { Id = "sd", FromId = "cond", ToId = "default", FromPort = "default", ToPort = "in", FromPortIndex = 2 },
            },
        };

        /// <summary>Dispatcher scene: enableDispatcher=true, targets isAsync=true.</summary>
        private static BlueprintScene DispatchScene() => new()
        {
            Uuid = "scene-disp", Label = "Dispatch", Date = "2025-01-01",
            Blocks = new List<BlueprintBlock>
            {
                new ConditionBlock
                {
                    Uuid = "cond", Type = BlockType.CONDITION, Properties = new List<BlockProperty>(), IsStartBlock = true,
                    NativeProperties = new NativeProperties { EnableDispatcher = true },
                    Conditions = new List<List<ExportCondition>>
                    {
                        new() { new ExportCondition { Uuid = "c1", Key = "a", Operator = "=", Value = "1" } },
                        new() { new ExportCondition { Uuid = "c2", Key = "b", Operator = "=", Value = "2" } },
                    }
                },
                new DialogBlock { Uuid = "async0", Type = BlockType.DIALOG, Properties = new List<BlockProperty>(), NativeProperties = new NativeProperties { IsAsync = true } },
                new DialogBlock { Uuid = "async1", Type = BlockType.DIALOG, Properties = new List<BlockProperty>(), NativeProperties = new NativeProperties { IsAsync = true } },
                new DialogBlock { Uuid = "main", Type = BlockType.DIALOG, Properties = new List<BlockProperty>() },
            },
            Connections = new List<BlueprintConnection>
            {
                new() { Id = "d0", FromId = "cond", ToId = "async0", FromPort = "case_0", ToPort = "in", FromPortIndex = 0 },
                new() { Id = "d1", FromId = "cond", ToId = "async1", FromPort = "case_1", ToPort = "in", FromPortIndex = 1 },
                new() { Id = "dd", FromId = "cond", ToId = "main", FromPort = "default", ToPort = "in", FromPortIndex = 2 },
            },
        };

        // ─── P0: onCondition optionnel quand resolver installe ──────────────────

        [Fact]
        public void Start_DoesNotThrow_WhenOnConditionOmittedButOnResolveConditionInstalled()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(_ => true);
            engine.OnDialog(args => args.Next());
            engine.OnChoice(args => args.Next());
            // NO engine.OnCondition()
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            var ex = Record.Exception(() => engine.Scene("scene-rc").Start());
            Assert.Null(ex);
        }

        [Fact]
        public void Start_Throws_WhenNeitherOnConditionNorOnResolveConditionInstalled()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnDialog(args => args.Next());
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            Assert.Throws<InvalidOperationException>(() => engine.Scene("scene-rc").Start());
        }

        // ─── P0: Auto-resolve sans resolve() ───────────────────────────────────

        [Fact]
        public void AutoResolves_WhenHandlerDoesNotCallResolve()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(_ => true); // flag=true → group matches → portIndex 0 → 'yes'
            engine.OnCondition(args => args.Next()); // no resolve() call
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-rc").Start();
            Assert.Equal(new List<string> { "yes" }, visited);
        }

        [Fact]
        public void AutoResolves_ToDefaultWhenNoGroupMatches()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(_ => false); // flag=false → no match → portIndex -1 → 'false' port
            engine.OnCondition(args => args.Next());
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-rc").Start();
            Assert.Equal(new List<string> { "no" }, visited);
        }

        [Fact]
        public void AutoResolves_WithoutOnConditionHandlerAtAll()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(_ => true);
            // No OnCondition registered — engine routes automatically
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-rc").Start();
            Assert.Equal(new List<string> { "yes" }, visited);
        }

        // ─── P0: pre-evaluated conditionGroups ──────────────────────────────────

        [Fact]
        public void Handler_ReceivesPreEvaluatedConditionGroups()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(_ => true);

            IReadOnlyList<RuntimeConditionGroup>? receivedGroups = null;
            engine.OnCondition(args =>
            {
                receivedGroups = args.Context.ConditionGroups;
                args.Next();
            });
            engine.OnDialog(args => args.Next());
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-rc").Start();

            Assert.NotNull(receivedGroups);
            Assert.Single(receivedGroups!);
            Assert.Equal(0, receivedGroups![0].PortIndex);
            Assert.True(receivedGroups![0].Result);
        }

        [Fact]
        public void Handler_CanOverrideAutoResolveWithExplicitResolve()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(_ => true); // would auto-route to 'yes'
            engine.OnCondition(args =>
            {
                args.Context.Resolve(false); // override → route to 'no' instead
                args.Next();
            });
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-rc").Start();
            Assert.Equal(new List<string> { "no" }, visited);
        }

        // ─── P1: Switch mode integration ────────────────────────────────────────

        [Fact]
        public void SwitchMode_RoutesToMatchingCasePort()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(SwitchScene()) });
            // x != 1 (false), y == 2 (true) → case_1 matches
            engine.OnResolveCondition(c => c.Key == "y");
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-sw").Start();
            Assert.Equal(new List<string> { "case1" }, visited);
        }

        [Fact]
        public void SwitchMode_RoutesToDefaultWhenNoCaseMatches()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(SwitchScene("scene-sw2")) });
            engine.OnResolveCondition(_ => false); // nothing matches
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-sw2").Start();
            Assert.Equal(new List<string> { "default" }, visited);
        }

        // ─── P1: Dispatcher mode integration ────────────────────────────────────

        [Fact]
        public void DispatcherMode_SpawnsAsyncTracksForMatchedCases()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(DispatchScene()) });
            engine.OnResolveCondition(_ => true); // both match
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-disp").Start();
            // main (default) + async0 + async1 — all 3 should be visited
            visited.Sort();
            Assert.Equal(new List<string> { "async0", "async1", "main" }, visited);
        }

        // ─── P1: evaluateCondition() uses resolver ──────────────────────────────

        [Fact]
        public void EvaluateCondition_UsesOnResolveConditionForNonChoiceConditions()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            engine.OnResolveCondition(c => c.Key == "flag");
            RegisterAllHandlers(engine);

            var handle = engine.Scene("scene-rc");
            bool? evalResult = null;
            handle.OnCondition(args =>
            {
                evalResult = args.Scene.EvaluateCondition(new ExportCondition { Uuid = "t", Key = "flag", Operator = "=", Value = "" });
                args.Next();
                return null;
            });
            handle.Start();
            Assert.True(evalResult);
        }

        [Fact]
        public void EvaluateCondition_ReturnsFalseWithoutResolver()
        {
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
            RegisterAllHandlers(engine);

            var handle = engine.Scene("scene-rc");
            bool? evalResult = null;
            handle.OnCondition(args =>
            {
                evalResult = args.Scene.EvaluateCondition(new ExportCondition { Uuid = "t", Key = "flag", Operator = "=", Value = "" });
                args.Context.Resolve(true);
                args.Next();
                return null;
            });
            handle.Start();
            Assert.False(evalResult);
        }

        // ─── P1: setChoiceFilter backward compat alias ──────────────────────────

        [Fact]
        public void SetChoiceFilter_StillWorksAsAliasForOnResolveCondition()
        {
            var visited = new List<string>();
            var engine = new DialogueEngine();
            engine.Init(new InitOptions { Data = MakeExport(CondScene()) });
#pragma warning disable CS0618 // Obsolete
            engine.SetChoiceFilter(_ => true); // alias
#pragma warning restore CS0618
            engine.OnDialog(args => { visited.Add(args.Block.Uuid); args.Next(); });
            engine.OnChoice(args => args.Next());
            // No OnCondition — should auto-resolve via SetChoiceFilter alias
            engine.OnAction(args => { args.Context.Resolve(); args.Next(); });
            engine.Scene("scene-rc").Start();
            Assert.Equal(new List<string> { "yes" }, visited);
        }
    }
}

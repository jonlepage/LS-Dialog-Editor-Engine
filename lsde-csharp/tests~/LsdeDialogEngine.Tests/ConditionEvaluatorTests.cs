// LSDE Dialog Engine — Unit tests for ConditionEvaluator (C# port of condition-evaluator.test.ts)

using System;
using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class ConditionEvaluatorTests
    {
        // ─── Helpers ─────────────────────────────────────────────────────────────

        private static ExportCondition Cond(string key, string? chain = null) =>
            new() { Uuid = key, Key = key, Operator = "=", Value = "true", Chain = chain };

        /// <summary>Returns true if key starts with 't', false otherwise.</summary>
        private static bool Evaluator(ExportCondition c) => c.Key.StartsWith("t");

        // ─── evaluateConditionChain ──────────────────────────────────────────────

        [Fact]
        public void Chain_EmptyConditions_ReturnsTrue()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(new List<ExportCondition>(), Evaluator));
        }

        [Fact]
        public void Chain_SingleCondition_ReturnsEvaluatorResult()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(new List<ExportCondition> { Cond("true1") }, Evaluator));
            Assert.False(ConditionEvaluator.EvaluateConditionChain(new List<ExportCondition> { Cond("false1") }, Evaluator));
        }

        [Fact]
        public void Chain_And_TrueAndTrue_ReturnsTrue()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(
                new List<ExportCondition> { Cond("true1"), Cond("true2", "&") }, Evaluator));
        }

        [Fact]
        public void Chain_And_TrueAndFalse_ReturnsFalse()
        {
            Assert.False(ConditionEvaluator.EvaluateConditionChain(
                new List<ExportCondition> { Cond("true1"), Cond("false1", "&") }, Evaluator));
        }

        [Fact]
        public void Chain_Or_FalseOrTrue_ReturnsTrue()
        {
            Assert.True(ConditionEvaluator.EvaluateConditionChain(
                new List<ExportCondition> { Cond("false1"), Cond("true1", "|") }, Evaluator));
        }

        [Fact]
        public void Chain_Or_FalseOrFalse_ReturnsFalse()
        {
            Assert.False(ConditionEvaluator.EvaluateConditionChain(
                new List<ExportCondition> { Cond("false1"), Cond("false2", "|") }, Evaluator));
        }

        [Fact]
        public void Chain_LeftToRight_TrueAndFalseOrTrue_ReturnsTrue()
        {
            // (true AND false) OR true = true — no operator precedence
            Assert.True(ConditionEvaluator.EvaluateConditionChain(
                new List<ExportCondition> { Cond("true1"), Cond("false1", "&"), Cond("true2", "|") }, Evaluator));
        }

        [Fact]
        public void Chain_DefaultsToAndWhenChainUndefined()
        {
            // No chain on 2nd condition → defaults to AND
            Assert.False(ConditionEvaluator.EvaluateConditionChain(
                new List<ExportCondition> { Cond("true1"), Cond("false1") }, Evaluator));
        }

        // ─── evaluateConditionGroups — switch mode ───────────────────────────────

        [Fact]
        public void Groups_Switch_EmptyGroups_ReturnsMinusOne()
        {
            Assert.Equal(-1, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>(), Evaluator));
        }

        [Fact]
        public void Groups_Switch_SingleGroupMatch_ReturnsZero()
        {
            Assert.Equal(0, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>> { new() { Cond("true1") } }, Evaluator));
        }

        [Fact]
        public void Groups_Switch_SingleGroupNoMatch_ReturnsMinusOne()
        {
            Assert.Equal(-1, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>> { new() { Cond("false1") } }, Evaluator));
        }

        [Fact]
        public void Groups_Switch_FirstOfTwoMatches_ReturnsZero()
        {
            Assert.Equal(0, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("true1") },
                    new() { Cond("true2") },
                }, Evaluator));
        }

        [Fact]
        public void Groups_Switch_SecondOfTwoMatches_ReturnsOne()
        {
            Assert.Equal(1, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("false1") },
                    new() { Cond("true1") },
                }, Evaluator));
        }

        [Fact]
        public void Groups_Switch_NoneMatch_ReturnsMinusOne()
        {
            Assert.Equal(-1, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("false1") },
                    new() { Cond("false2") },
                }, Evaluator));
        }

        [Fact]
        public void Groups_Switch_EvaluatesChainsWithinGroups()
        {
            // Group 0: false AND true → false, Group 1: true → true → returns 1
            Assert.Equal(1, ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("false1"), Cond("true1", "&") },
                    new() { Cond("true2") },
                }, Evaluator));
        }

        // ─── evaluateConditionGroups — dispatcher mode ───────────────────────────

        [Fact]
        public void Groups_Dispatcher_EmptyGroups_ReturnsEmptyList()
        {
            var result = (List<int>)ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>(), Evaluator, dispatcher: true);
            Assert.Empty(result);
        }

        [Fact]
        public void Groups_Dispatcher_BothMatch_ReturnsBothIndices()
        {
            var result = (List<int>)ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("true1") },
                    new() { Cond("true2") },
                }, Evaluator, dispatcher: true);
            Assert.Equal(new List<int> { 0, 1 }, result);
        }

        [Fact]
        public void Groups_Dispatcher_NoneMatch_ReturnsEmptyList()
        {
            var result = (List<int>)ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("false1") },
                    new() { Cond("false2") },
                }, Evaluator, dispatcher: true);
            Assert.Empty(result);
        }

        [Fact]
        public void Groups_Dispatcher_PartialMatch_ReturnsMatchedIndices()
        {
            // 3 groups: 1st+3rd match → [0, 2]
            var result = (List<int>)ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>>
                {
                    new() { Cond("true1") },
                    new() { Cond("false1") },
                    new() { Cond("true2") },
                }, Evaluator, dispatcher: true);
            Assert.Equal(new List<int> { 0, 2 }, result);
        }

        [Fact]
        public void Groups_Dispatcher_SingleGroupMatch_ReturnsListWithZero()
        {
            var result = (List<int>)ConditionEvaluator.EvaluateConditionGroups(
                new List<List<ExportCondition>> { new() { Cond("true1") } },
                Evaluator, dispatcher: true);
            Assert.Equal(new List<int> { 0 }, result);
        }

        // ─── filterVisibleChoices ────────────────────────────────────────────────

        [Fact]
        public void Filter_KeepsChoicesWithNoVisibilityConditions()
        {
            var choices = new List<ChoiceItem>
            {
                new() { Uuid = "c1", StructureKey = "c1" },
                new() { Uuid = "c2", StructureKey = "c2" },
            };
            Assert.Equal(2, ConditionEvaluator.FilterVisibleChoices(choices, Evaluator).Count);
        }

        [Fact]
        public void Filter_KeepsChoicesWithEmptyVisibilityConditions()
        {
            var choices = new List<ChoiceItem>
            {
                new() { Uuid = "c1", StructureKey = "c1", VisibilityConditions = new List<ExportCondition>() },
            };
            Assert.Single(ConditionEvaluator.FilterVisibleChoices(choices, Evaluator));
        }

        [Fact]
        public void Filter_FiltersOutChoicesWithFailingConditions()
        {
            var choices = new List<ChoiceItem>
            {
                new() { Uuid = "visible", StructureKey = "v", VisibilityConditions = new List<ExportCondition> { Cond("true1") } },
                new() { Uuid = "hidden", StructureKey = "h", VisibilityConditions = new List<ExportCondition> { Cond("false1") } },
            };
            var visible = ConditionEvaluator.FilterVisibleChoices(choices, Evaluator);
            Assert.Single(visible);
            Assert.Equal("visible", visible[0].Uuid);
        }

        [Fact]
        public void Filter_EvaluatesChainedConditionsOnChoices()
        {
            // false OR true = true → kept
            var choices = new List<ChoiceItem>
            {
                new()
                {
                    Uuid = "c1", StructureKey = "c1",
                    VisibilityConditions = new List<ExportCondition> { Cond("false1"), Cond("true1", "|") },
                },
            };
            Assert.Single(ConditionEvaluator.FilterVisibleChoices(choices, Evaluator));
        }
    }
}

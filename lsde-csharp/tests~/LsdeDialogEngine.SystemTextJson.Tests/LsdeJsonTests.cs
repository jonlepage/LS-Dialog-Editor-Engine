using System.IO;
using System.Linq;
using Xunit;
using LsdeDialogEngine;
using LsdeDialogEngine.Json;

namespace LsdeDialogEngine.SystemTextJson.Tests
{
    public class LsdeJsonTests
    {
        private static string LoadBlueprint()
            => File.ReadAllText("blueprint.json");

        [Fact]
        public void Parse_ReturnsNonNullBlueprint()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            Assert.NotNull(blueprint);
        }

        [Fact]
        public void Parse_HasScenes()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            Assert.True(blueprint.Scenes.Count > 0, "Expected at least one scene");
        }

        [Fact]
        public void Parse_HasBlocks()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var scene = blueprint.Scenes[0];
            Assert.True(scene.Blocks.Count > 0, "Expected at least one block");
        }

        [Fact]
        public void Parse_HasConnections()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var scene = blueprint.Scenes[0];
            Assert.True(scene.Connections.Count > 0, "Expected at least one connection");
        }

        [Fact]
        public void Parse_PolymorphicBlocks_DialogBlock()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var dialog = blueprint.Scenes[0].Blocks.FirstOrDefault(b => b.Type == BlockType.DIALOG);
            Assert.NotNull(dialog);
            Assert.IsType<DialogBlock>(dialog);
        }

        [Fact]
        public void Parse_PolymorphicBlocks_ChoiceBlock()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var choice = blueprint.Scenes[0].Blocks.FirstOrDefault(b => b.Type == BlockType.CHOICE);
            Assert.NotNull(choice);
            Assert.IsType<ChoiceBlock>(choice);
            Assert.True(((ChoiceBlock)choice).Choices?.Count > 0, "ChoiceBlock should have choices");
        }

        [Fact]
        public void Parse_PolymorphicBlocks_ConditionBlock()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var cond = blueprint.Scenes[0].Blocks.FirstOrDefault(b => b.Type == BlockType.CONDITION);
            Assert.NotNull(cond);
            Assert.IsType<ConditionBlock>(cond);
        }

        [Fact]
        public void Parse_ConditionBlock_Has2DConditions()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var cond = blueprint.Scenes[0].Blocks.FirstOrDefault(b => b.Type == BlockType.CONDITION) as ConditionBlock;
            Assert.NotNull(cond);
            Assert.NotNull(cond!.Conditions);
            Assert.True(cond.Conditions!.Count > 0, "Should have condition groups");
            Assert.True(cond.Conditions[0].Count > 0, "First group should have conditions");
            Assert.False(string.IsNullOrEmpty(cond.Conditions[0][0].Key), "Condition should have a key");
        }

        [Fact]
        public void Parse_PolymorphicBlocks_ActionBlock()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var action = blueprint.Scenes[0].Blocks.FirstOrDefault(b => b.Type == BlockType.ACTION);
            Assert.NotNull(action);
            Assert.IsType<ActionBlock>(action);
            Assert.True(((ActionBlock)action).Actions?.Count > 0, "ActionBlock should have actions");
        }

        [Fact]
        public void Parse_InitEngine_NoErrors()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var engine = new DialogueEngine();
            var report = engine.Init(new InitOptions { Data = blueprint });
            Assert.Empty(report.Errors);
        }

        [Fact]
        public void Options_ArePreconfigured()
        {
            var options = LsdeJson.Options;
            Assert.NotNull(options);
            Assert.True(options.Converters.Count >= 2, "Should have at least BlueprintBlockConverter and BlockPropertyValueConverter");
        }
    }
}

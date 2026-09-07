using System.IO;
using System.Linq;
using Xunit;
using LsdeDialogEngine;
using LsdeDialogEngine.Json;

namespace LsdeDialogEngine.SystemTextJson.Tests
{
    /// <summary>
    /// Reads the real LSDE v2 export off disk, with the loader a game would use.
    /// <para>The polymorphic block converter is gone — v2 has ONE Block whose optional fields
    /// depend on its Type, so there is nothing left to dispatch on while reading.</para>
    /// </summary>
    public class LsdeJsonTests
    {
        private static string LoadBlueprint()
            => File.ReadAllText("Engine-Conformance-Scene.blueprints.json");

        [Fact]
        public void ParsesTheHeader()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());

            Assert.Equal("lsde-blueprints", blueprint.Format);
            Assert.Equal(1, blueprint.Version);
            Assert.Equal("LSDE", blueprint.Generator?.App);
            Assert.Equal("en", blueprint.ReferenceLocale);
            Assert.Equal(new[] { "en", "fr", "es" }, blueprint.Locales);
        }

        [Fact]
        public void ParsesTheHeaderTables()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());

            Assert.Equal(4, blueprint.Dictionaries.Count);
            Assert.Equal(8, blueprint.Functions.Count);
            Assert.Equal(14, blueprint.Cards.Count);
            Assert.Equal("kael", blueprint.Cards[0].Name);
        }

        [Fact]
        public void ParsesTheScenes()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());

            Assert.Equal(2, blueprint.Scenes.Count);
            Assert.Equal("reactor_breach", blueprint.Scenes[0].Scene);
            Assert.StartsWith("sc_", blueprint.Scenes[0].Id);
            Assert.Equal("ACTION-001", blueprint.Scenes[0].Start);
            Assert.Equal(18, blueprint.Scenes[0].Blocks.Count);
        }

        [Fact]
        public void ParsesWiresOffTheBlocksThatCarryThem()
        {
            // There is no connection table in v2: a block lists its own outgoing links.
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var action = blueprint.Scenes[0].Blocks.First(b => b.Id == "ACTION-001");

            Assert.NotNull(action.Next);
            Assert.Equal(new[] { "then", "catch" }, action.Next!.Select(l => l.Port));
            Assert.Equal("in", action.Next[0].ToPort);
        }

        [Fact]
        public void ParsesBlockTypesAsLowercaseStrings()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var types = blueprint.Scenes[0].Blocks.Select(b => b.Type).Distinct().ToList();

            Assert.Contains(BlockType.Dialog, types);
            Assert.Contains(BlockType.Choice, types);
            Assert.Contains(BlockType.Condition, types);
            Assert.Contains(BlockType.Action, types);
            Assert.Contains(BlockType.Note, types);
        }

        [Fact]
        public void ParsesActorsAndEmotionAsCardIds()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var dialog = blueprint.Scenes[0].Blocks.First(b => b.Id == "DIALOG-001");

            Assert.Equal(new[] { "var2" }, dialog.Actors);
            Assert.Equal("var9", dialog.Emotion);
            Assert.Equal(45, dialog.Intensity);
        }

        [Fact]
        public void ParsesTheInlineTextWithoutTouchingIt()
        {
            // The engine hands the RAW string over. Markers inside it belong to the game.
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var dialog = blueprint.Scenes[0].Blocks.First(b => b.Id == "DIALOG-001");

            Assert.NotNull(dialog.Text);
            Assert.Contains("No sound", dialog.Text!["en"]);
        }

        [Fact]
        public void ParsesThePropsBagWithItsMixedValueTypes()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var choice = blueprint.Scenes[0].Blocks.First(b => b.Id == "CHOICE-001");

            Assert.NotNull(choice.Props);
            Assert.True(choice.Props!.ContainsKey("typewriterSpeed"));
            Assert.True(choice.Props.ContainsKey("boxShake"));
        }

        [Fact]
        public void ParsesTheOptionsOfAChoice()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var choice = blueprint.Scenes[0].Blocks.First(b => b.Id == "CHOICE-001");

            Assert.NotNull(choice.Options);
            Assert.Equal(new[] { "C1", "C2", "C3", "C4" }, choice.Options!.Select(o => o.Id));
            Assert.NotNull(choice.Options[2].When);
        }

        [Fact]
        public void ParsesTheCasesOfACondition()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var condition = blueprint.Scenes[0].Blocks.First(b => b.Id == "COND-001");

            Assert.NotNull(condition.Cases);
            Assert.Equal(new[] { "K1", "K2", "K3" }, condition.Cases!.Select(c => c.Port));
            // The last case has no `when` at all: always true, and it shadows nothing below it.
            Assert.Null(condition.Cases[2].When);
        }

        [Fact]
        public void ParsesTheCallsOfAnAction()
        {
            var blueprint = LsdeJson.Parse(LoadBlueprint());
            var action = blueprint.Scenes[0].Blocks.First(b => b.Id == "ACTION-001");

            Assert.NotNull(action.Calls);
            Assert.Equal("play_music", action.Calls![0].Fn);
            Assert.True(action.Calls[0].Args.ContainsKey("track"));
        }

        [Fact]
        public void ThePayloadItParsesLoadsWithNoError()
        {
            var report = new DialogueEngine().Init(
                new InitOptions { Data = LsdeJson.Parse(LoadBlueprint()) });

            Assert.Empty(report.Errors);
            Assert.Empty(report.Warnings);
        }
    }
}

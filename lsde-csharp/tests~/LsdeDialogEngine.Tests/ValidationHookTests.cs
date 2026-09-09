// LSDE Dialog Engine — OnValidateNextBlock and OnBeforeBlock (C# port of the "onValidateNextBlock"
// and "onBeforeBlock" suites of scene-handle.test.ts)
//
// The gate is asked about the RESOLVED character of the block about to run, and told about the
// one just left. The character comes from OnResolveCharacter, before the gate is invoked; a block
// that cites no actor has none.

using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class ValidationHookTests
    {
        private static DialogueEngine Engine(BlueprintExport data)
        {
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            engine.OnDialog(args => { args.Next(); });
            engine.OnChoice(args => { args.Next(); });
            engine.OnCondition(args => { args.Next(); });
            engine.OnAction(args => { args.Next(); });
            return engine;
        }

        private static BlueprintExport WithCast()
        {
            var data = Build.Blueprint(Build.Scene(new List<BlueprintBlock>
            {
                Build.Dialog("b1").WithActors("c1").Wire("b2"),
                Build.Dialog("b2"),
            }));
            data.Cards = new List<Card> { Build.MakeCard("c1", "kael") };
            return data;
        }

        [Fact]
        public void OnValidateNextBlockReceivesTheResolvedCharacterOfTheNextBlock()
        {
            var seen = new List<string?>();
            var engine = Engine(WithCast());
            engine.OnValidateNextBlock(args =>
            {
                seen.Add(args.NextContext.Character?.Id);
                return ValidationResult.Ok();
            });

            engine.Scene("s1").Start();

            // b1 cites c1; b2 cites nobody.
            Assert.Equal(new List<string?> { "c1", null }, seen);
        }

        [Fact]
        public void FromContextIsNullOnTheFirstBlock()
        {
            var fromBlocks = new List<string?>();
            var fromContexts = new List<bool>();
            var engine = Engine(WithCast());
            engine.OnValidateNextBlock(args =>
            {
                fromBlocks.Add(args.FromBlock?.Id);
                fromContexts.Add(args.FromContext != null);
                return ValidationResult.Ok();
            });

            engine.Scene("s1").Start();

            Assert.Equal(new List<string?> { null, "b1" }, fromBlocks);
            Assert.Equal(new List<bool> { false, true }, fromContexts);
        }

        [Fact]
        public void FromContextCarriesTheCharacterOfTheBlockJustLeft()
        {
            var fromCharacters = new List<string?>();
            var engine = Engine(WithCast());
            engine.OnValidateNextBlock(args =>
            {
                if (args.FromContext != null) fromCharacters.Add(args.FromContext.Character?.Id);
                return ValidationResult.Ok();
            });

            engine.Scene("s1").Start();

            Assert.Equal(new List<string?> { "c1" }, fromCharacters);
        }

        [Fact]
        public void OnBeforeBlockHandsOverTheNativePropertiesReadOutOfProps()
        {
            NativeProperties? natives = null;
            var engine = Engine(Build.OneScene(
                Build.Dialog("b1").Prop("delay", 250).Prop("timeout", 5000).Prop("waitInput", true)
                    .Prop("portraitSide", "left")));
            engine.OnBeforeBlock(args =>
            {
                natives = args.Context.NativeProperties;
                args.Resolve();
            });

            engine.Scene("s1").Start();

            Assert.NotNull(natives);
            Assert.Equal(250, natives!.Delay);
            Assert.Equal(5000, natives.Timeout);
            Assert.True(natives.WaitInput);
            Assert.Null(natives.IsAsync);
        }
    }
}

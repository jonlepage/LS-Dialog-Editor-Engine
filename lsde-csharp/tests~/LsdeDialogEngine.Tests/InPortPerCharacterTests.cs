// LSDE Dialog Engine — inPortPerCharacter (C# port of in-port-per-character.test.ts)
//
// The wire names the actor, and BOTH places that ask the game about a character must be told
// which one: the handler's context, and the OnValidateNextBlock gate. Passing the entry port to
// only one of them is not a cosmetic slip — a game gating on "is this character here?" was
// answered about whichever actor the whole cast produced, which for a resolver written as
// `actors => actors[0]` is the FIRST one, every single pass.

using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class InPortPerCharacterTests
    {
        private static List<ConditionTest> When(string entry)
            => new() { Build.Test("party", entry, true) };

        private static readonly List<Card> Cards = new()
        {
            Build.MakeCard("l1", "bran"), Build.MakeCard("l2", "ada"),
        };

        /// <summary>A router whose two routes reach the SAME block through two entry ports.</summary>
        private static BlueprintExport Payload()
        {
            var router = Build.Router("ROUTER-001", Build.Case("K1", When("l1")), Build.Case("K2", When("l2")))
                .WireTo("DIALOG-009", "K1", "l1")
                .WireTo("DIALOG-009", "K2", "l2");
            var line = Build.Dialog("DIALOG-009").WithActors("l1", "l2")
                .Prop("isAsync", true).Prop("inPortPerCharacter", true);

            var data = Build.Blueprint(Build.Scene(new List<BlueprintBlock> { router, line }, start: "ROUTER-001"));
            data.Cards = Cards;
            return data;
        }

        private static DialogueEngine Engine(BlueprintExport data)
        {
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            engine.OnResolveCondition(_ => true);
            engine.OnResolveCharacter(actors => actors.Count > 0 ? actors[0] : null);
            engine.OnChoice(args => { args.Next(); });
            engine.OnAction(args => { args.Next(); });
            return engine;
        }

        [Fact]
        public void OffersTheWiredActorToOnValidateNextBlockAndToTheHandler()
        {
            var gate = new List<string?>();
            var spoke = new List<string?>();

            var engine = Engine(Payload());
            engine.OnValidateNextBlock(args =>
            {
                if (args.NextBlock.Id == "DIALOG-009") gate.Add(args.NextContext.Character?.Id);
                return ValidationResult.Ok();
            });
            engine.OnDialog(args => { spoke.Add(args.Context.Character?.Id); args.Next(); });

            engine.Scene("s1").Start();

            Assert.Equal(new List<string?> { "l1", "l2" }, spoke);
            Assert.Equal(new List<string?> { "l1", "l2" }, gate);
        }

        [Fact]
        public void TheCastStaysWholeOnlyTheCharacterFollowsTheDoor()
        {
            var casts = new List<int>();
            var engine = Engine(Payload());
            engine.OnDialog(args => { casts.Add(args.Context.Actors.Count); args.Next(); });

            engine.Scene("s1").Start();

            // `Actors` is the list posted on the block, unchanged by the door.
            Assert.Equal(new List<int> { 2, 2 }, casts);
        }

        [Fact]
        public void EnteringThroughInNamesNobodyAndOffersTheWholeCast()
        {
            var offered = new List<int>();
            var spoke = new List<string?>();

            var data = Build.Blueprint(Build.Scene(new List<BlueprintBlock>
            {
                Build.Dialog("DIALOG-001").Wire("DIALOG-009"),
                Build.Dialog("DIALOG-009").WithActors("l1", "l2").Prop("inPortPerCharacter", true),
            }));
            data.Cards = Cards;

            var engine = Engine(data);
            engine.OnResolveCharacter(actors => { offered.Add(actors.Count); return actors.Count > 0 ? actors[0] : null; });
            engine.OnDialog(args => { spoke.Add(args.Context.Character?.Id); args.Next(); });

            engine.Scene("s1").Start();

            // DIALOG-001 cites nobody (0 offered); DIALOG-009 was entered through "in", so the
            // whole cast (2) is offered and the default picks the first.
            Assert.Equal(new List<int> { 0, 2 }, offered);
            Assert.Equal(new List<string?> { null, "l1" }, spoke);
        }

        [Fact]
        public void TheGameMayAnswerThatTheCharacterDoesNotExist()
        {
            var spoke = new List<string?>();
            var engine = Engine(Payload());
            engine.OnResolveCharacter(_ => null);
            engine.OnDialog(args => { spoke.Add(args.Context.Character?.Id); args.Next(); });

            engine.Scene("s1").Start();

            // The engine ASKS; it never decides on its own. Both passes still play.
            Assert.Equal(new List<string?> { null, null }, spoke);
        }
    }
}

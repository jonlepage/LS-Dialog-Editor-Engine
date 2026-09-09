// LSDE Dialog Engine — LsdeUtils (C# port of lsde-utils.test.ts and utils.test.ts)
//
// Static helpers a game calls, never hooks the engine calls: naming a block, reading a line out of
// an inline text map or out of a separate locale file, and sorting a Props bag into what the engine
// acts on and what belongs to the game.

using System;
using System.Collections.Generic;
using Xunit;

// LsdeUtils.Locale is process-wide static state, written by every engine.SetLocale() — the
// cross-language runner included. Two test classes racing on it would make "throws when no locale
// was ever set" flicker, so this assembly runs its classes one after the other. The whole suite is
// a few hundred milliseconds; parallelism bought nothing here.
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace LsdeDialogEngine.Tests
{
    public class LsdeUtilsTests
    {
        public LsdeUtilsTests()
        {
            LsdeUtils.Locale = null;
        }

        // ─── Naming a block ──────────────────────────────────────────────────

        [Fact]
        public void UsesTheLabelWhenAnExportCarriesOne()
        {
            var block = Build.Dialog("DIALOG-007");
            block.Label = "Vesk speaks";
            block.Note = "a note too";
            Assert.Equal("Vesk speaks", LsdeUtils.GetBlockLabel(block));
        }

        [Fact]
        public void FallsBackToTheDesignerNoteWhichSaysMoreThanANameWould()
        {
            var block = Build.Dialog("DIALOG-007");
            block.Note = "Vesk se cache derrière le réservoir.";
            Assert.Equal("Vesk se cache derrière le réservoir.", LsdeUtils.GetBlockLabel(block));
        }

        [Fact]
        public void FallsBackToTheIdWhichIsAlreadyReadable()
        {
            Assert.Equal("DIALOG-007", LsdeUtils.GetBlockLabel(Build.Dialog("DIALOG-007")));
        }

        // ─── Inline texts ────────────────────────────────────────────────────

        private static readonly Dictionary<string, string> Line = new()
        {
            ["en"] = "Hello", ["fr"] = "Bonjour",
        };

        [Fact]
        public void PicksTheLocaleTheEngineWasSetTo()
        {
            LsdeUtils.Locale = "fr";
            Assert.Equal("Bonjour", LsdeUtils.GetLocalizedText(Line));
        }

        [Fact]
        public void TakesALocaleOverride()
        {
            LsdeUtils.Locale = "fr";
            Assert.Equal("Hello", LsdeUtils.GetLocalizedText(Line, "en"));
        }

        [Fact]
        public void ReturnsNothingForALocaleTheTextDoesNotCarry()
        {
            Assert.Null(LsdeUtils.GetLocalizedText(Line, "de"));
        }

        [Fact]
        public void ReturnsNothingWhenTheBlockCarriesNoTextAtAll()
        {
            Assert.Null(LsdeUtils.GetLocalizedText(null, "en"));
        }

        [Fact]
        public void ThrowsWhenNoLocaleWasEverSet()
        {
            Assert.Throws<InvalidOperationException>(() => LsdeUtils.GetLocalizedText(Line));
        }

        [Fact]
        public void HandsTheStringOverUntouchedMarkersAndAll()
        {
            // {{@a1}}, {:a2}, {{#ui.hud.label}} are the GAME's markers, in the game's own keys.
            // The engine reads structure, never the content of a text.
            var raw = new Dictionary<string, string> { ["en"] = "{{@a1}} says {:a2} — {{#ui.hud.label}}" };
            Assert.Equal("{{@a1}} says {:a2} — {{#ui.hud.label}}", LsdeUtils.GetLocalizedText(raw, "en"));
        }

        // ─── Texts kept in a separate locale file ────────────────────────────

        private static readonly Dictionary<string, Dictionary<string, object>> Table = new()
        {
            ["reactor_breach"] = new Dictionary<string, object>
            {
                ["DIALOG-001"] = "Sealed.",
                ["CHOICE-001"] = new Dictionary<string, string> { ["C1"] = "Open it", ["C2"] = "Leave" },
            },
        };

        [Fact]
        public void ReadsALineBySceneAndBlock()
        {
            Assert.Equal("Sealed.", LsdeUtils.GetTextFromTable(Table, "reactor_breach", "DIALOG-001"));
        }

        [Fact]
        public void ReadsOneOptionOfAChoice()
        {
            Assert.Equal("Leave", LsdeUtils.GetTextFromTable(Table, "reactor_breach", "CHOICE-001", "C2"));
        }

        [Fact]
        public void ReturnsNothingForASceneBlockOrOptionThatIsNotThere()
        {
            Assert.Null(LsdeUtils.GetTextFromTable(Table, "nowhere", "DIALOG-001"));
            Assert.Null(LsdeUtils.GetTextFromTable(Table, "reactor_breach", "DIALOG-999"));
            Assert.Null(LsdeUtils.GetTextFromTable(Table, "reactor_breach", "CHOICE-001", "C9"));
        }

        [Fact]
        public void DoesNotHandBackTheBlockLineWhenAnOptionWasAskedFor()
        {
            Assert.Null(LsdeUtils.GetTextFromTable(Table, "reactor_breach", "DIALOG-001", "C1"));
        }

        [Fact]
        public void DoesNotHandBackAnOptionMapWhenTheLineWasAskedFor()
        {
            Assert.Null(LsdeUtils.GetTextFromTable(Table, "reactor_breach", "CHOICE-001"));
        }

        [Fact]
        public void SurvivesATableThatWasNeverLoaded()
        {
            Assert.Null(LsdeUtils.GetTextFromTable(null, "reactor_breach", "DIALOG-001"));
        }

        [Fact]
        public void BuildsTheKeyOfABlockAndOfOneOfItsOptions()
        {
            var block = Build.Choice("CHOICE-001");
            Assert.Equal("__blueprints__.s1.CHOICE-001", LsdeUtils.GetTextKey(block));
            Assert.Equal("__blueprints__.s1.CHOICE-001.C1", LsdeUtils.GetTextKey(block, "C1"));
        }

        // ─── Sorting the props bag ───────────────────────────────────────────

        private static BlueprintBlock Mixed() => Build.Dialog("DIALOG-001")
            .Prop("isAsync", true).Prop("delay", 1000).Prop("timeout", 5000).Prop("debug", true)
            .Prop("portraitSide", "left").Prop("typewriterSpeed", 60).Prop("journalEntry", "note de scène");

        [Fact]
        public void PullsOutWhatTheEngineActsOn()
        {
            var natives = LsdeUtils.GetNativeProperties(Mixed());
            Assert.True(natives.IsAsync);
            Assert.Equal(1000, natives.Delay);
            Assert.Equal(5000, natives.Timeout);
            Assert.True(natives.Debug);
            Assert.Null(natives.WaitInput);
            Assert.Null(natives.WaitForBlocks);
        }

        [Fact]
        public void LeavesTheDesignerTheirOwnProperties()
        {
            var custom = LsdeUtils.GetCustomProperties(Mixed());
            Assert.Equal(3, custom.Count);
            Assert.Equal("left", custom["portraitSide"]);
            Assert.Equal(60, custom["typewriterSpeed"]);
            Assert.Equal("note de scène", custom["journalEntry"]);
        }

        [Fact]
        public void HandlesABlockWithNoPropsAtAll()
        {
            Assert.Null(LsdeUtils.GetNativeProperties(Build.Dialog("DIALOG-002")).IsAsync);
            Assert.Empty(LsdeUtils.GetCustomProperties(Build.Dialog("DIALOG-002")));
        }

        [Fact]
        public void KnowsWaitForBlocksIsANativeEvenThoughItHoldsAList()
        {
            var waiting = Build.Dialog("DIALOG-003").Prop("waitForBlocks", new List<string> { "DIALOG-012" });
            Assert.Equal(new List<string> { "DIALOG-012" }, LsdeUtils.GetNativeProperties(waiting).WaitForBlocks);
            Assert.Empty(LsdeUtils.GetCustomProperties(waiting));
        }

        [Fact]
        public void KnowsTheTenNativesAndNothingElse()
        {
            var all = Build.Dialog("DIALOG-004")
                .Prop("isAsync", true).Prop("delay", 1).Prop("timeout", 2).Prop("waitInput", true)
                .Prop("debug", true).Prop("portPerCharacter", true).Prop("inPortPerCharacter", true)
                .Prop("skipIfMissingActor", true).Prop("portPerCase", true)
                .Prop("waitForBlocks", new List<string> { "X" })
                .Prop("somethingElse", "mine");

            var natives = LsdeUtils.GetNativeProperties(all);
            Assert.True(natives.IsAsync);
            Assert.Equal(1, natives.Delay);
            Assert.Equal(2, natives.Timeout);
            Assert.True(natives.WaitInput);
            Assert.True(natives.Debug);
            Assert.True(natives.PortPerCharacter);
            Assert.True(natives.InPortPerCharacter);
            Assert.True(natives.SkipIfMissingActor);
            Assert.True(natives.PortPerCase);
            Assert.Equal(new List<string> { "X" }, natives.WaitForBlocks);

            Assert.Equal(10, NativePropertyIds.All.Length);
            var custom = LsdeUtils.GetCustomProperties(all);
            Assert.Single(custom);
            Assert.Equal("mine", custom["somethingElse"]);
        }

        // ─── Condition helpers ───────────────────────────────────────────────

        [Fact]
        public void RecognisesATestThatReadsAPastAnswer()
        {
            Assert.True(LsdeUtils.IsChoiceCondition(Build.ChoiceTest("CHOICE-001", "C1")));
            Assert.False(LsdeUtils.IsChoiceCondition(Build.Test("switches", "door_unlocked", true)));
        }

        [Fact]
        public void NamesTheChoiceBlockAChoiceTestReads()
        {
            Assert.Equal("CHOICE-001", LsdeUtils.GetChoiceConditionBlockId(Build.ChoiceTest("CHOICE-001", "C1")));
            Assert.Null(LsdeUtils.GetChoiceConditionBlockId(Build.Test("switches", "x", true)));
        }

        [Fact]
        public void ReExposesTheEvaluationHelpers()
        {
            Func<ConditionTest, bool> always = _ => true;
            var cases = new List<ConditionCase> { Build.Case("K1") };
            Assert.True(LsdeUtils.EvaluateConditionChain(null, always));
            Assert.Equal("K1", LsdeUtils.EvaluateConditionCases(cases, true, always));
            Assert.Equal(new List<bool> { true }, LsdeUtils.EvaluateEachCase(cases, always));
            Assert.True(LsdeUtils.TagOptionVisibility(new List<Option> { Build.Opt("C1") }, always)[0].Visible);
        }

        [Fact]
        public void ReExposesTheRouterReadingOfTheSameCases()
        {
            // Every true case, then the continuation LAST: then when they all held, catch otherwise.
            var cases = new List<ConditionCase> { Build.Case("K1"), Build.Case("K2") };
            Assert.Equal(new List<string> { "K1", "K2", Ports.Then },
                LsdeUtils.PickRouterPorts(cases, new List<bool> { true, true }));
            Assert.Equal(new List<string> { "K1", Ports.Catch },
                LsdeUtils.PickRouterPorts(cases, new List<bool> { true, false }));
            Assert.Equal(new List<string> { Ports.Then },
                LsdeUtils.PickRouterPorts(new List<ConditionCase>(), new List<bool>()));
        }

        // ─── Type guards ─────────────────────────────────────────────────────

        [Fact]
        public void TheGuardsNarrowByTheLowercaseTypeName()
        {
            Assert.True(LsdeUtils.IsDialogBlock(Build.Dialog("DIALOG-001")));
            Assert.True(LsdeUtils.IsChoiceBlock(Build.Choice("CHOICE-001")));
            Assert.True(LsdeUtils.IsConditionBlock(Build.Condition("COND-001")));
            Assert.True(LsdeUtils.IsRouterBlock(Build.Router("ROUTER-001")));
            Assert.True(LsdeUtils.IsActionBlock(Build.Action("ACTION-001")));
            Assert.True(LsdeUtils.IsNoteBlock(Build.Note("NOTE-001")));

            // A router carries the same cases as a condition and is NOT one.
            Assert.False(LsdeUtils.IsConditionBlock(Build.Router("ROUTER-001")));
            Assert.False(LsdeUtils.IsRouterBlock(Build.Condition("COND-001")));
            Assert.False(LsdeUtils.IsDialogBlock(Build.Choice("CHOICE-001")));
        }

        [Fact]
        public void MatchesNoGuardForAV1UppercaseType()
        {
            var v1 = Build.Dialog("DIALOG-001");
            v1.Type = "DIALOG";
            Assert.False(LsdeUtils.IsDialogBlock(v1));
            Assert.False(LsdeUtils.IsNoteBlock(v1));
        }
    }
}

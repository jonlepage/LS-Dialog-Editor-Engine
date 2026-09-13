// LSDE Dialog Engine — a null in an export never makes Init() throw
//
// Newtonsoft (NullValueHandling.Include, its default) and System.Text.Json both hand a JSON null over
// as a null string, whatever the property's initializer says. Init() threw ArgumentNullException on
// several of them: a condition test whose Dict or Entry was null, a parameter whose Name was null — and,
// from the graph, a function, dictionary, card or block whose Id was null. From the one function whose
// job is to refuse a payload and say why. The TypeScript reference warns instead, and so does this
// runtime now.
//
// The shared spec pins the same cases in all four runtimes (null-names-in-blocks,
// null-ids-in-the-header). A null block id and a null block list live here only: GDScript reads those
// two into typed variables.

using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class NullFieldsTests
    {
        private static DiagnosticReport InitWith(BlueprintExport data)
            => new DialogueEngine().Init(new InitOptions { Data = data });

        private static List<string> Codes(List<DiagnosticEntry> entries)
            => entries.Select(e => e.Code).ToList();

        private static BlueprintBlock ConditionTesting(ConditionTest test)
            => Build.Condition("COND-001", Build.Case("out", new List<ConditionTest> { test }));

        [Fact]
        public void ADictNullIsAnUndeclaredDictionary()
        {
            var report = InitWith(Build.OneScene(ConditionTesting(Build.Test(null!, "door_unlocked", true))));

            Assert.Empty(report.Errors);
            Assert.Equal(new List<string> { "UNDECLARED_DICTIONARY" }, Codes(report.Warnings));
        }

        [Fact]
        public void AnEntryNullInAChoiceTestNamesNoChoiceBlock()
        {
            var report = InitWith(Build.OneScene(ConditionTesting(Build.ChoiceTest(null!, "C1"))));

            Assert.Empty(report.Errors);
            Assert.Equal(new List<string> { "UNKNOWN_CHOICE_BLOCK" }, Codes(report.Warnings));
        }

        [Fact]
        public void AParameterNameNullDeclaresNoArgument()
        {
            var call = Build.Call("with_unnamed_param");
            call.Args["value"] = "x";
            var data = Build.OneScene(Build.Action("ACTION-001", call));
            data.Functions.Add(new FunctionDefinition
            {
                Id = "with_unnamed_param",
                Params = new List<FunctionParameter> { new FunctionParameter { Name = null!, Type = ValueType.String } },
            });

            var report = InitWith(data);

            Assert.Empty(report.Errors);
            Assert.Equal(new List<string> { "UNDECLARED_ARGUMENT" }, Codes(report.Warnings));
        }

        [Fact]
        public void NullIdsInTheHeaderLoad()
        {
            var data = Build.OneScene(Build.Dialog("DIALOG-001"));
            data.Functions.Add(new FunctionDefinition { Id = null! });
            data.Dictionaries.Add(new DictionaryDefinition { Id = null!, ValueType = "boolean", Entries = new List<string> { "x" } });
            data.Cards.Add(Build.MakeCard(null!, "ghost"));

            var report = InitWith(data);

            Assert.Empty(report.Errors);
            Assert.Empty(report.Warnings);
        }

        [Fact]
        public void ABlockIdNullLoads()
        {
            var report = InitWith(Build.OneScene(Build.Dialog("DIALOG-001"), Build.Dialog(null!)));

            Assert.Empty(report.Errors);
            Assert.Empty(report.Warnings);
        }

        [Fact]
        public void BlocksNullLoadsAsASceneThatCannotPlay()
        {
            var data = Build.OneScene(Build.Dialog("DIALOG-001"));
            data.Scenes[0].Blocks = null!;
            data.Scenes[0].Start = null;

            var report = InitWith(data);

            Assert.Empty(report.Errors);
            Assert.Equal(new List<string> { "NO_START_BLOCK" }, Codes(report.Warnings));
        }

        [Fact]
        public void InPlayAChoiceTestWithAnEntryNullIsAnswered()
        {
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = Build.OneScene(Build.Dialog("DIALOG-001")) }).Errors);
            var scene = engine.Scene("s1");

            // The answers a CHOICE block that was never reached gives: false for equals, true for notEquals.
            Assert.False(scene.EvaluateCondition(Build.ChoiceTest(null!, "C1")));
            Assert.True(scene.EvaluateCondition(Build.ChoiceTest(null!, "C1", ConditionOperator.NotEquals)));
        }
    }
}

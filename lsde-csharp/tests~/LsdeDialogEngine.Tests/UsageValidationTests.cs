// LSDE Dialog Engine — Init() checks what the BLOCKS use (C# port of usage-validation.test.ts)
//
// The codes themselves are pinned in all four runtimes by the shared spec (test-init-validation.json).
// What only a native test can pin is WHERE a warning points and WHAT it names: a Unity integrator
// reading "UNDECLARED_FUNCTION" in the console needs the scene, the block and the function id — the
// v1 id that had loaded without a word is exactly what must be in the message.

using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class UsageValidationTests
    {
        private static BlueprintExport ExportWith(params BlueprintBlock[] blocks)
        {
            var data = Build.OneScene(blocks);
            data.Functions.Add(new FunctionDefinition
            {
                Id = "play_music",
                Params = new List<FunctionParameter> { new FunctionParameter { Name = "track", Type = ValueType.String } },
            });
            data.Dictionaries.Add(new DictionaryDefinition
            {
                Id = "switches",
                ValueType = LiteralValueTypeBoolean,
                Entries = new List<string> { "door_unlocked" },
            });
            return data;
        }

        private const string LiteralValueTypeBoolean = "boolean";

        private static List<DiagnosticEntry> WarningsOf(params BlueprintBlock[] blocks)
        {
            var report = new DialogueEngine().Init(new InitOptions { Data = ExportWith(blocks) });
            Assert.Empty(report.Errors);
            return report.Warnings;
        }

        private static BlueprintBlock ActionCalling(string fn, Dictionary<string, object> args)
        {
            var call = Build.Call(fn);
            call.Args = args;
            return Build.Action("ACTION-001", call);
        }

        [Fact]
        public void AnUndeclaredFunctionIsNamedAndLocated()
        {
            var warnings = WarningsOf(ActionCalling("f3b1c2d4-v1-uuid", new Dictionary<string, object> { ["track"] = "theme" }));

            var warning = Assert.Single(warnings);
            Assert.Equal("UNDECLARED_FUNCTION", warning.Code);
            Assert.Equal("sc_s1", warning.SceneId);
            Assert.Equal("s1", warning.ScenePath);
            Assert.Equal("ACTION-001", warning.BlockId);
            Assert.Contains("f3b1c2d4-v1-uuid", warning.Message);
        }

        [Fact]
        public void AnUndeclaredArgumentIsNamed()
        {
            var warnings = WarningsOf(ActionCalling("play_music", new Dictionary<string, object> { ["track"] = "theme", ["volume"] = 3.0 }));

            var warning = Assert.Single(warnings);
            Assert.Equal("UNDECLARED_ARGUMENT", warning.Code);
            Assert.Contains("volume", warning.Message);
        }

        [Fact]
        public void AnUndeclaredEntryIsNamed()
        {
            var warnings = WarningsOf(Build.Condition("COND-001",
                Build.Case("out", new List<ConditionTest> { Build.Test("switches", "door_open", true) })));

            var warning = Assert.Single(warnings);
            Assert.Equal("UNDECLARED_ENTRY", warning.Code);
            Assert.Equal("COND-001", warning.BlockId);
            Assert.Contains("door_open", warning.Message);
        }

        [Fact]
        public void DeclaredUsageWarnsAboutNothing()
        {
            Assert.Empty(WarningsOf(
                ActionCalling("play_music", new Dictionary<string, object> { ["track"] = "theme" }),
                Build.Condition("COND-001",
                    Build.Case("out", new List<ConditionTest> { Build.Test("switches", "door_unlocked", true) }))));
        }
    }
}

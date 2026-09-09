// Cross-language conformance runner — reads the shared JSON specs and drives the C# engine.
//
// tests/*.json is the contract: the same input, the same expected output, for all four runtimes.
// The TypeScript runner is the reference this one is written against. A behaviour that only holds
// in one runtime is a divergence waiting to be found by a player.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Xunit;
using LsdeDialogEngine.Json;

namespace LsdeDialogEngine.Tests
{
    internal static class TestLoader
    {
        private static readonly JsonSerializerOptions JsonOptions = CreateOptions();

        private static JsonSerializerOptions CreateOptions()
        {
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            options.Converters.Add(new LooseValueConverter());
            // Same tolerance as the shipped loader: a v1 payload wrote "version": "1.0.0", and the
            // parse has to survive long enough for the validator to refuse it BY NAME.
            options.Converters.Add(new TolerantVersionConverter());
            return options;
        }

        internal static TestFile LoadTestFile(string filename)
        {
            var path = FindTestsDirectory();
            var raw = File.ReadAllText(Path.Combine(path, filename));
            return JsonSerializer.Deserialize<TestFile>(raw, JsonOptions)
                   ?? throw new InvalidOperationException($"Failed to read {filename}");
        }

        private static string FindTestsDirectory()
        {
            var dir = AppContext.BaseDirectory;
            for (int i = 0; i < 10; i++)
            {
                var candidate = Path.Combine(dir, "tests", "test-cases.json");
                if (File.Exists(candidate)) return Path.Combine(dir, "tests");
                var parent = Directory.GetParent(dir);
                if (parent == null) break;
                dir = parent.FullName;
            }
            throw new InvalidOperationException("Could not find the shared tests/ directory.");
        }
    }

    /// <summary>Turns each suite of a spec file into one xUnit case.</summary>
    public abstract class SpecRunner
    {
        protected static IEnumerable<object[]> CasesOf(string filename)
        {
            var spec = TestLoader.LoadTestFile(filename);
            foreach (var suite in spec.Suites)
            {
                foreach (var testCase in suite.Cases)
                {
                    yield return new object[] { filename, suite.Id, testCase.Id };
                }
            }
        }

        protected static (TestSuite, TestCase) Find(string filename, string suiteId, string caseId)
        {
            var spec = TestLoader.LoadTestFile(filename);
            var suite = spec.Suites.First(s => s.Id == suiteId);
            var testCase = suite.Cases.First(c => c.Id == caseId);
            return (suite, testCase);
        }

        /// <summary>What the suite hands to Init(): one payload, or the files of a per-scene export.</summary>
        protected static InitOptions OptionsOf(TestSuite suite)
        {
            return suite.BlueprintFiles != null
                ? new InitOptions { Files = suite.BlueprintFiles }
                : new InitOptions { Data = suite.Blueprint! };
        }

        /// <summary>
        /// The game's answer to one comparison, from the suite's stateBridge.
        /// <para>A test on the reserved "choice" dictionary never gets here — the engine answers
        /// those from the history it kept during the scene.</para>
        /// </summary>
        protected static Func<ConditionTest, bool> MakeResolver(TestSuite suite)
        {
            var answers = suite.StateBridge?.Conditions ?? new Dictionary<string, bool>();
            return test =>
            {
                var key = $"{test.Dict}.{test.Entry}";
                var answer = answers.TryGetValue(key, out var known) ? known : true;
                return test.Op == ConditionOperator.NotEquals ? !answer : answer;
            };
        }
    }

    public class FlowSpecTests : SpecRunner
    {
        public static IEnumerable<object[]> FlowCases() => CasesOf("test-cases.json");
        public static IEnumerable<object[]> RoutingCases() => CasesOf("test-port-routing.json");

        [Theory]
        [MemberData(nameof(FlowCases))]
        public void PlaysTheScene(string filename, string suiteId, string caseId)
            => RunFlow(filename, suiteId, caseId);

        [Theory]
        [MemberData(nameof(RoutingCases))]
        public void RoutesTheFlow(string filename, string suiteId, string caseId)
            => RunFlow(filename, suiteId, caseId);

        private static void RunFlow(string filename, string suiteId, string caseId)
        {
            var (suite, testCase) = Find(filename, suiteId, caseId);

            var engine = new DialogueEngine();
            var report = engine.Init(OptionsOf(suite));
            Assert.Empty(report.Errors);

            engine.SetLocale(suite.Locale ?? "en");
            engine.OnResolveCondition(MakeResolver(suite));

            var steps = testCase.Steps ?? new List<TestStep>();
            int stepIndex = 0;
            int cleanupCalls = 0;

            // One handler per block type, consuming the steps in order. A block that is not the
            // next expected step still reaches here — an async track, or a block the spec does not
            // assert on — and simply advances.
            Action? Dispatch(string blockType, BlueprintBlock block, IBaseBlockContext context, Action next)
            {
                var step = stepIndex < steps.Count ? steps[stepIndex] : null;
                bool isExpected = step != null
                    && step.Expect.Type == blockType
                    && (string.IsNullOrEmpty(step.Expect.BlockId) || step.Expect.BlockId == block.Id);

                if (!isExpected)
                {
                    // Conditions route themselves from the resolver; an action has to say it
                    // succeeded before "then" is followed.
                    if (context is IActionContext ac) ac.Resolve();
                    next();
                    return null;
                }

                if (step!.Expect.Text != null)
                {
                    Assert.NotNull(block.Text);
                    Assert.Equal(step.Expect.Text, block.Text![suite.Locale ?? "en"]);
                }

                if (step.Expect.VisibleOptionCount != null && context is IChoiceContext cc)
                {
                    var offered = cc.Options.Where(o => o.Visible != false).ToList();
                    Assert.Equal(step.Expect.VisibleOptionCount!.Value, offered.Count);
                }

                if (step.Expect.CharacterId != null)
                {
                    Assert.Equal(step.Expect.CharacterId, context.Character?.Id);
                }

                stepIndex++;
                ExecuteAction(step, context, next);
                return () => { cleanupCalls++; };
            }

            engine.OnDialog(a => Dispatch(BlockType.Dialog, a.Block, a.Context, a.Next));
            engine.OnChoice(a => Dispatch(BlockType.Choice, a.Block, a.Context, a.Next));
            engine.OnCondition(a => Dispatch(BlockType.Condition, a.Block, a.Context, a.Next));
            engine.OnAction(a => Dispatch(BlockType.Action, a.Block, a.Context, a.Next));

            var handle = engine.Scene(suite.SceneId!);
            handle.Start();

            // Every step the spec described must have been reached.
            Assert.Equal(steps.Count, stepIndex);
            Assert.Equal(testCase.ExpectedRunning == true, handle.IsRunning());

            if (testCase.ExpectedVisited != null)
            {
                var visited = handle.GetVisitedBlocks().ToList();
                if (testCase.OrderIndependent == true)
                {
                    Assert.Equal(testCase.ExpectedVisited.OrderBy(x => x).ToList(), visited.OrderBy(x => x).ToList());
                }
                else
                {
                    Assert.Equal(testCase.ExpectedVisited, visited);
                }
            }

            if (testCase.ExpectedCleanupCalls != null)
            {
                Assert.Equal(testCase.ExpectedCleanupCalls!.Value, cleanupCalls);
            }
        }

        private static void ExecuteAction(TestStep step, IBaseBlockContext context, Action next)
        {
            var action = step.Action;
            if (action == null) return;

            switch (action.Type)
            {
                case "next":
                    next();
                    break;
                case "selectChoice":
                    ((IChoiceContext)context).SelectChoice(action.OptionId!);
                    next();
                    break;
                case "resolveCondition":
                    ((IConditionContext)context).Resolve(action.Port!);
                    next();
                    break;
                case "resolveAction":
                    ((IActionContext)context).Resolve();
                    next();
                    break;
                case "rejectAction":
                    ((IActionContext)context).Reject(action.Error ?? "test error");
                    next();
                    break;
                case "resolveCharacterPort":
                    ((IDialogContext)context).ResolveCharacterPort(action.CardId!);
                    next();
                    break;
            }
        }
    }

    public class ValidationSpecTests : SpecRunner
    {
        public static IEnumerable<object[]> ValidationCases() => CasesOf("test-init-validation.json");

        [Theory]
        [MemberData(nameof(ValidationCases))]
        public void ReportsWhatItShould(string filename, string suiteId, string caseId)
        {
            var (suite, testCase) = Find(filename, suiteId, caseId);
            var report = new DialogueEngine().Init(OptionsOf(suite));

            if (testCase.ExpectedErrors != null)
            {
                var codes = report.Errors.Select(e => e.Code).ToList();
                if (testCase.ExpectedErrors.Count == 0)
                {
                    Assert.Empty(codes);
                }
                else
                {
                    foreach (var code in testCase.ExpectedErrors) Assert.Contains(code, codes);
                }
            }

            if (testCase.ExpectedWarnings != null)
            {
                var codes = report.Warnings.Select(w => w.Code).ToList();
                if (testCase.ExpectedWarnings.Count == 0)
                {
                    Assert.Empty(codes);
                }
                else
                {
                    foreach (var code in testCase.ExpectedWarnings) Assert.Contains(code, codes);
                }
            }

            if (testCase.ExpectedStats != null)
            {
                Assert.Equal(testCase.ExpectedStats.SceneCount, report.Stats.SceneCount);
                Assert.Equal(testCase.ExpectedStats.BlockCount, report.Stats.BlockCount);
                Assert.Equal(testCase.ExpectedStats.ConnectionCount, report.Stats.ConnectionCount);
            }
        }
    }
}

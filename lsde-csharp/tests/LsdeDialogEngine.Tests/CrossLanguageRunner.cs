// Cross-language test runner — reads JSON test specs and executes against the C# engine.
// C# port of cross-language-runner.test.ts

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    // ─── JSON Deserialization ─────────────────────────────────────────────────────

    internal static class TestLoader
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter(), new BlockPropertyValueConverter() }
        };

        internal static TestFile LoadTestFile(string filename)
        {
            var dir = Path.Combine(AppContext.BaseDirectory, "TestData");
            var path = Path.Combine(dir, filename);
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<TestFile>(json, JsonOptions)
                   ?? throw new Exception($"Failed to deserialize {filename}");
        }
    }

    /// <summary>Handles BlockProperty.Value and ExportAction.Params which are string|number|boolean.</summary>
    internal class BlockPropertyValueConverter : JsonConverter<object>
    {
        public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(object);

        public override object? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.String:
                    return reader.GetString();
                case JsonTokenType.Number:
                    if (reader.TryGetInt64(out var l)) return (double)l;
                    return reader.GetDouble();
                case JsonTokenType.True:
                    return true;
                case JsonTokenType.False:
                    return false;
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.StartArray:
                    var list = new List<object?>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
                    {
                        list.Add(Read(ref reader, typeof(object), options));
                    }
                    return list;
                case JsonTokenType.StartObject:
                    var dict = new Dictionary<string, object?>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndObject)
                    {
                        var key = reader.GetString()!;
                        reader.Read();
                        dict[key] = Read(ref reader, typeof(object), options);
                    }
                    return dict;
                default:
                    throw new JsonException($"Unexpected token {reader.TokenType}");
            }
        }

        public override void Write(Utf8JsonWriter writer, object value, JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, options);
        }
    }

    // ─── TestStateBridge ─────────────────────────────────────────────────────────

    internal class TestStateBridge : IStateBridge
    {
        private readonly StateBridgeConfig? _config;

        internal TestStateBridge(StateBridgeConfig? config) => _config = config;

        public bool EvaluateCondition(ExportCondition condition)
        {
            if (_config?.Conditions != null && _config.Conditions.TryGetValue(condition.Key, out var val))
                return val;
            return true;
        }

        public void ExecuteAction(ExportAction action, ActionSignature? signature)
        {
            if (_config?.Actions != null && _config.Actions.TryGetValue(action.ActionId, out var result))
            {
                if (result == "fail")
                    throw new Exception($"Action {action.ActionId} failed");
            }
        }

        public object ResolveDictionary(string groupLabel, string rowKey)
        {
            var key = $"{groupLabel}.{rowKey}";
            if (_config?.Dictionaries != null && _config.Dictionaries.TryGetValue(key, out var val))
                return val;
            return "";
        }
    }

    // ─── Mutable test state wrapper (for lambda capture) ─────────────────────────

    internal class TestState
    {
        public int StepIndex;
        public int CleanupCalls;
    }

    // ─── Flow Tests ──────────────────────────────────────────────────────────────

    public class CrossLanguageFlowTests
    {
        public static IEnumerable<object[]> TestCasesData()
        {
            return LoadCases("test-cases.json");
        }

        public static IEnumerable<object[]> PortRoutingData()
        {
            return LoadCases("test-port-routing.json");
        }

        private static IEnumerable<object[]> LoadCases(string filename)
        {
            var testFile = TestLoader.LoadTestFile(filename);
            foreach (var suite in testFile.Suites)
            {
                foreach (var tc in suite.Cases)
                {
                    yield return new object[] { suite, tc, $"{suite.Id}/{tc.Id}" };
                }
            }
        }

        [Theory]
        [MemberData(nameof(TestCasesData))]
        public void FlowTest_TestCases(TestSuite suite, TestCase tc, string displayName)
        {
            RunFlowTest(suite, tc);
        }

        [Theory]
        [MemberData(nameof(PortRoutingData))]
        public void FlowTest_PortRouting(TestSuite suite, TestCase tc, string displayName)
        {
            RunFlowTest(suite, tc);
        }

        private static void RunFlowTest(TestSuite suite, TestCase tc)
        {
            var engine = new DialogueEngine();
            var report = engine.Init(new InitOptions { Data = suite.Blueprint });
            Assert.Empty(report.Errors);

            engine.SetLocale(suite.Locale ?? "en");
            engine.SetStateBridge(new TestStateBridge(suite.StateBridge));

            var steps = tc.Steps ?? new List<TestStep>();
            var state = new TestState();

            // Determine which block types appear in steps
            var stepTypes = new HashSet<string>();
            foreach (var s in steps) stepTypes.Add(s.Expect.Type);

            // Register handlers for types that appear in steps
            var handle = engine.Scene(suite.SceneId!);

            if (stepTypes.Contains("DIALOG"))
            {
                handle.OnDialog(args =>
                {
                    return HandleStep("DIALOG", args.Block, args.Context, args.Next, steps, state);
                });
            }

            if (stepTypes.Contains("CHOICE"))
            {
                handle.OnChoice(args =>
                {
                    var step = steps.Count > state.StepIndex ? steps[state.StepIndex] : null;
                    if (step != null && step.Expect.Type == "CHOICE"
                        && (step.Expect.BlockUuid == null || step.Expect.BlockUuid == args.Block.Uuid))
                    {
                        if (step.Expect.VisibleChoiceCount.HasValue)
                        {
                            Assert.Equal(step.Expect.VisibleChoiceCount.Value, args.Context.Choices.Count);
                        }
                    }
                    return HandleStep("CHOICE", args.Block, args.Context, args.Next, steps, state);
                });
            }

            if (stepTypes.Contains("CONDITION"))
            {
                handle.OnCondition(args =>
                {
                    return HandleStep("CONDITION", args.Block, args.Context, args.Next, steps, state);
                });
            }

            if (stepTypes.Contains("ACTION"))
            {
                handle.OnAction(args =>
                {
                    return HandleStep("ACTION", args.Block, args.Context, args.Next, steps, state);
                });
            }

            handle.Start();

            // Verify END_OF_SCENE
            Assert.False(handle.IsRunning());

            // Verify visited blocks
            if (tc.ExpectedVisited != null)
            {
                var engineVisited = new List<string>(handle.GetVisitedBlocks());
                if (tc.OrderIndependent == true)
                {
                    engineVisited.Sort();
                    var expected = new List<string>(tc.ExpectedVisited);
                    expected.Sort();
                    Assert.Equal(expected, engineVisited);
                }
                else
                {
                    Assert.Equal(tc.ExpectedVisited, engineVisited);
                }
            }

            // Verify cleanup calls
            if (tc.ExpectedCleanupCalls.HasValue)
            {
                Assert.Equal(tc.ExpectedCleanupCalls.Value, state.CleanupCalls);
            }
        }

        private static Action? HandleStep(
            string blockType,
            BlueprintBlock block,
            IBaseBlockContext context,
            Action next,
            List<TestStep> steps,
            TestState state)
        {
            var step = steps.Count > state.StepIndex ? steps[state.StepIndex] : null;

            if (step != null && step.Expect.Type == blockType
                && (step.Expect.BlockUuid == null || step.Expect.BlockUuid == block.Uuid))
            {
                state.StepIndex++;
                ExecuteAction(step.Action, context, next);
            }
            else
            {
                // Not the expected step — auto-advance (async track or passthrough)
                next();
            }

            return () => { state.CleanupCalls++; };
        }

        private static void ExecuteAction(StepAction? action, IBaseBlockContext context, Action next)
        {
            if (action == null) return;

            switch (action.Type)
            {
                case "next":
                    next();
                    break;
                case "selectChoice":
                    ((IChoiceContext)context).SelectChoice(action.ChoiceUuid!);
                    next();
                    break;
                case "resolve":
                    ((IConditionContext)context).Resolve(action.Value ?? true);
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
                    ((IDialogContext)context).ResolveCharacterPort(action.CharacterName ?? action.Name ?? "");
                    next();
                    break;
            }
        }
    }

    // ─── Validation Tests ────────────────────────────────────────────────────────

    public class CrossLanguageValidationTests
    {
        public static IEnumerable<object[]> ValidationData()
        {
            var testFile = TestLoader.LoadTestFile("test-init-validation.json");
            foreach (var suite in testFile.Suites)
            {
                foreach (var tc in suite.Cases)
                {
                    yield return new object[] { suite, tc, $"{suite.Id}/{tc.Id}" };
                }
            }
        }

        [Theory]
        [MemberData(nameof(ValidationData))]
        public void ValidationTest(TestSuite suite, TestCase tc, string displayName)
        {
            var engine = new DialogueEngine();
            var report = engine.Init(new InitOptions { Data = suite.Blueprint });

            // Verify expected errors
            if (tc.ExpectedErrors != null)
            {
                var errorCodes = new List<string>();
                foreach (var e in report.Errors) errorCodes.Add(e.Code);

                foreach (var code in tc.ExpectedErrors)
                {
                    Assert.Contains(code, errorCodes);
                }
                if (tc.ExpectedErrors.Count == 0)
                {
                    Assert.Empty(report.Errors);
                }
            }

            // Verify expected warnings
            if (tc.ExpectedWarnings != null)
            {
                var warningCodes = new List<string>();
                foreach (var w in report.Warnings) warningCodes.Add(w.Code);

                foreach (var code in tc.ExpectedWarnings)
                {
                    Assert.Contains(code, warningCodes);
                }
                if (tc.ExpectedWarnings.Count == 0)
                {
                    Assert.Empty(report.Warnings);
                }
            }

            // Verify stats
            if (tc.ExpectedStats != null)
            {
                Assert.Equal(tc.ExpectedStats.SceneCount, report.Stats.SceneCount);
                Assert.Equal(tc.ExpectedStats.BlockCount, report.Stats.BlockCount);
                Assert.Equal(tc.ExpectedStats.ConnectionCount, report.Stats.ConnectionCount);
            }
        }
    }
}

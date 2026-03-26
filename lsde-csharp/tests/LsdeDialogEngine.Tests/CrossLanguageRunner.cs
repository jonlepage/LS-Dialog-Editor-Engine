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

    /// <summary>
    /// Polymorphic JSON converter for BlueprintBlock — reads the "type" field
    /// and deserializes to the correct subclass (DialogBlock, ChoiceBlock, etc.).
    /// </summary>
    internal class BlueprintBlockConverter : JsonConverter<BlueprintBlock>
    {
        public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(BlueprintBlock);

        public override BlueprintBlock Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;

            if (!root.TryGetProperty("type", out var typeProp))
                throw new JsonException("BlueprintBlock missing 'type' field");

            var typeStr = typeProp.GetString();
            var json = root.GetRawText();
            return typeStr switch
            {
                "DIALOG" => JsonSerializer.Deserialize<DialogBlock>(json, options)!,
                "CHOICE" => JsonSerializer.Deserialize<ChoiceBlock>(json, options)!,
                "CONDITION" => JsonSerializer.Deserialize<ConditionBlock>(json, options)!,
                "ACTION" => JsonSerializer.Deserialize<ActionBlock>(json, options)!,
                "NOTE" => JsonSerializer.Deserialize<NoteBlock>(json, options)!,
                _ => throw new JsonException($"Unknown block type: {typeStr}")
            };
        }

        public override void Write(Utf8JsonWriter writer, BlueprintBlock value, JsonSerializerOptions options)
        {
            JsonSerializer.Serialize(writer, value, value.GetType(), options);
        }
    }

    internal static class TestLoader
    {
        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter(), new BlockPropertyValueConverter(), new BlueprintBlockConverter() }
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

    // TestStateBridge removed — replaced by handler-based API.
    // The runner now registers all 4 mandatory handlers directly.

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

            // Install choice filter if the suite has condition config
            var bridgeConfig = suite.StateBridge;
            if (bridgeConfig?.Conditions != null)
            {
                engine.SetChoiceFilter(cond =>
                {
                    if (bridgeConfig.Conditions.TryGetValue(cond.Key, out var val))
                        return val;
                    return true;
                });
            }

            var steps = tc.Steps ?? new List<TestStep>();
            var state = new TestState();

            // All 4 handlers are mandatory — register them all
            engine.OnDialog(args =>
            {
                return HandleStep("DIALOG", args.Block, args.Context, args.Next, steps, state);
            });

            engine.OnChoice(args =>
            {
                var step = steps.Count > state.StepIndex ? steps[state.StepIndex] : null;
                if (step != null && step.Expect.Type == "CHOICE"
                    && (step.Expect.BlockUuid == null || step.Expect.BlockUuid == args.Block.Uuid))
                {
                    if (step.Expect.VisibleChoiceCount.HasValue)
                    {
                        var visibleCount = args.Context.Choices.Count(c => c.Visible != false);
                        Assert.Equal(step.Expect.VisibleChoiceCount.Value, visibleCount);
                    }
                }
                return HandleStep("CHOICE", args.Block, args.Context, args.Next, steps, state);
            });

            engine.OnCondition(args =>
            {
                return HandleStep("CONDITION", args.Block, args.Context, args.Next, steps, state, suite);
            });

            engine.OnAction(args =>
            {
                return HandleStep("ACTION", args.Block, args.Context, args.Next, steps, state);
            });

            var handle = engine.Scene(suite.SceneId!);

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
            TestState state,
            TestSuite? suite = null)
        {
            var step = steps.Count > state.StepIndex ? steps[state.StepIndex] : null;

            if (step != null && step.Expect.Type == blockType
                && (step.Expect.BlockUuid == null || step.Expect.BlockUuid == block.Uuid))
            {
                state.StepIndex++;
                ExecuteAction(step.Action, context, next);
                return () => { state.CleanupCalls++; };
            }
            else
            {
                // Not the expected step — auto-advance (async track or passthrough)
                if (blockType == "CONDITION" && context is IConditionContext condCtx)
                {
                    // Evaluate conditions using suite bridge config
                    var condBlock = block as ConditionBlock;
                    var conditions = condBlock?.Conditions ?? new List<ExportCondition>();
                    var result = ConditionEvaluator.EvaluateConditionChain(conditions, cond =>
                    {
                        if (suite?.StateBridge?.Conditions != null
                            && suite.StateBridge.Conditions.TryGetValue(cond.Key, out var val))
                            return val;
                        return true;
                    });
                    condCtx.Resolve(result);
                }
                else if (blockType == "ACTION" && context is IActionContext actCtx)
                {
                    actCtx.Resolve();
                }
                next();
                // No cleanup for auto-advanced blocks
                return null;
            }
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

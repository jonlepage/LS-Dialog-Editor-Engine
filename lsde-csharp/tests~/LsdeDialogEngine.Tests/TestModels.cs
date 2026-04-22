// Cross-language test JSON deserialization models

using System.Collections.Generic;

namespace LsdeDialogEngine.Tests
{
    public class TestFile
    {
        public string Version { get; set; } = "";
        public List<TestSuite> Suites { get; set; } = new();
    }

    public class TestSuite
    {
        public string Id { get; set; } = "";
        public string Description { get; set; } = "";
        public BlueprintExport Blueprint { get; set; } = new();
        public string? SceneId { get; set; }
        public string? Locale { get; set; }
        public StateBridgeConfig? StateBridge { get; set; }
        public List<TestCase> Cases { get; set; } = new();
    }

    public class StateBridgeConfig
    {
        public Dictionary<string, bool>? Conditions { get; set; }
        public Dictionary<string, string>? Dictionaries { get; set; }
        public Dictionary<string, string>? Actions { get; set; }
    }

    public class TestCase
    {
        public string Id { get; set; } = "";
        public string? Description { get; set; }
        public List<TestStep>? Steps { get; set; }
        public List<string>? ExpectedVisited { get; set; }
        public int? ExpectedCleanupCalls { get; set; }
        public bool? OrderIndependent { get; set; }
        public List<string>? ExpectedErrors { get; set; }
        public List<string>? ExpectedWarnings { get; set; }
        public ExpectedStats? ExpectedStats { get; set; }
    }

    public class ExpectedStats
    {
        public int SceneCount { get; set; }
        public int BlockCount { get; set; }
        public int ConnectionCount { get; set; }
    }

    public class TestStep
    {
        public StepExpect Expect { get; set; } = new();
        public StepAction? Action { get; set; }
    }

    public class StepExpect
    {
        public string Type { get; set; } = "";
        public string? BlockUuid { get; set; }
        public string? DialogueText { get; set; }
        public int? VisibleChoiceCount { get; set; }
    }

    public class StepAction
    {
        public string Type { get; set; } = "";
        public string? ChoiceUuid { get; set; }
        public bool? Value { get; set; }
        public string? Error { get; set; }
        public string? Name { get; set; }
        public string? CharacterName { get; set; }
    }
}

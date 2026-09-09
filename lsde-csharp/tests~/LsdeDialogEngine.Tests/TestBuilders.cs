// LSDE Dialog Engine — payload builders for the C# test suites (port of test-builders.ts)
//
// Hand-built payloads, for cases a real export cannot produce on demand: a NOTE wired back on
// itself, a link to a block that is not there, three async branches converging on one wait. The
// conformance suite runs against the files LSDE actually wrote — these are for everything else.

using System.Collections.Generic;

namespace LsdeDialogEngine.Tests
{
    internal static class Build
    {
        /// <summary>The header every builder produces, so a scene is always loadable on its own.</summary>
        internal static BlueprintExport Blueprint(params BlueprintScene[] scenes) => new()
        {
            Format = "lsde-blueprints",
            Version = 1,
            Generator = new Generator { App = "LSDE", Version = "2.0.3" },
            ExportedAt = "2026-09-07T00:00:00.000Z",
            Project = "Test",
            Locales = new List<string> { "en" },
            ReferenceLocale = "en",
            Dictionaries = new List<DictionaryDefinition>(),
            Functions = new List<FunctionDefinition>(),
            Cards = new List<Card>(),
            Scenes = new List<BlueprintScene>(scenes),
        };

        /// <summary>One scene. Start defaults to the first block, which is what a scene almost always wants.</summary>
        internal static BlueprintScene Scene(
            List<BlueprintBlock> blocks, string path = "s1", string? start = null) => new()
        {
            Scene = path,
            Id = "sc_" + path,
            Start = start ?? (blocks.Count > 0 ? blocks[0].Id : null),
            Blocks = blocks,
        };

        /// <summary>A whole payload holding one scene. The shortest thing Init() accepts.</summary>
        internal static BlueprintExport OneScene(params BlueprintBlock[] blocks)
            => Blueprint(Scene(new List<BlueprintBlock>(blocks)));

        // ─── Blocks ──────────────────────────────────────────────────────────

        private static BlueprintBlock Base(string id, string type) => new()
        {
            Id = id,
            Key = "__blueprints__.s1." + id,
            Type = type,
        };

        internal static BlueprintBlock Dialog(string id) => Base(id, BlockType.Dialog);

        internal static BlueprintBlock Note(string id) => Base(id, BlockType.Note);

        internal static BlueprintBlock Choice(string id, params Option[] options)
        {
            var block = Base(id, BlockType.Choice);
            block.Options = new List<Option>(options);
            return block;
        }

        internal static BlueprintBlock Condition(string id, params ConditionCase[] cases)
        {
            var block = Base(id, BlockType.Condition);
            block.Cases = new List<ConditionCase>(cases);
            return block;
        }

        /// <summary>A ROUTER: the same cases as a condition, read the opposite way. Exits by then / catch.</summary>
        internal static BlueprintBlock Router(string id, params ConditionCase[] cases)
        {
            var block = Base(id, BlockType.Router);
            block.Cases = new List<ConditionCase>(cases);
            return block;
        }

        internal static BlueprintBlock Action(string id, params ActionCall[] calls)
        {
            var block = Base(id, BlockType.Action);
            block.Calls = new List<ActionCall>(calls);
            return block;
        }

        // ─── Wires ───────────────────────────────────────────────────────────

        /// <summary>Add one outgoing wire. The port is a NAME: out, then, C1, K1, or a card id.</summary>
        internal static BlueprintBlock Wire(this BlueprintBlock block, string to, string port = "out")
        {
            block.Next ??= new List<Link>();
            block.Next.Add(new Link { Port = port, To = to, ToPort = "in" });
            return block;
        }

        /// <summary>Add one outgoing wire naming the target's ENTRY port — a card id when the target
        /// carries InPortPerCharacter, in which case that actor is the one speaking the line.</summary>
        internal static BlueprintBlock WireTo(this BlueprintBlock block, string to, string port, string toPort)
        {
            block.Next ??= new List<Link>();
            block.Next.Add(new Link { Port = port, To = to, ToPort = toPort });
            return block;
        }

        /// <summary>Set one property in the block's Props bag — a native or the writer's own.</summary>
        internal static BlueprintBlock Prop(this BlueprintBlock block, string id, object value)
        {
            block.Props ??= new Dictionary<string, object>();
            block.Props[id] = value;
            return block;
        }

        internal static BlueprintBlock WithActors(this BlueprintBlock block, params string[] cardIds)
        {
            block.Actors = new List<string>(cardIds);
            return block;
        }

        internal static BlueprintBlock WithEmotion(this BlueprintBlock block, string cardId, double? intensity = null)
        {
            block.Emotion = cardId;
            block.Intensity = intensity;
            return block;
        }

        internal static BlueprintBlock WithText(this BlueprintBlock block, string en)
        {
            block.Text = new Dictionary<string, string> { ["en"] = en };
            return block;
        }

        // ─── Options, cases, tests ───────────────────────────────────────────

        internal static Option Opt(string id, List<ConditionTest>? when = null) => new()
        {
            Id = id,
            Key = "__blueprints__.s1.CHOICE-001." + id,
            When = when,
        };

        /// <summary>A case. No When means always true — which is how "always" is written in v2.</summary>
        internal static ConditionCase Case(string port, List<ConditionTest>? when = null)
            => new() { Port = port, When = when };

        internal static ConditionTest Test(
            string dict, string entry, object value,
            string op = ConditionOperator.Equals, string? join = null)
            => new() { Dict = dict, Entry = entry, Op = op, Value = value, Join = join };

        /// <summary>A test on the reserved "choice" dictionary: did the player pick optionId there?</summary>
        internal static ConditionTest ChoiceTest(
            string blockId, string optionId, string op = ConditionOperator.Equals)
            => new() { Dict = Ports.Choice, Entry = blockId, Op = op, Value = optionId };

        // ─── Header tables ───────────────────────────────────────────────────

        internal static Card MakeCard(string id, string name, string role = CardRole.Characters)
            => new() { Id = id, Name = name, Role = role };

        internal static ActionCall Call(string fn)
            => new() { Fn = fn, Args = new Dictionary<string, object>() };
    }
}

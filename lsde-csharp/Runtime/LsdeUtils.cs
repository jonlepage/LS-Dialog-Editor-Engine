// LSDE Dialog Engine — Public utilities for game developers (C# port of lsde-utils.ts)
//
// Static helpers, never hooks. Nothing here is called by the engine: a game calls them, with data
// it already has. That distinction is the whole point of the file — the engine reads STRUCTURE and
// never the content of a text, so anything to do with reading a line lives out here.
//
// Which is also why an OnResolveText callback does not exist and will not. A callback is how the
// engine ASKS for something it needs; it never needs a line. It does not display it, measure it or
// validate it. The handler already has the block — it looks its text up wherever it keeps it.

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>Public helpers for game developers integrating the LSDE engine.</summary>
    public static class LsdeUtils
    {
        // ─── Locale ──────────────────────────────────────────────────────────────────

        /// <summary>Active locale code, synced by engine.SetLocale().</summary>
        public static string? Locale { get; set; }

        // ─── Type Guards ─────────────────────────────────────────────────────────────

        /// <summary>True when the block is a dialog. Block types are LOWERCASE in v2.</summary>
        public static bool IsDialogBlock(BlueprintBlock block) => block.Type == BlockType.Dialog;

        /// <summary>True when the block is a choice.</summary>
        public static bool IsChoiceBlock(BlueprintBlock block) => block.Type == BlockType.Choice;

        /// <summary>True when the block is a condition.</summary>
        public static bool IsConditionBlock(BlueprintBlock block) => block.Type == BlockType.Condition;

        /// <summary>True when the block is a router.</summary>
        public static bool IsRouterBlock(BlueprintBlock block) => block.Type == BlockType.Router;

        /// <summary>True when the block is an action.</summary>
        public static bool IsActionBlock(BlueprintBlock block) => block.Type == BlockType.Action;

        /// <summary>True when the block is a note.</summary>
        public static bool IsNoteBlock(BlueprintBlock block) => block.Type == BlockType.Note;

        // ─── Display Helpers ─────────────────────────────────────────────────────────

        /// <summary>
        /// How to name a block on screen or in a log.
        /// <para>There is no mandatory block name in v2, and none is needed: DIALOG-007 already
        /// reads better than the uuid it replaced. A writer's note says far more than a three-word
        /// label would, so it comes next; a Label wins when an export carries one.</para>
        /// </summary>
        public static string GetBlockLabel(BlueprintBlock block)
        {
            if (!string.IsNullOrEmpty(block.Label)) return block.Label!;
            if (!string.IsNullOrEmpty(block.Note)) return block.Note!;
            return block.Id;
        }

        /// <summary>
        /// Pick a locale out of an inline Text map — Block.Text, or an option's.
        /// <para>Only works when texts were exported INSIDE the payload. With the separate mode the
        /// blocks carry no Text at all and GetTextFromTable is the one to use.</para>
        /// </summary>
        public static string? GetLocalizedText(Dictionary<string, string>? text, string? locale = null)
        {
            var resolved = RequireLocale(locale);
            if (text != null && text.TryGetValue(resolved, out var line)) return line;
            return null;
        }

        /// <summary>
        /// Read a line out of a loaded localization/&lt;locale&gt;/__blueprints__.json, for the
        /// separate text mode — which is what most integrations want: keeping every locale inline
        /// forces a game to load twenty languages to play one.
        /// <para>The game loads the file; the engine does no IO, ever. Pass the block's scene and
        /// id, plus an option id for one answer of a choice.</para>
        /// </summary>
        public static string? GetTextFromTable(
            Dictionary<string, Dictionary<string, object>>? table,
            string scene,
            string blockId,
            string? optionId = null)
        {
            if (table == null) return null;
            if (!table.TryGetValue(scene, out var blocks)) return null;
            if (!blocks.TryGetValue(blockId, out var entry)) return null;

            if (entry is string line)
            {
                // A plain line. Asking for an option of a block that has none is a miss.
                return optionId == null ? line : null;
            }

            if (optionId == null) return null;

            if (entry is Dictionary<string, string> options
                && options.TryGetValue(optionId, out var optionLine))
            {
                return optionLine;
            }

            if (entry is Dictionary<string, object> boxed
                && boxed.TryGetValue(optionId, out var boxedLine))
            {
                return boxedLine as string;
            }

            return null;
        }

        /// <summary>
        /// The i18n key of a block, or of one option of a choice.
        /// <para>The key is already in the payload (Block.Key), so this only builds the option
        /// variant — useful for a voice file, whose name is derived from the key.</para>
        /// </summary>
        public static string GetTextKey(BlueprintBlock block, string? optionId = null)
        {
            return optionId == null ? block.Key : block.Key + "." + optionId;
        }

        // ─── Properties ──────────────────────────────────────────────────────────────

        /// <summary>
        /// The properties the ENGINE acts on, pulled out of a block's Props.
        /// <para>v2 puts natives and the writer's own properties in one bag, keyed by bare id, and
        /// ids cannot collide — LSDE refuses a project property that takes a native name. So this
        /// is a lookup against NativePropertyIds, not a guess.</para>
        /// <para><b>Delay and Timeout are MILLISECONDS.</b> They were seconds in v1 and nothing
        /// reports the change at runtime: a migrated project turns a 3-second pause into 3 ms.</para>
        /// </summary>
        public static NativeProperties GetNativeProperties(BlueprintBlock block)
        {
            var natives = new NativeProperties();
            if (block.Props == null) return natives;

            natives.IsAsync = ReadBool(block.Props, "isAsync");
            natives.Delay = ReadNumber(block.Props, "delay");
            natives.Timeout = ReadNumber(block.Props, "timeout");
            natives.WaitInput = ReadBool(block.Props, "waitInput");
            natives.Debug = ReadBool(block.Props, "debug");
            natives.PortPerCharacter = ReadBool(block.Props, "portPerCharacter");
            natives.InPortPerCharacter = ReadBool(block.Props, "inPortPerCharacter");
            natives.SkipIfMissingActor = ReadBool(block.Props, "skipIfMissingActor");
            natives.PortPerCase = ReadBool(block.Props, "portPerCase");
            natives.WaitForBlocks = ReadStringList(block.Props, "waitForBlocks");

            return natives;
        }

        /// <summary>
        /// The properties the WRITER declared, with the natives taken out — everything the game is
        /// free to give its own meaning to.
        /// </summary>
        public static Dictionary<string, object> GetCustomProperties(BlueprintBlock block)
        {
            var custom = new Dictionary<string, object>();
            if (block.Props == null) return custom;

            foreach (var pair in block.Props)
            {
                if (!NativePropertyIds.Contains(pair.Key)) custom[pair.Key] = pair.Value;
            }
            return custom;
        }

        // ─── Condition Helpers ───────────────────────────────────────────────────────

        /// <summary>
        /// Does this test read a past answer of the player rather than game state?
        /// <para>"choice" is a reserved dictionary id that no project dictionary may take: Entry is
        /// a CHOICE block id of this scene, Value an option id of that block. The engine answers
        /// these from its own history, so a game never has to remember what it already told it.</para>
        /// </summary>
        public static bool IsChoiceCondition(ConditionTest test) => ConditionEvaluator.IsChoiceTest(test);

        /// <summary>The CHOICE block a "choice" test reads, or null for any other test.</summary>
        public static string? GetChoiceConditionBlockId(ConditionTest test)
        {
            return test.Dict == Ports.Choice ? test.Entry : null;
        }

        /// <summary>Evaluate a chain of tests left to right, with NO operator precedence.
        /// Absent or empty means true — which is how "always" is written in v2.</summary>
        public static bool EvaluateConditionChain(List<ConditionTest>? tests, Func<ConditionTest, bool> evaluator)
        {
            return ConditionEvaluator.EvaluateConditionChain(tests, evaluator);
        }

        /// <summary>The exit port of a condition block: "out"/"default" in if mode, K1… with
        /// PortPerCase. Replaces the v1 EvaluateConditionGroups, which returned an index and had a
        /// third, dispatcher mode that no longer exists.</summary>
        public static string EvaluateConditionCases(
            List<ConditionCase>? cases, bool portPerCase, Func<ConditionTest, bool> evaluator)
        {
            return ConditionEvaluator.EvaluateConditionCases(cases, portPerCase, evaluator);
        }

        /// <summary>Each case on its own, in order — to show what matched without changing the flow.</summary>
        public static List<bool> EvaluateEachCase(List<ConditionCase>? cases, Func<ConditionTest, bool> evaluator)
        {
            return ConditionEvaluator.EvaluateEachCase(cases, evaluator);
        }

        /// <summary>The exits of a ROUTER, from case results already computed: the port of every
        /// true case, then "then" when they all held or "catch" when one did not — always last. The
        /// router's reading of the same Cases a condition carries.</summary>
        public static List<string> PickRouterPorts(List<ConditionCase>? cases, List<bool> results)
        {
            return ConditionEvaluator.PickRouterPorts(cases, results);
        }

        /// <summary>Tag every option of a choice with whether its When holds, returning them ALL.
        /// Replaces the v1 FilterVisibleChoices, which shortened the list and took away the ability
        /// to show a locked answer.</summary>
        public static List<RuntimeChoiceItem> TagOptionVisibility(
            List<Option>? options, Func<ConditionTest, bool>? evaluator)
        {
            return ConditionEvaluator.TagOptionVisibility(options, evaluator);
        }

        // ─── Internal ────────────────────────────────────────────────────────────────

        private static string RequireLocale(string? locale)
        {
            var resolved = locale ?? Locale;
            if (resolved == null)
            {
                throw new InvalidOperationException(
                    "No locale set. Call engine.SetLocale() first or pass a locale parameter.");
            }
            return resolved;
        }

        private static bool? ReadBool(Dictionary<string, object> props, string key)
        {
            if (!props.TryGetValue(key, out var value)) return null;
            return value is bool flag ? flag : (bool?)null;
        }

        private static double? ReadNumber(Dictionary<string, object> props, string key)
        {
            if (!props.TryGetValue(key, out var value) || value == null) return null;
            try { return Convert.ToDouble(value); }
            catch { return null; }
        }

        private static List<string>? ReadStringList(Dictionary<string, object> props, string key)
        {
            if (!props.TryGetValue(key, out var value) || value == null) return null;

            if (value is List<string> strings) return strings;

            if (value is System.Collections.IEnumerable items && !(value is string))
            {
                var list = new List<string>();
                foreach (var item in items)
                {
                    if (item != null) list.Add(item.ToString()!);
                }
                return list;
            }

            return null;
        }
    }
}

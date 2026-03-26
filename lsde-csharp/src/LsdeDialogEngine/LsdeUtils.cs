// LSDE Dialog Engine — Public utilities for game developers

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>Public utility class exposing common helpers for game developers integrating the LSDE engine.</summary>
    public static class LsdeUtils
    {
        // ─── Locale ──────────────────────────────────────────────────────────────────

        /// <summary>Active locale code, synced by engine.SetLocale().</summary>
        public static string? Locale { get; set; }

        // ─── Type Guards ─────────────────────────────────────────────────────────────

        /// <summary>Returns true if the block is a DialogBlock.</summary>
        public static bool IsDialogBlock(BlueprintBlock block) => block is DialogBlock;
        /// <summary>Returns true if the block is a ChoiceBlock.</summary>
        public static bool IsChoiceBlock(BlueprintBlock block) => block is ChoiceBlock;
        /// <summary>Returns true if the block is a ConditionBlock.</summary>
        public static bool IsConditionBlock(BlueprintBlock block) => block is ConditionBlock;
        /// <summary>Returns true if the block is an ActionBlock.</summary>
        public static bool IsActionBlock(BlueprintBlock block) => block is ActionBlock;
        /// <summary>Returns true if the block is a NoteBlock.</summary>
        public static bool IsNoteBlock(BlueprintBlock block) => block is NoteBlock;

        // ─── Display Helpers ─────────────────────────────────────────────────────────

        /// <summary>Returns the block's label, or the first 8 characters of its UUID as fallback.</summary>
        public static string GetBlockLabel(BlueprintBlock block)
        {
            return block.Label ?? (block.Uuid.Length >= 8 ? block.Uuid.Substring(0, 8) : block.Uuid);
        }

        /// <summary>Looks up a localized text value from a dialogueText dictionary.
        /// Uses the engine locale (set via SetLocale()) by default.
        /// Throws if no locale is set (neither via parameter nor SetLocale()).</summary>
        public static string? GetLocalizedText(Dictionary<string, string>? dialogueText, string? locale = null)
        {
            var resolvedLocale = locale ?? Locale;
            if (resolvedLocale == null)
                throw new InvalidOperationException("No locale set. Call engine.SetLocale() first or pass a locale parameter.");
            if (dialogueText != null && dialogueText.TryGetValue(resolvedLocale, out var text))
                return text;
            return null;
        }

        // ─── Condition Helpers ───────────────────────────────────────────────────────

        /// <summary>Returns true if the condition references a previous choice selection (key starts with "choice:").</summary>
        public static bool IsChoiceCondition(ExportCondition condition)
        {
            return condition.Key.StartsWith("choice:");
        }

        /// <summary>Extracts the referenced choice block UUID from a choice condition, or null if not a choice condition.</summary>
        public static string? GetChoiceConditionBlockUuid(ExportCondition condition)
        {
            return condition.Key.StartsWith("choice:") ? condition.Key.Substring(7) : null;
        }

        /// <summary>Evaluates a chain of conditions with &amp; (AND) / | (OR) chaining. Empty list returns true.</summary>
        public static bool EvaluateConditionChain(List<ExportCondition> conditions, System.Func<ExportCondition, bool> evaluator)
        {
            return ConditionEvaluator.EvaluateConditionChain(conditions, evaluator);
        }

        /// <summary>Filters choice items by their visibility conditions. Choices without conditions are always visible.
        /// When scene is provided, choice: conditions are resolved via the scene's internal history.</summary>
        public static List<ChoiceItem> FilterVisibleChoices(List<ChoiceItem> choices, System.Func<ExportCondition, bool> evaluator, ISceneHandle? scene = null)
        {
            return ConditionEvaluator.FilterVisibleChoices(choices, evaluator, scene);
        }
    }
}

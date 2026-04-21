// LSDE Dialog Engine — Condition chain evaluation (C# port of condition-evaluator.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    public static class ConditionEvaluator
    {
        /// <summary>
        /// Evaluate a chain of conditions left-to-right with no operator precedence.
        /// Empty list returns true (no conditions = pass).
        /// </summary>
        public static bool EvaluateConditionChain(
            List<ExportCondition> conditions,
            Func<ExportCondition, bool> evaluator)
        {
            if (conditions.Count == 0) return true;

            bool result = evaluator(conditions[0]);

            for (int i = 1; i < conditions.Count; i++)
            {
                var cond = conditions[i];
                bool current = evaluator(cond);

                if (cond.Chain == "|")
                {
                    result = result || current;
                }
                else
                {
                    // '&' or null — default to AND
                    result = result && current;
                }
            }

            return result;
        }

        /// <summary>
        /// Evaluate 2D condition groups. Each group is an AND/OR chain evaluated independently.
        /// Switch mode: returns the index of the first matching group, or -1 if none match.
        /// Dispatcher mode: returns a List of all matching group indices.
        /// </summary>
        public static object EvaluateConditionGroups(
            List<List<ExportCondition>> groups,
            Func<ExportCondition, bool> evaluator,
            bool dispatcher = false)
        {
            if (dispatcher)
            {
                var matched = new List<int>();
                for (int i = 0; i < groups.Count; i++)
                {
                    if (EvaluateConditionChain(groups[i], evaluator))
                        matched.Add(i);
                }
                return matched;
            }
            // Switch mode: first match wins
            for (int i = 0; i < groups.Count; i++)
            {
                if (EvaluateConditionChain(groups[i], evaluator))
                    return i;
            }
            return -1;
        }

        /// <summary>
        /// Filter choices by their visibilityConditions.
        /// Choices with no conditions or passing conditions are kept.
        ///
        /// When <paramref name="scene"/> is provided, <c>choice:</c> conditions are resolved
        /// automatically via the scene's internal choice history — the developer never sees them.
        /// Non-choice conditions are delegated to the <paramref name="evaluator"/> callback.
        /// </summary>
        public static List<ChoiceItem> FilterVisibleChoices(
            List<ChoiceItem> choices,
            Func<ExportCondition, bool> evaluator,
            ISceneHandle? scene = null)
        {
            var result = new List<ChoiceItem>();
            foreach (var choice in choices)
            {
                if (choice.VisibilityConditions == null || choice.VisibilityConditions.Count == 0)
                {
                    result.Add(choice);
                }
                else if (EvaluateConditionChain(choice.VisibilityConditions, cond =>
                {
                    if (scene != null && cond.Key.StartsWith("choice:"))
                    {
                        return scene.EvaluateCondition(cond);
                    }
                    return evaluator(cond);
                }))
                {
                    result.Add(choice);
                }
            }
            return result;
        }
    }
}

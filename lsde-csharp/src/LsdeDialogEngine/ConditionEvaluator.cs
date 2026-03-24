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
        /// Filter choices by their visibilityConditions.
        /// Choices with no conditions or passing conditions are kept.
        /// </summary>
        public static List<ChoiceItem> FilterVisibleChoices(
            List<ChoiceItem> choices,
            Func<ExportCondition, bool> evaluator)
        {
            var result = new List<ChoiceItem>();
            foreach (var choice in choices)
            {
                if (choice.VisibilityConditions == null || choice.VisibilityConditions.Count == 0)
                {
                    result.Add(choice);
                }
                else if (EvaluateConditionChain(choice.VisibilityConditions, evaluator))
                {
                    result.Add(choice);
                }
            }
            return result;
        }
    }
}

// LSDE Dialog Engine — Context factory per block type (C# port of block-context.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    // ─── Internal context classes (engine-internal state) ─────────────────────────

    internal class InternalDialogContext : IDialogContext
    {
        internal bool GlobalPrevented;
        internal int? CharacterPortIndex;
        private readonly List<BlockCharacter> _characters;

        public BlockCharacter? Character { get; }

        internal InternalDialogContext(DialogBlock block)
        {
            Character = Utils.GetFirstCharacter(block);
            _characters = block.Metadata?.Characters ?? new List<BlockCharacter>();
        }

        public void ResolveCharacterPort(string characterName)
        {
            for (int i = 0; i < _characters.Count; i++)
            {
                if (_characters[i].Name == characterName)
                {
                    CharacterPortIndex = i;
                    return;
                }
            }
            CharacterPortIndex = null;
        }

        public void PreventGlobalHandler() => GlobalPrevented = true;
    }

    internal class InternalChoiceContext : IChoiceContext
    {
        internal bool GlobalPrevented;
        internal string? SelectedChoiceUuid;

        public IReadOnlyList<ChoiceItem> Choices { get; }

        internal InternalChoiceContext(List<ChoiceItem> visibleChoices)
        {
            Choices = visibleChoices;
        }

        public void SelectChoice(string choiceUuid)
        {
            SelectedChoiceUuid = choiceUuid;
        }

        public void PreventGlobalHandler() => GlobalPrevented = true;
    }

    internal class InternalConditionContext : IConditionContext
    {
        internal bool GlobalPrevented;
        internal bool? ConditionResult;

        public void Resolve(bool result)
        {
            ConditionResult = result;
        }

        public void PreventGlobalHandler() => GlobalPrevented = true;
    }

    internal class InternalActionContext : IActionContext
    {
        internal bool GlobalPrevented;
        internal bool ActionRejected;

        public void Resolve()
        {
            ActionRejected = false;
        }

        public void Reject(object? error)
        {
            ActionRejected = true;
        }

        public void PreventGlobalHandler() => GlobalPrevented = true;
    }

    // ─── Factory ─────────────────────────────────────────────────────────────────

    internal static class BlockContextFactory
    {
        internal static InternalDialogContext CreateDialogContext(DialogBlock block)
        {
            return new InternalDialogContext(block);
        }

        internal static InternalChoiceContext CreateChoiceContext(
            ChoiceBlock block,
            Func<ExportCondition, bool> evaluator)
        {
            var choices = block.Choices ?? new List<ChoiceItem>();
            var visibleChoices = ConditionEvaluator.FilterVisibleChoices(choices, evaluator);
            return new InternalChoiceContext(visibleChoices);
        }

        internal static InternalConditionContext CreateConditionContext()
        {
            return new InternalConditionContext();
        }

        internal static InternalActionContext CreateActionContext()
        {
            return new InternalActionContext();
        }
    }
}

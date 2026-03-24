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

        internal InternalDialogContext(DialogBlock block, BlockCharacter? resolvedCharacter)
        {
            Character = resolvedCharacter;
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

        public BlockCharacter? Character { get; }
        public IReadOnlyList<ChoiceItem> Choices { get; }

        internal InternalChoiceContext(List<ChoiceItem> visibleChoices, BlockCharacter? resolvedCharacter)
        {
            Choices = visibleChoices;
            Character = resolvedCharacter;
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

        public BlockCharacter? Character { get; }

        internal InternalConditionContext(BlockCharacter? resolvedCharacter)
        {
            Character = resolvedCharacter;
        }

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

        public BlockCharacter? Character { get; }

        internal InternalActionContext(BlockCharacter? resolvedCharacter)
        {
            Character = resolvedCharacter;
        }

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
        internal static InternalDialogContext CreateDialogContext(DialogBlock block, BlockCharacter? resolvedCharacter)
        {
            return new InternalDialogContext(block, resolvedCharacter);
        }

        internal static InternalChoiceContext CreateChoiceContext(
            ChoiceBlock block,
            Func<ExportCondition, bool> evaluator,
            BlockCharacter? resolvedCharacter)
        {
            var choices = block.Choices ?? new List<ChoiceItem>();
            var visibleChoices = ConditionEvaluator.FilterVisibleChoices(choices, evaluator);
            return new InternalChoiceContext(visibleChoices, resolvedCharacter);
        }

        internal static InternalConditionContext CreateConditionContext(BlockCharacter? resolvedCharacter)
        {
            return new InternalConditionContext(resolvedCharacter);
        }

        internal static InternalActionContext CreateActionContext(BlockCharacter? resolvedCharacter)
        {
            return new InternalActionContext(resolvedCharacter);
        }
    }
}

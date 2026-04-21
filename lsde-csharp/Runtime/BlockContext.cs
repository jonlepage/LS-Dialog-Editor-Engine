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

        public void ResolveCharacterPort(string characterUuid)
        {
            // Primary: match by UUID
            for (int i = 0; i < _characters.Count; i++)
            {
                if (_characters[i].Uuid == characterUuid)
                {
                    CharacterPortIndex = i;
                    return;
                }
            }
            // Fallback: match by name (compat)
            for (int i = 0; i < _characters.Count; i++)
            {
                if (_characters[i].Name == characterUuid)
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
        private readonly string _blockUuid;
        private readonly Action<string, string>? _onChoiceSelected;

        public BlockCharacter? Character { get; }
        public IReadOnlyList<RuntimeChoiceItem> Choices { get; }

        internal InternalChoiceContext(
            string blockUuid,
            IReadOnlyList<RuntimeChoiceItem> taggedChoices,
            BlockCharacter? resolvedCharacter,
            Action<string, string>? onChoiceSelected)
        {
            _blockUuid = blockUuid;
            Choices = taggedChoices;
            Character = resolvedCharacter;
            _onChoiceSelected = onChoiceSelected;
        }

        public void SelectChoice(string choiceUuid)
        {
            SelectedChoiceUuid = choiceUuid;
            _onChoiceSelected?.Invoke(_blockUuid, choiceUuid);
        }

        public void PreventGlobalHandler() => GlobalPrevented = true;
    }

    internal class InternalConditionContext : IConditionContext
    {
        internal bool GlobalPrevented;
        internal object? _conditionResult;

        public BlockCharacter? Character { get; }
        public IReadOnlyList<RuntimeConditionGroup>? ConditionGroups { get; }

        internal InternalConditionContext(
            BlockCharacter? resolvedCharacter,
            IReadOnlyList<RuntimeConditionGroup>? conditionGroups = null)
        {
            Character = resolvedCharacter;
            ConditionGroups = conditionGroups;
        }

        public void Resolve(object result)
        {
            _conditionResult = result;
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
            IReadOnlyList<RuntimeChoiceItem> taggedChoices,
            Action<string, string>? onChoiceSelected,
            BlockCharacter? resolvedCharacter)
        {
            return new InternalChoiceContext(block.Uuid, taggedChoices, resolvedCharacter, onChoiceSelected);
        }

        internal static InternalConditionContext CreateConditionContext(
            BlockCharacter? resolvedCharacter,
            IReadOnlyList<RuntimeConditionGroup>? conditionGroups = null)
        {
            return new InternalConditionContext(resolvedCharacter, conditionGroups);
        }

        internal static InternalActionContext CreateActionContext(BlockCharacter? resolvedCharacter)
        {
            return new InternalActionContext(resolvedCharacter);
        }
    }
}

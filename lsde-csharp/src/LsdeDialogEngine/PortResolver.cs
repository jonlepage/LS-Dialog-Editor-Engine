// LSDE Dialog Engine — Port resolution (C# port of port-resolver.ts)
// Critical algorithm — must be identical across all runtimes.

using System.Collections.Generic;

namespace LsdeDialogEngine
{
    public static class PortResolver
    {
        /// <summary>
        /// Determine which outgoing connections to follow based on block type and context.
        /// Returns ALL matching connections — the caller decides which are main vs async tracks.
        /// </summary>
        public static PortResolutionResult ResolvePort(PortResolutionInput input)
        {
            var block = input.Block;
            var connections = input.Connections;

            switch (block.Type)
            {
                case BlockType.DIALOG:
                    return ResolveDialogPort(connections, input.CharacterPortIndex);

                case BlockType.CHOICE:
                    return ResolveChoicePort(connections, input.SelectedChoiceUuid);

                case BlockType.CONDITION:
                    return ResolveConditionPort(connections, input.ConditionResult);

                case BlockType.ACTION:
                    return ResolveActionPort(connections, input.ActionRejected);

                case BlockType.NOTE:
                    return new PortResolutionResult(new List<BlueprintConnection>(connections));

                default:
                    return PortResolutionResult.None;
            }
        }

        private static PortResolutionResult ResolveDialogPort(
            List<BlueprintConnection> connections,
            int? characterPortIndex)
        {
            if (characterPortIndex.HasValue)
            {
                var matches = new List<BlueprintConnection>();
                foreach (var c in connections)
                {
                    if (c.FromPortIndex == characterPortIndex.Value)
                        matches.Add(c);
                }
                if (matches.Count > 0) return new PortResolutionResult(matches);
                // Fallback to 'out' when character port index not found
            }
            return FilterByFromPort(connections, "out");
        }

        private static PortResolutionResult ResolveChoicePort(
            List<BlueprintConnection> connections,
            string? selectedChoiceUuid)
        {
            if (selectedChoiceUuid == null) return PortResolutionResult.None;
            return FilterByFromPort(connections, selectedChoiceUuid);
        }

        private static PortResolutionResult ResolveConditionPort(
            List<BlueprintConnection> connections,
            bool? conditionResult)
        {
            if (!conditionResult.HasValue) return PortResolutionResult.None;
            int targetIndex = conditionResult.Value ? 0 : 1;
            var matches = new List<BlueprintConnection>();
            foreach (var c in connections)
            {
                if (c.FromPortIndex == targetIndex)
                    matches.Add(c);
            }
            return new PortResolutionResult(matches);
        }

        private static PortResolutionResult ResolveActionPort(
            List<BlueprintConnection> connections,
            bool? actionRejected)
        {
            if (actionRejected == true)
            {
                var catchPorts = new List<BlueprintConnection>();
                foreach (var c in connections)
                {
                    if (c.FromPort == "catch")
                        catchPorts.Add(c);
                }
                if (catchPorts.Count > 0) return new PortResolutionResult(catchPorts);
                // Fallback to 'then' on reject when no catch port
            }
            return FilterByFromPort(connections, "then");
        }

        private static PortResolutionResult FilterByFromPort(
            List<BlueprintConnection> connections,
            string port)
        {
            var matches = new List<BlueprintConnection>();
            foreach (var c in connections)
            {
                if (c.FromPort == port)
                    matches.Add(c);
            }
            return new PortResolutionResult(matches);
        }
    }
}

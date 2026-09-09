// LSDE Dialog Engine — Port resolution (C# port of port-resolver.ts)
//
// This function decides where the flow goes next, and it is the one piece of the engine that must
// behave identically in all four runtimes — a divergence here does not throw, it sends a player
// down the wrong branch.
//
// It routes on PORT NAMES. In v1 it routed on FromPortIndex, a position in a list, and that is the
// single change that broke the loudest: a v1 engine on a v2 payload found no connection at all on
// a dialog with per-character ports, on the true branch of a condition, on every switch case. The
// scene stopped where the player expected a branch, and nothing was logged.
//
// The ports, per block type:
//
//   dialog     "out", or one port per actor CARD ID with PortPerCharacter — "out" is the fallback
//   choice     the picked option's id (C1…) — there is no "out" on a choice
//   condition  "out" (true) and "default" (false), or K1… per case with PortPerCase
//   router     the K1… of EVERY case that held, then "then" (all held) or "catch" (one did not)
//   action     "then", and "catch" when a call failed
//   note       never dispatched; the traversal steps over it
//
// The block decides WHICH port; this file only finds the wires on it. A port the writer left
// unwired resolves to nothing, and nothing is a legitimate end of flow — "default" is the fallback
// for "no case matched", not for "that exit has no wire".

using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>Resolves a PORT NAME to the wires leaving it. The one algorithm that must be equivalent byte for byte across every runtime: a divergence here does not crash, it sends a player down a branch the writer never drew.</summary>
    public static class PortResolver
    {
        /// <summary>
        /// Pick the outgoing links to follow, given a block and what happened while it ran.
        /// <para>Returns EVERY matching link. Deciding which one is the main track and which run in
        /// parallel belongs to the traversal, not here — this function is pure and knows nothing
        /// about tracks.</para>
        /// </summary>
        public static PortResolutionResult ResolvePort(PortResolutionInput input)
        {
            var block = input.Block;
            var links = input.Links;

            switch (block.Type)
            {
                case BlockType.Dialog:
                    return ResolveDialogPort(links, input.ActorPort);

                case BlockType.Choice:
                    return ResolveChoicePort(links, input.SelectedOptionId);

                case BlockType.Condition:
                    return ResolveConditionPort(links, input.ConditionPort);

                case BlockType.Router:
                    return ResolveRouterPorts(links, input.RouterPorts);

                case BlockType.Action:
                    return ResolveActionPort(links, input.ActionRejected);

                case BlockType.Note:
                    return new PortResolutionResult(new List<Link>(links));

                default:
                    // A block type this engine does not know — a v1 payload, say — routes nowhere
                    // rather than to the wrong handler.
                    return PortResolutionResult.None;
            }
        }

        /// <summary>
        /// A dialog leaves by "out".
        /// <para>With PortPerCharacter it grows one port per actor instead, named by the actor's
        /// CARD ID (var1, var2) — the same id Block.Actors lists. "out" stays as the "else" exit:
        /// a dialog whose actor has no port of its own still goes somewhere.</para>
        /// </summary>
        private static PortResolutionResult ResolveDialogPort(List<Link> links, string? actorPort)
        {
            if (actorPort != null)
            {
                var matches = OnPort(links, actorPort);
                if (matches.Count > 0) return new PortResolutionResult(matches);
                // The actor has no port of its own — fall through to "out".
            }
            return new PortResolutionResult(OnPort(links, Ports.Out));
        }

        /// <summary>
        /// A choice leaves by the id of the option the player picked — C1, C2. That id IS the port.
        /// <para>There is no "out" and no fallback: until an option is picked there is nowhere to
        /// go, and an option the writer left unwired ends the flow. Both are the drawing.</para>
        /// </summary>
        private static PortResolutionResult ResolveChoicePort(List<Link> links, string? selectedOptionId)
        {
            // Empty counts as "nothing picked", like the reference implementation: an empty
            // string is not an option id, and a game writing SelectChoice(picked?.Id ?? "") must
            // not send the flow looking for a port named "".
            if (string.IsNullOrEmpty(selectedOptionId)) return PortResolutionResult.None;
            return new PortResolutionResult(OnPort(links, selectedOptionId));
        }

        /// <summary>
        /// A condition leaves by the port its cases picked — "out" or "default" in if mode, K1… or
        /// "default" with PortPerCase.
        /// <para>Which port that is was decided before we got here, by the condition evaluator: it
        /// is the only thing that knows the two modes and the game's answers. This function does
        /// not re-derive it. Null means nothing was decided, so nowhere to go.</para>
        /// </summary>
        private static PortResolutionResult ResolveConditionPort(List<Link> links, string? conditionPort)
        {
            if (conditionPort == null) return PortResolutionResult.None;
            return new PortResolutionResult(OnPort(links, conditionPort));
        }

        /// <summary>
        /// A router leaves by SEVERAL ports at once: the K* of each true case, then "then" or "catch".
        /// <para>Which ports those are was decided before we got here, by the condition evaluator —
        /// the same division of labour as a condition, and for the same reason: only it knows the
        /// game's answers.</para>
        /// <para>Order is preserved, and the continuation is last. That is what lets the traversal
        /// keep then/catch as the main flow: it takes the first non-async target, and in the
        /// arrangement LSDE recommends the case routes all carry IsAsync.</para>
        /// <para>A port with no wire contributes nothing and is not an error — a writer who launched
        /// nothing on a true case simply drew it that way. Null means nothing was decided, so
        /// nowhere to go.</para>
        /// </summary>
        private static PortResolutionResult ResolveRouterPorts(List<Link> links, List<string>? routerPorts)
        {
            if (routerPorts == null) return PortResolutionResult.None;

            var matches = new List<Link>();
            foreach (var port in routerPorts)
            {
                foreach (var link in links)
                {
                    if (link.Port == port) matches.Add(link);
                }
            }
            return new PortResolutionResult(matches);
        }

        /// <summary>
        /// An action leaves by "then" once its calls went through, and by "catch" when one failed.
        /// <para>A failure with no "catch" wired falls back to "then": the writer who drew no error
        /// branch meant the flow to carry on, and stopping the scene on an unhandled failure would
        /// strand the player mid-dialogue.</para>
        /// </summary>
        private static PortResolutionResult ResolveActionPort(List<Link> links, bool? actionRejected)
        {
            if (actionRejected == true)
            {
                var caught = OnPort(links, Ports.Catch);
                if (caught.Count > 0) return new PortResolutionResult(caught);
                // No error branch drawn — carry on through "then".
            }
            return new PortResolutionResult(OnPort(links, Ports.Then));
        }

        private static List<Link> OnPort(List<Link> links, string port)
        {
            var matches = new List<Link>();
            foreach (var link in links)
            {
                if (link.Port == port) matches.Add(link);
            }
            return matches;
        }
    }
}

// LSDE Dialog Engine — Handler registration + Tier 1/Tier 2 resolution (C# port of handler-registry.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    // Internal non-generic handler delegate used by the traversal loop
    internal delegate Action? InternalBlockHandler(ISceneHandle scene, BlueprintBlock block, IBaseBlockContext context, Action next);

    /// <summary>Stores global (Tier 1) handlers. Last-write-wins per slot.</summary>
    internal class HandlerRegistry
    {
        internal BlockHandler<BlueprintBlock, IDialogContext>? DialogHandler;
        internal BlockHandler<BlueprintBlock, IChoiceContext>? ChoiceHandler;
        internal BlockHandler<BlueprintBlock, IConditionContext>? ConditionHandler;
        internal BlockHandler<BlueprintBlock, IActionContext>? ActionHandler;

        internal SceneLifecycleHandler? SceneEnterHandler;
        internal SceneLifecycleHandler? SceneExitHandler;

        internal ValidateNextBlockHandler? ValidateNextBlockHandler;
        internal InvalidateBlockHandler? InvalidateBlockHandler;
        internal BeforeBlockHandler? BeforeBlockHandler;

        internal InternalBlockHandler? GetTypeHandler(string type)
        {
            switch (type)
            {
                case BlockType.Dialog:
                    return DialogHandler != null ? WrapHandler(DialogHandler) : null;
                case BlockType.Choice:
                    return ChoiceHandler != null ? WrapHandler(ChoiceHandler) : null;
                case BlockType.Condition:
                    return ConditionHandler != null ? WrapHandler(ConditionHandler) : null;
                case BlockType.Action:
                    return ActionHandler != null ? WrapHandler(ActionHandler) : null;
                default:
                    // A note is never dispatched, and a type this engine does not know is not either.
                    return null;
            }
        }

        private static InternalBlockHandler WrapHandler<TBlock, TContext>(BlockHandler<TBlock, TContext> handler)
            where TBlock : BlueprintBlock
            where TContext : IBaseBlockContext
        {
            return (scene, block, context, next) =>
                handler(new BlockHandlerArgs<TBlock, TContext>(scene, (TBlock)block, (TContext)context, next));
        }
    }

    /// <summary>Stores per-scene (Tier 2) handlers.</summary>
    internal class SceneHandlerRegistry
    {
        private readonly Dictionary<string, InternalBlockHandler> _blockHandlers = new Dictionary<string, InternalBlockHandler>();

        internal BlockHandler<BlueprintBlock, IDialogContext>? DialogHandler;
        internal BlockHandler<BlueprintBlock, IChoiceContext>? ChoiceHandler;
        internal BlockHandler<BlueprintBlock, IConditionContext>? ConditionHandler;
        internal BlockHandler<BlueprintBlock, IActionContext>? ActionHandler;

        internal SceneLifecycleHandler? EnterHandler;
        internal SceneLifecycleHandler? ExitHandler;

        internal void SetBlockHandler(string blockId, InternalBlockHandler handler)
        {
            _blockHandlers[blockId] = handler;
        }

        internal InternalBlockHandler? GetBlockHandler(string blockId)
        {
            return _blockHandlers.TryGetValue(blockId, out var handler) ? handler : null;
        }

        internal InternalBlockHandler? GetTypeHandler(string type)
        {
            switch (type)
            {
                case BlockType.Dialog:
                    return DialogHandler != null ? WrapHandler(DialogHandler) : null;
                case BlockType.Choice:
                    return ChoiceHandler != null ? WrapHandler(ChoiceHandler) : null;
                case BlockType.Condition:
                    return ConditionHandler != null ? WrapHandler(ConditionHandler) : null;
                case BlockType.Action:
                    return ActionHandler != null ? WrapHandler(ActionHandler) : null;
                default:
                    // A note is never dispatched, and a type this engine does not know is not either.
                    return null;
            }
        }

        private static InternalBlockHandler WrapHandler<TBlock, TContext>(BlockHandler<TBlock, TContext> handler)
            where TBlock : BlueprintBlock
            where TContext : IBaseBlockContext
        {
            return (scene, block, context, next) =>
                handler(new BlockHandlerArgs<TBlock, TContext>(scene, (TBlock)block, (TContext)context, next));
        }
    }

    /// <summary>Resolved handler pair (scene + global).</summary>
    internal class ResolvedHandlers
    {
        internal InternalBlockHandler? SceneHandler;
        internal InternalBlockHandler? GlobalHandler;
    }

    internal static class HandlerResolver
    {
        /// <summary>
        /// Resolve which handlers to call for a given block.
        /// Priority: OnBlock(blockId) > scene.OnType > engine.OnType
        /// </summary>
        internal static ResolvedHandlers ResolveHandler(
            string blockType,
            string blockId,
            SceneHandlerRegistry? sceneRegistry,
            HandlerRegistry globalRegistry)
        {
            var globalHandler = globalRegistry.GetTypeHandler(blockType);

            if (sceneRegistry == null)
            {
                return new ResolvedHandlers { SceneHandler = null, GlobalHandler = globalHandler };
            }

            // Most specific: OnBlock(blockId)
            var blockOverride = sceneRegistry.GetBlockHandler(blockId);
            if (blockOverride != null)
            {
                return new ResolvedHandlers { SceneHandler = blockOverride, GlobalHandler = globalHandler };
            }

            // Scene type override
            var sceneTypeHandler = sceneRegistry.GetTypeHandler(blockType);
            if (sceneTypeHandler != null)
            {
                return new ResolvedHandlers { SceneHandler = sceneTypeHandler, GlobalHandler = globalHandler };
            }

            return new ResolvedHandlers { SceneHandler = null, GlobalHandler = globalHandler };
        }
    }
}

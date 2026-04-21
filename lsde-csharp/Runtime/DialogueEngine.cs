// LSDE Dialog Engine — Public facade (C# port of engine.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>LSDE Dialog Engine — callback-driven graph dispatcher.</summary>
    public class DialogueEngine
    {
        private BlueprintGraph? _graph;
        private readonly HandlerRegistry _globalRegistry = new HandlerRegistry();
        private string _locale = "";
        private readonly Dictionary<string, SceneHandleImpl> _activeScenes = new Dictionary<string, SceneHandleImpl>();
        private bool _initialized;
        /// <summary>Character resolution callback. Default: first character in the list.</summary>
        private Func<List<BlockCharacter>, BlockCharacter?> _resolveCharacter = chars => chars.Count > 0 ? chars[0] : null;
        /// <summary>Unified condition resolver for choice visibility and condition block pre-evaluation.</summary>
        private Func<ExportCondition, bool>? _conditionResolver;

        // ─── Initialization ──────────────────────────────────────────────

        /// <summary>Validate blueprint data, build internal graph, return diagnostic report.</summary>
        public DiagnosticReport Init(InitOptions options)
        {
            var report = Validator.ValidateBlueprint(options);

            if (report.Errors.Count == 0)
            {
                _graph = new BlueprintGraph(options.Data);
                _initialized = true;
            }

            return report;
        }

        /// <summary>Set the active locale for text resolution.</summary>
        public void SetLocale(string locale)
        {
            if (_graph != null)
            {
                var validLocales = _graph.GetLocales();
                if (validLocales.Count > 0 && !validLocales.Contains(locale))
                {
                    throw new InvalidOperationException(
                        $"Invalid locale \"{locale}\". Available locales: {string.Join(", ", validLocales)}");
                }
            }
            _locale = locale;
            LsdeUtils.Locale = locale;
        }

        // ─── Character resolution ────────────────────────────────────────

        /// <summary>Set the character resolution callback used to pick which character is active on a block.</summary>
        public void OnResolveCharacter(Func<List<BlockCharacter>, BlockCharacter?> resolver)
        {
            _resolveCharacter = resolver;
        }

        /// <summary>Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
        /// The engine handles choice: conditions internally via choice history — this callback evaluates game-state conditions only.</summary>
        public void OnResolveCondition(Func<ExportCondition, bool> evaluator)
        {
            _conditionResolver = evaluator;
        }

        /// <summary>Set the choice visibility evaluator.</summary>
        [Obsolete("Use OnResolveCondition() instead.")]
        public void SetChoiceFilter(Func<ExportCondition, bool> evaluator)
        {
            _conditionResolver = evaluator;
        }

        // ─── Validation ──────────────────────────────────────────────────

        /// <summary>Register a handler called before each block to validate it.</summary>
        public void OnValidateNextBlock(ValidateNextBlockHandler handler)
        {
            _globalRegistry.ValidateNextBlockHandler = handler;
        }

        /// <summary>Register a handler called when a block fails validation.</summary>
        public void OnInvalidateBlock(InvalidateBlockHandler handler)
        {
            _globalRegistry.InvalidateBlockHandler = handler;
        }

        // ─── Pre-execution ───────────────────────────────────────────────

        /// <summary>Register a handler called before every block. Must call resolve() to continue.</summary>
        public void OnBeforeBlock(BeforeBlockHandler handler)
        {
            _globalRegistry.BeforeBlockHandler = handler;
        }

        // ─── Type handlers ───────────────────────────────────────────────

        /// <summary>Register a global handler for DIALOG blocks (with optional cleanup).</summary>
        public void OnDialog(BlockHandler<DialogBlock, IDialogContext> handler)
        {
            _globalRegistry.DialogHandler = handler;
        }

        /// <summary>Register a global handler for DIALOG blocks (no cleanup).</summary>
        public void OnDialog(Action<BlockHandlerArgs<DialogBlock, IDialogContext>> handler)
        {
            _globalRegistry.DialogHandler = args => { handler(args); return null; };
        }

        /// <summary>Register a global handler for CHOICE blocks (with optional cleanup).</summary>
        public void OnChoice(BlockHandler<ChoiceBlock, IChoiceContext> handler)
        {
            _globalRegistry.ChoiceHandler = handler;
        }

        /// <summary>Register a global handler for CHOICE blocks (no cleanup).</summary>
        public void OnChoice(Action<BlockHandlerArgs<ChoiceBlock, IChoiceContext>> handler)
        {
            _globalRegistry.ChoiceHandler = args => { handler(args); return null; };
        }

        /// <summary>Register a global handler for CONDITION blocks (with optional cleanup).</summary>
        public void OnCondition(BlockHandler<ConditionBlock, IConditionContext> handler)
        {
            _globalRegistry.ConditionHandler = handler;
        }

        /// <summary>Register a global handler for CONDITION blocks (no cleanup).</summary>
        public void OnCondition(Action<BlockHandlerArgs<ConditionBlock, IConditionContext>> handler)
        {
            _globalRegistry.ConditionHandler = args => { handler(args); return null; };
        }

        /// <summary>Register a global handler for ACTION blocks (with optional cleanup).</summary>
        public void OnAction(BlockHandler<ActionBlock, IActionContext> handler)
        {
            _globalRegistry.ActionHandler = handler;
        }

        /// <summary>Register a global handler for ACTION blocks (no cleanup).</summary>
        public void OnAction(Action<BlockHandlerArgs<ActionBlock, IActionContext>> handler)
        {
            _globalRegistry.ActionHandler = args => { handler(args); return null; };
        }

        // ─── Scene lifecycle ─────────────────────────────────────────────

        /// <summary>Register a handler called when any scene starts.</summary>
        public void OnSceneEnter(SceneLifecycleHandler handler)
        {
            _globalRegistry.SceneEnterHandler = handler;
        }

        /// <summary>Register a handler called when any scene ends.</summary>
        public void OnSceneExit(SceneLifecycleHandler handler)
        {
            _globalRegistry.SceneExitHandler = handler;
        }

        // ─── Scene handles ───────────────────────────────────────────────

        /// <summary>Create a scene handle. Does NOT start the flow — call handle.Start().</summary>
        public ISceneHandle Scene(string sceneId)
        {
            if (!_initialized || _graph == null)
            {
                throw new InvalidOperationException("Engine not initialized. Call Init() first.");
            }

            var sceneGraph = _graph.GetSceneGraph(sceneId);
            if (sceneGraph == null)
            {
                throw new InvalidOperationException($"Scene \"{sceneId}\" not found.");
            }

            var handle = new SceneHandleImpl(sceneGraph, _globalRegistry, new SceneHandleCallbacks
            {
                OnSceneStarted = h => _activeScenes[sceneId] = h,
                OnSceneEnded = _ => _activeScenes.Remove(sceneId),
                GetResolveCharacter = () => _resolveCharacter,
                GetConditionResolver = () => _conditionResolver,
                GetLocale = () => _locale,
            });

            return handle;
        }

        // ─── Engine control ──────────────────────────────────────────────

        /// <summary>Stop all active scenes.</summary>
        public void Stop()
        {
            var handles = new List<SceneHandleImpl>(_activeScenes.Values);
            foreach (var handle in handles)
            {
                handle.Cancel();
            }
        }

        /// <summary>True if at least one scene is active.</summary>
        public bool IsRunning() => _activeScenes.Count > 0;

        /// <summary>Get all currently active scene handles.</summary>
        public List<ISceneHandle> GetActiveScenes()
        {
            var result = new List<ISceneHandle>();
            foreach (var handle in _activeScenes.Values)
            {
                result.Add(handle);
            }
            return result;
        }

        /// <summary>Get the current block of every active scene.</summary>
        public List<BlueprintBlock> GetCurrentBlocks()
        {
            var blocks = new List<BlueprintBlock>();
            foreach (var handle in _activeScenes.Values)
            {
                var block = handle.GetCurrentBlock();
                if (block != null) blocks.Add(block);
            }
            return blocks;
        }

        /// <summary>Get connections for a scene (for inter-scene navigation).</summary>
        public List<BlueprintConnection> GetSceneConnections(string sceneId)
        {
            if (_graph == null) return new List<BlueprintConnection>();
            return _graph.GetSceneConnections(sceneId);
        }
    }
}

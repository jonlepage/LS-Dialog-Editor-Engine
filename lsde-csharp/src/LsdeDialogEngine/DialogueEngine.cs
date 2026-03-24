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
        private IStateBridge? _stateBridge;
        private string _locale = "";
        private readonly Dictionary<string, SceneHandleImpl> _activeScenes = new Dictionary<string, SceneHandleImpl>();
        private bool _initialized;

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
            _locale = locale;
        }

        // ─── StateBridge ─────────────────────────────────────────────────

        /// <summary>Set the bridge between the engine and the game state.</summary>
        public void SetStateBridge(IStateBridge bridge)
        {
            _stateBridge = bridge;
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

        /// <summary>Register a global handler for DIALOG blocks.</summary>
        public void OnDialog(BlockHandler<IDialogContext> handler)
        {
            _globalRegistry.DialogHandler = handler;
        }

        /// <summary>Register a global handler for CHOICE blocks.</summary>
        public void OnChoice(BlockHandler<IChoiceContext> handler)
        {
            _globalRegistry.ChoiceHandler = handler;
        }

        /// <summary>Register a global handler for CONDITION blocks.</summary>
        public void OnCondition(BlockHandler<IConditionContext> handler)
        {
            _globalRegistry.ConditionHandler = handler;
        }

        /// <summary>Register a global handler for ACTION blocks.</summary>
        public void OnAction(BlockHandler<IActionContext> handler)
        {
            _globalRegistry.ActionHandler = handler;
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
                GetStateBridge = () => _stateBridge,
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

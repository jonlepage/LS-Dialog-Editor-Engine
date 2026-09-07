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
        /// <summary>
        /// Which actor of a block is the one speaking. Defaults to the first.
        /// <para>LSDE deliberately refuses to say what the order of Actors means — whether it is
        /// who speaks or who is present is a decision each game makes. The default picks the first
        /// because a default has to pick something, not because the format says so.</para>
        /// </summary>
        private Func<List<Card>, Card?> _resolveCharacter = actors => actors.Count > 0 ? actors[0] : null;
        /// <summary>Unified condition resolver for choice visibility and condition block pre-evaluation.</summary>
        private Func<ConditionTest, bool>? _conditionResolver;

        // ─── Initialization ──────────────────────────────────────────────

        /// <summary>
        /// Load a payload and report what is wrong with it.
        /// <para>Takes one export in Data, or the several files of a per-scene one in Files — each
        /// of those carries the whole header, so they are folded into a single payload after
        /// checking they come from one export.</para>
        /// <para>The engine is initialized only when there are no errors: a payload it cannot read
        /// leaves it unusable rather than half-loaded.</para>
        /// </summary>
        public DiagnosticReport Init(InitOptions options)
        {
            var report = Validator.ValidateBlueprint(options);

            if (report.Errors.Count == 0)
            {
                var payload = options.Files != null
                    ? Validator.MergePayloads(options.Files, out _)
                    : options.Data;

                if (payload != null)
                {
                    _graph = new BlueprintGraph(payload);
                    _initialized = true;
                }
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
        public void OnResolveCharacter(Func<List<Card>, Card?> resolver)
        {
            _resolveCharacter = resolver;
        }

        /// <summary>Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
        /// The engine handles choice: conditions internally via choice history — this callback evaluates game-state conditions only.</summary>
        public void OnResolveCondition(Func<ConditionTest, bool> evaluator)
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
        public void OnDialog(BlockHandler<BlueprintBlock, IDialogContext> handler)
        {
            _globalRegistry.DialogHandler = handler;
        }

        /// <summary>Register a global handler for DIALOG blocks (no cleanup).</summary>
        public void OnDialog(Action<BlockHandlerArgs<BlueprintBlock, IDialogContext>> handler)
        {
            _globalRegistry.DialogHandler = args => { handler(args); return null; };
        }

        /// <summary>Register a global handler for CHOICE blocks (with optional cleanup).</summary>
        public void OnChoice(BlockHandler<BlueprintBlock, IChoiceContext> handler)
        {
            _globalRegistry.ChoiceHandler = handler;
        }

        /// <summary>Register a global handler for CHOICE blocks (no cleanup).</summary>
        public void OnChoice(Action<BlockHandlerArgs<BlueprintBlock, IChoiceContext>> handler)
        {
            _globalRegistry.ChoiceHandler = args => { handler(args); return null; };
        }

        /// <summary>Register a global handler for CONDITION blocks (with optional cleanup).</summary>
        public void OnCondition(BlockHandler<BlueprintBlock, IConditionContext> handler)
        {
            _globalRegistry.ConditionHandler = handler;
        }

        /// <summary>Register a global handler for CONDITION blocks (no cleanup).</summary>
        public void OnCondition(Action<BlockHandlerArgs<BlueprintBlock, IConditionContext>> handler)
        {
            _globalRegistry.ConditionHandler = args => { handler(args); return null; };
        }

        /// <summary>Register a global handler for ACTION blocks (with optional cleanup).</summary>
        public void OnAction(BlockHandler<BlueprintBlock, IActionContext> handler)
        {
            _globalRegistry.ActionHandler = handler;
        }

        /// <summary>Register a global handler for ACTION blocks (no cleanup).</summary>
        public void OnAction(Action<BlockHandlerArgs<BlueprintBlock, IActionContext>> handler)
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

        /// <summary>
        /// Open a scene by its path (reactor_breach) or by its stable id (sc_u0vqg2g8).
        /// <para>Take the id wherever the reference is stored OUTSIDE the payload — a Unity asset, a
        /// save file, a database row. The path is what a writer reads and what builds the i18n
        /// keys, but it changes the day someone renames the scene, and a serialized path then stops
        /// resolving with no compiler to catch it. The id survives a rename.</para>
        /// <para>Does NOT start the flow — call handle.Start().</para>
        /// </summary>
        public ISceneHandle Scene(string sceneRef)
        {
            if (!_initialized || _graph == null)
            {
                throw new InvalidOperationException("Engine not initialized. Call Init() first.");
            }

            var graph = _graph;
            var sceneGraph = graph.GetSceneGraph(sceneRef);
            if (sceneGraph == null)
            {
                throw new InvalidOperationException($"Scene \"{sceneRef}\" not found.");
            }

            var handle = new SceneHandleImpl(sceneGraph, _globalRegistry, new SceneHandleCallbacks
            {
                OnSceneStarted = h => _activeScenes[sceneRef] = h,
                // Only if the entry still points at the handle that is ending. Nothing stops a
                // game from opening the same scene twice — a hub revisited while a first pass is
                // parked on a handler — and a blind remove then dropped the LIVE one from the
                // registry: the engine reported itself idle while a scene was still running, and
                // Stop() no longer reached it.
                OnSceneEnded = h =>
                {
                    if (_activeScenes.TryGetValue(sceneRef, out var current) && ReferenceEquals(current, h))
                    {
                        _activeScenes.Remove(sceneRef);
                    }
                },
                GetResolveCharacter = () => _resolveCharacter,
                GetConditionResolver = () => _conditionResolver,
                GetCard = cardId => graph.GetCard(cardId),
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
        public List<BlueprintConnection> GetSceneConnections(string sceneRef)
        {
            if (_graph == null) return new List<BlueprintConnection>();
            return _graph.GetSceneConnections(sceneRef);
        }
    }
}

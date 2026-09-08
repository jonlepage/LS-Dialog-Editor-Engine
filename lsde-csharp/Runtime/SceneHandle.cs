// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop (C# port of scene-handle.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    internal class SceneHandleCallbacks
    {
        internal Action<SceneHandleImpl>? OnSceneStarted;
        internal Action<SceneHandleImpl>? OnSceneEnded;
        internal Func<Func<List<Card>, Card?>>? GetResolveCharacter;
        internal Func<Func<ConditionTest, bool>?>? GetConditionResolver;

        /// <summary>Look a card id (var1) up in the export's Cards table.</summary>
        internal Func<string, Card?>? GetCard;
    }


    // ─── SceneHandleImpl ─────────────────────────────────────────────────────────

    internal class SceneHandleImpl : ISceneHandle, ITrackHost
    {
        private readonly SceneGraph _sceneGraph;
        private readonly HandlerRegistry _globalRegistry;
        private readonly SceneHandlerRegistry _sceneRegistry = new SceneHandlerRegistry();
        private readonly SceneHandleCallbacks _callbacks;

        private bool _running;

        // ─── Shared by every track of this scene ─────────────────────────
        private readonly HashSet<string> _visited = new HashSet<string>();
        private readonly Dictionary<string, List<string>> _choiceHistory = new Dictionary<string, List<string>>();
        /// <summary>Tracks — the main flow included — parked until a set of blocks has been visited.</summary>
        private readonly Dictionary<IWaiter, List<string>> _pendingWaits = new Dictionary<IWaiter, List<string>>();

        // ─── The tracks ──────────────────────────────────────────────────
        /// <summary>Every live track, the main flow first.</summary>
        private readonly List<Track> _tracks = new List<Track>();
        /// <summary>The flow the player is watching. Null until Start().</summary>
        private Track? _mainTrack;
        /// <summary>Auto-incremented track id. Track.MainTrackId (0) belongs to the main flow.</summary>
        private int _nextTrackId = Track.MainTrackId + 1;
        private Func<List<Card>, Card?>? _resolveCharacter;

        internal SceneHandleImpl(
            SceneGraph sceneGraph,
            HandlerRegistry globalRegistry,
            SceneHandleCallbacks callbacks)
        {
            _sceneGraph = sceneGraph;
            _globalRegistry = globalRegistry;
            _callbacks = callbacks;
        }

        // ─── Public API ──────────────────────────────────────────────────────

        public void Start()
        {
            if (_running) return;

            var missing = new List<string>();
            if (_sceneRegistry.DialogHandler == null && _globalRegistry.DialogHandler == null) missing.Add("OnDialog");
            if (_sceneRegistry.ChoiceHandler == null && _globalRegistry.ChoiceHandler == null) missing.Add("OnChoice");
            // onCondition is optional when onResolveCondition is installed — the engine auto-routes
            // from pre-evaluated conditionGroups. The handler becomes a logging/override hook.
            if (_sceneRegistry.ConditionHandler == null && _globalRegistry.ConditionHandler == null
                && _callbacks.GetConditionResolver?.Invoke() == null) missing.Add("OnCondition");
            if (_sceneRegistry.ActionHandler == null && _globalRegistry.ActionHandler == null) missing.Add("OnAction");
            if (missing.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Cannot start scene — missing required handler(s): {string.Join(", ", missing)}.\n" +
                    "Register all 4 handlers before starting:\n" +
                    "  engine.OnDialog(handler)\n  engine.OnChoice(handler)\n  engine.OnCondition(handler)\n  engine.OnAction(handler)");
            }

            _running = true;
            _callbacks.OnSceneStarted?.Invoke(this);

            FireSceneEnter();

            var startBlock = _sceneGraph.GetStartBlock();
            if (startBlock == null)
            {
                var fault = Shutdown();
                if (fault != null) throw fault;
                return;
            }

            // The flow the player watches is a track like any other. The only thing that sets it
            // apart is what happens when it ends — see TrackEnded.
            _mainTrack = new Track(this, startBlock, Track.MainTrackId, null);
            _tracks.Add(_mainTrack);
            _mainTrack.Start();
        }

        public void Cancel()
        {
            if (!_running) return;
            var fault = Shutdown();
            if (fault != null) throw fault;
        }

        public void OnEnter(SceneLifecycleHandler handler)
        {
            _sceneRegistry.EnterHandler = handler;
        }

        public void OnExit(SceneLifecycleHandler handler)
        {
            _sceneRegistry.ExitHandler = handler;
        }

        public void OnBlock(string blockId, BlockHandler<BlueprintBlock, IBaseBlockContext> handler)
        {
            _sceneRegistry.SetBlockHandler(blockId,
                (scene, block, context, next) => handler(new BlockHandlerArgs<BlueprintBlock, IBaseBlockContext>(scene, block, context, next)));
        }

        public void OnDialogId(string blockId, BlockHandler<BlueprintBlock, IDialogContext> handler)
        {
            _sceneRegistry.SetBlockHandler(blockId,
                (scene, block, context, next) => handler(new BlockHandlerArgs<BlueprintBlock, IDialogContext>(scene, block, (IDialogContext)context, next)));
        }

        public void OnDialogId(string blockId, Action<BlockHandlerArgs<BlueprintBlock, IDialogContext>> handler)
        {
            OnDialogId(blockId, args => { handler(args); return null; });
        }

        public void OnChoiceId(string blockId, BlockHandler<BlueprintBlock, IChoiceContext> handler)
        {
            _sceneRegistry.SetBlockHandler(blockId,
                (scene, block, context, next) => handler(new BlockHandlerArgs<BlueprintBlock, IChoiceContext>(scene, block, (IChoiceContext)context, next)));
        }

        public void OnChoiceId(string blockId, Action<BlockHandlerArgs<BlueprintBlock, IChoiceContext>> handler)
        {
            OnChoiceId(blockId, args => { handler(args); return null; });
        }

        public void OnConditionId(string blockId, BlockHandler<BlueprintBlock, IConditionContext> handler)
        {
            _sceneRegistry.SetBlockHandler(blockId,
                (scene, block, context, next) => handler(new BlockHandlerArgs<BlueprintBlock, IConditionContext>(scene, block, (IConditionContext)context, next)));
        }

        public void OnConditionId(string blockId, Action<BlockHandlerArgs<BlueprintBlock, IConditionContext>> handler)
        {
            OnConditionId(blockId, args => { handler(args); return null; });
        }

        public void OnActionId(string blockId, BlockHandler<BlueprintBlock, IActionContext> handler)
        {
            _sceneRegistry.SetBlockHandler(blockId,
                (scene, block, context, next) => handler(new BlockHandlerArgs<BlueprintBlock, IActionContext>(scene, block, (IActionContext)context, next)));
        }

        public void OnActionId(string blockId, Action<BlockHandlerArgs<BlueprintBlock, IActionContext>> handler)
        {
            OnActionId(blockId, args => { handler(args); return null; });
        }

        public void OnDialog(BlockHandler<BlueprintBlock, IDialogContext> handler)
        {
            _sceneRegistry.DialogHandler = handler;
        }

        public void OnDialog(Action<BlockHandlerArgs<BlueprintBlock, IDialogContext>> handler)
        {
            _sceneRegistry.DialogHandler = args => { handler(args); return null; };
        }

        public void OnChoice(BlockHandler<BlueprintBlock, IChoiceContext> handler)
        {
            _sceneRegistry.ChoiceHandler = handler;
        }

        public void OnChoice(Action<BlockHandlerArgs<BlueprintBlock, IChoiceContext>> handler)
        {
            _sceneRegistry.ChoiceHandler = args => { handler(args); return null; };
        }

        public void OnCondition(BlockHandler<BlueprintBlock, IConditionContext> handler)
        {
            _sceneRegistry.ConditionHandler = handler;
        }

        public void OnCondition(Action<BlockHandlerArgs<BlueprintBlock, IConditionContext>> handler)
        {
            _sceneRegistry.ConditionHandler = args => { handler(args); return null; };
        }

        public void OnAction(BlockHandler<BlueprintBlock, IActionContext> handler)
        {
            _sceneRegistry.ActionHandler = handler;
        }

        public void OnAction(Action<BlockHandlerArgs<BlueprintBlock, IActionContext>> handler)
        {
            _sceneRegistry.ActionHandler = args => { handler(args); return null; };
        }

        /// <summary>The block the flow the player is watching is on. Parallel tracks have their own.</summary>
        public BlueprintBlock? GetCurrentBlock() => _mainTrack?.GetCurrentBlock();

        public IReadOnlyCollection<string> GetVisitedBlocks() => _visited;

        public bool IsRunning() => _running;

        /// <summary>How many PARALLEL tracks are running. The main flow is not one of them.</summary>
        public int GetActiveTracks() => ParallelTracks().Count;

        public IReadOnlyList<TrackInfo> GetTrackInfos()
        {
            var result = new List<TrackInfo>();
            foreach (var track in ParallelTracks()) result.Add(track.GetTrackInfo());
            return result.AsReadOnly();
        }

        public IReadOnlyDictionary<string, IReadOnlyList<string>> GetChoiceHistory()
        {
            var result = new Dictionary<string, IReadOnlyList<string>>();
            foreach (var kvp in _choiceHistory)
            {
                result[kvp.Key] = kvp.Value.AsReadOnly();
            }
            return result;
        }

        public IReadOnlyList<string>? GetChoice(string blockId)
        {
            return _choiceHistory.TryGetValue(blockId, out var list) ? list.AsReadOnly() : null;
        }

        /// <summary>Evaluate a condition against the scene's choice history.
        /// Uses the unified resolver as fallback for non-choice conditions.
        /// Without a resolver, non-choice conditions default to false.</summary>
        public bool EvaluateCondition(ConditionTest test)
        {
            var resolver = _callbacks.GetConditionResolver?.Invoke();
            return EvaluateConditionWithHistory(test, resolver ?? (_ => false));
        }

        /// <summary>Set a scene-level character resolution override.</summary>
        public void OnResolveCharacter(Func<List<Card>, Card?> resolver)
        {
            _resolveCharacter = resolver;
        }

        // ─── ITrackHost — what a track asks the scene for ────────────────────

        public SceneGraph GetSceneGraph() => _sceneGraph;
        public SceneHandlerRegistry GetSceneRegistry() => _sceneRegistry;
        public HandlerRegistry GetGlobalRegistry() => _globalRegistry;
        public ISceneHandle AsSceneHandle() => this;
        public bool IsSceneRunning() => _running;
        public void AddVisited(string blockId)
        {
            _visited.Add(blockId);
            if (_pendingWaits.Count > 0)
            {
                var satisfied = new List<IWaiter>();
                foreach (var kvp in _pendingWaits)
                {
                    bool allVisited = true;
                    foreach (var u in kvp.Value)
                    {
                        if (!_visited.Contains(u)) { allVisited = false; break; }
                    }
                    if (allVisited) satisfied.Add(kvp.Key);
                }
                foreach (var waiter in satisfied)
                {
                    _pendingWaits.Remove(waiter);
                    waiter.NotifyWaitSatisfied();
                }
            }
        }

        /// <summary>Open a parallel track. Returns its id.</summary>
        public int SpawnTrack(BlueprintBlock startBlock, int? parentTrackId)
        {
            var id = _nextTrackId++;
            // null when the main flow opened it — the convention TrackInfo publishes.
            var parent = parentTrackId == Track.MainTrackId ? (int?)null : parentTrackId;
            var track = new Track(this, startBlock, id, parent);
            _tracks.Add(track);
            track.Start();
            return id;
        }

        public Exception? CancelTrack(int trackId)
        {
            foreach (var track in _tracks)
            {
                if (track.Id == trackId) return track.Cancel();
            }
            return null;
        }

        /// <summary>A track has nowhere left to go.</summary>
        /// <remarks>This is the ONE thing that tells the main flow apart from a parallel branch:
        /// when the main flow ends the scene is over — every other track is cancelled and
        /// OnSceneExit fires. When a branch ends it is simply retired and the scene plays on.</remarks>
        public Exception? TrackEnded(Track track)
        {
            if (track.Id == Track.MainTrackId) return Shutdown();
            RemoveTrack(track);
            return null;
        }

        /// <summary>Park a track (or the main flow) until every listed block has been visited.</summary>
        public void RegisterWaitForBlocks(IWaiter waiter, List<string> blockIds)
        {
            _pendingWaits[waiter] = blockIds;
        }

        public bool IsVisited(string blockId) => _visited.Contains(blockId);

        /// <summary>Run OnValidateNextBlock for a block, and OnInvalidateBlock when it refuses.</summary>
        /// <remarks>Called by BOTH the main flow and every parallel track. It used to live inline
        /// in the main flow only, so a game using this hook as a gate — "do not enter this block
        /// unless the player has the keycard" — was bypassed the moment a branch was marked
        /// IsAsync. Nothing in the hook's contract said it only applied to the flow the player was
        /// watching, and nothing on screen would have told anyone.</remarks>
        /// <returns>false when the caller must stop rather than dispatch the block.</returns>
        public bool RunValidation(BlueprintBlock block, BlueprintBlock? fromBlock, Card? fromCharacter)
        {
            var handler = _globalRegistry.ValidateNextBlockHandler;
            if (handler == null) return true;

            var result = handler(new ValidateNextBlockArgs
            {
                NextBlock = block,
                FromBlock = fromBlock,
                NextContext = new ValidateNextBlockContext { Character = ResolveCardsFor(block).Character },
                FromContext = fromBlock != null ? new ValidateNextBlockContext { Character = fromCharacter } : null,
                Port = null
            });
            if (result.Valid) return true;

            _globalRegistry.InvalidateBlockHandler?.Invoke(new InvalidateBlockArgs
            {
                Scene = this,
                Reason = result.Reason ?? "validation_failed"
            });
            return false;
        }

        private void RemoveTrack(Track track)
        {
            int idx = _tracks.IndexOf(track);
            if (idx >= 0) _tracks.RemoveAt(idx);
        }

        private List<Track> ParallelTracks()
        {
            var result = new List<Track>();
            foreach (var track in _tracks)
            {
                if (track.Id != Track.MainTrackId && track.IsRunning()) result.Add(track);
            }
            return result;
        }

        public IBaseBlockContext? CreateBlockContext(BlueprintBlock block)
        {
            return CreateContext(block);
        }

        private void RecordChoice(string blockId, string optionId)
        {
            if (_choiceHistory.TryGetValue(blockId, out var existing))
            {
                existing.Add(optionId);
            }
            else
            {
                _choiceHistory[blockId] = new List<string> { optionId };
            }
        }

        /// <summary>
        /// Answer a test, taking the reserved "choice" dictionary on ourselves.
        /// <para>{ dict: "choice", entry: "CHOICE-001", value: "C1" } asks whether the player
        /// picked C1 at CHOICE-001 earlier IN THIS SCENE. The engine kept that history, so the
        /// question never reaches the game: it would otherwise have to mirror a record the engine
        /// already holds, and the two would drift. The memory starts and ends with the scene.</para>
        /// <para>A block that was never reached answers false for equals, true for notEquals.</para>
        /// </summary>
        private bool EvaluateConditionWithHistory(
            ConditionTest test,
            Func<ConditionTest, bool> fallbackEvaluator)
        {
            if (test.Dict != Ports.Choice) return fallbackEvaluator(test);

            bool negated = test.Op == ConditionOperator.NotEquals;
            if (!_choiceHistory.TryGetValue(test.Entry, out var history)) return negated;

            bool picked = history.Contains(test.Value?.ToString() ?? "");
            return negated ? !picked : picked;
        }

        /// <summary>
        /// The evaluator that ROUTES a condition block. Always present.
        /// <para>With no game resolver installed it still answers "choice" tests on its own, and
        /// says false to anything about game state — a scene that only asks about its own past
        /// answers therefore plays without a single line of game code, and one that asks about the
        /// world takes its default branch rather than stalling.</para>
        /// </summary>
        private Func<ConditionTest, bool> RoutingEvaluator()
        {
            var resolver = _callbacks.GetConditionResolver?.Invoke();
            if (resolver == null)
            {
                return test => test.Dict == Ports.Choice
                    && EvaluateConditionWithHistory(test, _ => false);
            }
            return test => EvaluateConditionWithHistory(test, resolver);
        }

        /// <summary>
        /// The evaluator that TAGS option visibility, or null when there is no game resolver.
        /// <para>Routing and tagging cannot share one answer here. Routing has to pick a branch, so
        /// an unanswerable test has to become false. An option has no such obligation: saying false
        /// about a question nobody could answer would HIDE an answer from the player. Null says
        /// unknown, and a game reading Visible != false still offers it.</para>
        /// </summary>
        private Func<ConditionTest, bool>? VisibilityEvaluator()
        {
            var resolver = _callbacks.GetConditionResolver?.Invoke();
            if (resolver == null) return null;
            return test => EvaluateConditionWithHistory(test, resolver);
        }

        internal bool EvaluateConditionForBlock(
            ConditionTest test,
            Func<ConditionTest, bool> fallbackEvaluator)
        {
            return EvaluateConditionWithHistory(test, fallbackEvaluator);
        }


        private Exception? Shutdown()
        {
            _pendingWaits.Clear();

            Exception? fault = null;
            // A copy: cancelling a track cascades to its children, and every track is cancelled
            // even if an earlier cleanup threw. Leaving live tracks behind on a closed scene is
            // how a dialogue kept running after it ended.
            foreach (var track in new List<Track>(_tracks))
            {
                // Evaluated FIRST, then kept: `fault ?? track.Cancel()` short-circuits, and
                // the very thing this loop promises — every track closed, whatever threw —
                // stopped happening at the first fault. The tracks after it stayed alive with
                // their cleanups unrun.
                var trackFault = track.Cancel();
                fault = fault ?? trackFault;
            }
            _tracks.Clear();

            _running = false;
            FireSceneExit();
            _callbacks.OnSceneEnded?.Invoke(this);
            return fault;
        }

        // ─── Scene lifecycle ─────────────────────────────────────────────────

        private void FireSceneEnter()
        {
            var handler = _sceneRegistry.EnterHandler ?? _globalRegistry.SceneEnterHandler;
            handler?.Invoke(new SceneLifecycleArgs { Scene = this, Context = new SceneContext() });
        }

        private void FireSceneExit()
        {
            var handler = _sceneRegistry.ExitHandler ?? _globalRegistry.SceneExitHandler;
            handler?.Invoke(new SceneLifecycleArgs { Scene = this, Context = new SceneContext() });
        }

        // ─── Internal helpers ────────────────────────────────────────────────

        private Func<List<Card>, Card?> GetResolveCharacterFn()
        {
            return _resolveCharacter
                ?? _callbacks.GetResolveCharacter?.Invoke()
                ?? (chars => chars.Count > 0 ? chars[0] : null);
        }

        /// <summary>Look up the cards a block cites, and let the game pick which actor is speaking.</summary>
        private ResolvedCards ResolveCardsFor(BlueprintBlock block)
        {
            Func<string, Card?> lookup = _callbacks.GetCard ?? (_ => null);
            return ResolvedCards.Resolve(block, lookup, GetResolveCharacterFn());
        }

        // Cards are resolved fresh every time, never cached. This runs for the main track AND for
        // async tracks (through CreateBlockContext), and a cache would leak the main track's actor
        // into a track released later by WaitForBlocks.
        private IBaseBlockContext? CreateContext(BlueprintBlock block)
        {
            var cards = ResolveCardsFor(block);

            switch (block.Type)
            {
                case BlockType.Dialog:
                    return new InternalDialogContext(block, cards);

                case BlockType.Choice:
                {
                    var options = ConditionEvaluator.TagOptionVisibility(block.Options, VisibilityEvaluator());
                    return new InternalChoiceContext(block, cards, options, RecordChoice);
                }

                case BlockType.Condition:
                {
                    var evaluate = RoutingEvaluator();
                    bool portPerCase = Natives.Of(block).PortPerCase == true;

                    // Every case is evaluated up front, so the handler is handed results rather
                    // than questions. With a resolver installed the engine already knows where to
                    // go, which is what makes OnCondition optional: the handler becomes a place to
                    // log or to override.
                    var cases = new List<RuntimeConditionCase>();
                    foreach (var conditionCase in block.Cases ?? new List<ConditionCase>())
                    {
                        cases.Add(new RuntimeConditionCase
                        {
                            Port = conditionCase.Port,
                            When = conditionCase.When,
                            // ONCE. The port is read off these same results rather than re-asking
                            // the game: each test reaches OnResolveCondition exactly one time,
                            // whatever the mode and whichever case matches.
                            Result = ConditionEvaluator.EvaluateConditionChain(conditionCase.When, evaluate),
                        });
                    }

                    var ctx = new InternalConditionContext(block, cards, cases);
                    var caseResults = new List<bool>();
                    foreach (var c in cases) caseResults.Add(c.Result == true);
                    ctx.ConditionPort = ConditionEvaluator.PickPortFromResults(
                        block.Cases, portPerCase, caseResults);
                    return ctx;
                }

                case BlockType.Action:
                    return new InternalActionContext(block, cards);

                default:
                    return null;
            }
        }

        private static bool GetGlobalPrevented(IBaseBlockContext context)
        {
            return context is InternalBlockContext internalContext && internalContext.GlobalPrevented;
        }

    }
}

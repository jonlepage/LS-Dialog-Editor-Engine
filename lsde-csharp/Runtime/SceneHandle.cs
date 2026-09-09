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

        /// <summary>Blocks this scene has FINISHED, which is not the same as blocks it reached.</summary>
        /// <remarks>A block joins _visited when it is dispatched and _completed when the track
        /// leaves it: the game called next(), the exit port was resolved and the cleanup has run.
        /// The two sets answer two different questions, and only one of them is WaitForBlocks.
        /// It used to be the visited set, which made the property nearly inert -- a join is
        /// normally drawn onto blocks dispatched a fraction of a millisecond earlier, so the wait
        /// lifted in the very tick it was registered.</remarks>
        private readonly HashSet<string> _completed = new HashSet<string>();
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
                    "Register handlers before starting:\n" +
                    "  engine.OnDialog(handler)\n  engine.OnChoice(handler)\n  engine.OnCondition(handler)\n  engine.OnAction(handler)\n" +
                    "Note: OnCondition is optional when engine.OnResolveCondition() is installed.");
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
            _mainTrack = new Track(this, startBlock, Track.MainTrackId, null, Ports.In);
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
        /// <summary>Mark a block reached. Nothing is released by this.</summary>
        public void AddVisited(string blockId)
        {
            _visited.Add(blockId);
        }

        /// <summary>Mark a block finished, and release anything that was waiting on it.</summary>
        public void AddCompleted(string blockId)
        {
            _completed.Add(blockId);
            if (_pendingWaits.Count > 0)
            {
                // Collected before notifying: releasing a track re-enters the traversal, which can
                // park or release others, and mutating the dictionary mid-iteration would throw.
                var satisfied = new List<IWaiter>();
                foreach (var kvp in _pendingWaits)
                {
                    bool allCompleted = true;
                    foreach (var u in kvp.Value)
                    {
                        if (!_completed.Contains(u)) { allCompleted = false; break; }
                    }
                    if (allCompleted) satisfied.Add(kvp.Key);
                }
                foreach (var waiter in satisfied)
                {
                    _pendingWaits.Remove(waiter);
                    waiter.NotifyWaitSatisfied();
                }
            }
        }

        /// <summary>Open a parallel track, entered through entryPort. Returns its id.</summary>
        public int SpawnTrack(BlueprintBlock startBlock, int? parentTrackId, string entryPort)
        {
            var id = _nextTrackId++;
            // null when the main flow opened it — the convention TrackInfo publishes.
            var parent = parentTrackId == Track.MainTrackId ? (int?)null : parentTrackId;
            var track = new Track(this, startBlock, id, parent, entryPort);
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

        /// <summary>A track has nowhere left to go. Retire it, and close the scene once nothing is
        /// left that could still move.</summary>
        /// <remarks>
        /// <para>Every track is retired the same way, the main flow included. What ends the scene
        /// is the pool running out of tracks able to advance, not the main flow reaching its
        /// end.</para>
        /// <para>It used to be the main flow: TrackEnded on track 0 called Shutdown(), which
        /// cancels every live track. That contradicted the promise Track.EndFlow makes — child
        /// tracks survive, only an explicit Cancel() cascades — for the one track that opens most
        /// of them, and it made a whole port silently do nothing: a port whose targets are ALL
        /// isAsync leaves the main flow no continuation, so it ends the instant it has spawned
        /// them, and shutdown cancelled the branches born three lines earlier. They never got past
        /// OnBeforeBlock.</para>
        /// <para>A track parked on a waitForBlocks does NOT count as able to advance: it is waiting
        /// for another track to visit a block, so once every survivor is parked, nothing will ever
        /// visit anything again. Keeping the scene open on those would turn an unreachable wait
        /// into a scene that never closes.</para>
        /// <para>An explicit Cancel() still tears the whole scene down at once — that is its
        /// job.</para>
        /// </remarks>
        public Exception? TrackEnded(Track track)
        {
            RemoveTrack(track);
            foreach (var other in _tracks)
            {
                if (other.IsRunning() && !other.IsWaitingForBlocks()) return null;
            }
            return Shutdown();
        }

        /// <summary>Park a track (or the main flow) until every listed block has FINISHED.</summary>
        public void RegisterWaitForBlocks(IWaiter waiter, List<string> blockIds)
        {
            _pendingWaits[waiter] = blockIds;
        }

        public bool IsVisited(string blockId) => _visited.Contains(blockId);
        public bool IsCompleted(string blockId) => _completed.Contains(blockId);

        /// <summary>Run OnValidateNextBlock for a block, and OnInvalidateBlock when it refuses.</summary>
        /// <remarks>Called by BOTH the main flow and every parallel track. It used to live inline
        /// in the main flow only, so a game using this hook as a gate — "do not enter this block
        /// unless the player has the keycard" — was bypassed the moment a branch was marked
        /// IsAsync. Nothing in the hook's contract said it only applied to the flow the player was
        /// watching, and nothing on screen would have told anyone.</remarks>
        /// <para>entryPort is the port the wire arrived on, and it is passed for one reason: under
        /// InPortPerCharacter the gate must be asked about the actor the DESIGNER wired, not about
        /// whichever one the whole cast would have produced. A gate reading "do not enter unless
        /// this character is here" would otherwise be answered about the wrong character.</para>
        /// <returns>false when the caller must stop rather than dispatch the block.</returns>
        public bool RunValidation(BlueprintBlock block, string entryPort, BlueprintBlock? fromBlock, Card? fromCharacter)
        {
            var handler = _globalRegistry.ValidateNextBlockHandler;
            if (handler == null) return true;

            var result = handler(new ValidateNextBlockArgs
            {
                NextBlock = block,
                FromBlock = fromBlock,
                NextContext = new ValidateNextBlockContext { Character = ResolveCardsFor(block, entryPort).Character },
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

        public IBaseBlockContext? CreateBlockContext(BlueprintBlock block, string entryPort)
        {
            return CreateContext(block, entryPort);
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
        /// <remarks>With InPortPerCharacter, the wire that reached the block named the actor:
        /// entryPort holds a CARD ID instead of "in", and only that actor is offered to
        /// OnResolveCharacter. The game is still the one answering — it may say null — it simply
        /// cannot pick a different actor than the one the designer wired.
        /// <para>Without the property, or when the block was entered through "in", entryPort is
        /// ignored and the whole cast is offered, exactly as before. That is what keeps every
        /// existing project — and every wire LSDE has ever written with ToPort "in" — behaving
        /// identically.</para></remarks>
        private ResolvedCards ResolveCardsFor(BlueprintBlock block, string entryPort = Ports.In)
        {
            Func<string, Card?> lookup = _callbacks.GetCard ?? (_ => null);
            var designated = Natives.Of(block).InPortPerCharacter == true && entryPort != Ports.In
                ? entryPort
                : null;
            return ResolvedCards.Resolve(block, lookup, GetResolveCharacterFn(), designated);
        }

        /// <summary>Evaluate every case of a CONDITION or a ROUTER, before its context is built.</summary>
        /// <remarks>The handler is then handed RESULTS rather than questions, and the exit port is
        /// read off these same results rather than re-asking the game: each test reaches
        /// OnResolveCondition exactly ONE time — whatever the block type, whatever the mode,
        /// whichever case matches. That is also what makes OnCondition optional: with a resolver
        /// installed the engine already knows where it is going, and the handler becomes a place
        /// to log or to override.
        /// <para>Written ONCE for both block types on purpose. They ask the same question; only the
        /// reading of the answer differs, and that belongs to PickPortFromResults and
        /// PickRouterPorts.</para></remarks>
        private List<RuntimeConditionCase> EvaluateCases(BlueprintBlock block)
        {
            var evaluate = RoutingEvaluator();
            var cases = new List<RuntimeConditionCase>();
            foreach (var conditionCase in block.Cases ?? new List<ConditionCase>())
            {
                cases.Add(new RuntimeConditionCase
                {
                    Port = conditionCase.Port,
                    When = conditionCase.When,
                    Result = ConditionEvaluator.EvaluateConditionChain(conditionCase.When, evaluate),
                });
            }
            return cases;
        }

        private static List<bool> ResultsOf(List<RuntimeConditionCase> cases)
        {
            var results = new List<bool>();
            foreach (var c in cases) results.Add(c.Result == true);
            return results;
        }

        // Cards are resolved fresh every time, never cached. This runs for every track, and a cache
        // would leak one track's actor into another released later by WaitForBlocks.
        private IBaseBlockContext? CreateContext(BlueprintBlock block, string entryPort)
        {
            var cards = ResolveCardsFor(block, entryPort);

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
                    var cases = EvaluateCases(block);
                    var ctx = new InternalConditionContext(block, cards, cases);
                    ctx.ConditionPort = ConditionEvaluator.PickPortFromResults(
                        block.Cases, Natives.Of(block).PortPerCase == true, ResultsOf(cases));
                    return ctx;
                }

                case BlockType.Router:
                {
                    // The same cases, read the opposite way: EVERY case counts, each true one
                    // launches its port, and the tally picks then or catch. That difference lives
                    // entirely in PickRouterPorts — there is no second evaluator and no
                    // router-specific hook.
                    var cases = EvaluateCases(block);
                    var ctx = new InternalRouterContext(block, cards, cases);
                    ctx.RouterPorts = ConditionEvaluator.PickRouterPorts(block.Cases, ResultsOf(cases));
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

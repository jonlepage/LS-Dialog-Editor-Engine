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

        /// <summary>The scene is being closed right now — set on entering Shutdown(), before any
        /// cleanup runs.</summary>
        /// <remarks>_running cannot say it: it only drops once every track is cancelled, and a
        /// cleanup run by that cancelling may call scene.Cancel() or engine.Stop() — the natural
        /// thing for a panel that closes the dialogue it belongs to. The inner call found the scene
        /// still running and closed it a second time: OnSceneExit fired twice, the engine was told
        /// twice.</remarks>
        private bool _closing;

        /// <summary>The thread that started the scene. The engine is not thread-safe, and the only
        /// honest thing to do about it is to say so the first time it happens.</summary>
        /// <remarks>A game that awaits on the thread pool — UniTask.SwitchToThreadPool, an audio or
        /// network callback — and calls Next() from there ran every handler after it off the main
        /// thread. The lists and sets here were mutated without a lock, and the Unity API calls in
        /// those handlers failed somewhere far from the cause.</remarks>
        private int _ownerThreadId;

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
        /// <summary>Tracks — the main flow included — parked until a set of blocks has been finished.</summary>
        private readonly Dictionary<IWaiter, List<string>> _pendingWaits = new Dictionary<IWaiter, List<string>>();
        /// <summary>The same waiters, in the order they parked.</summary>
        /// <remarks>A Dictionary does not keep an order once an entry has been removed, and
        /// WaitingFor is published: a deadlock must name the same blocks in the same order in all
        /// four runtimes.</remarks>
        private readonly List<IWaiter> _waitOrder = new List<IWaiter>();

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
            _closing = false;
            _ownerThreadId = Environment.CurrentManagedThreadId;
            _callbacks.OnSceneStarted?.Invoke(this);

            // OnSceneEnter is the game's code like any handler, and it runs before there is a track
            // to catch what it throws. It used to leave the scene registered and running with no
            // track at all: nothing to advance, nothing to end it. Same rule as the walk — close,
            // then surface.
            try
            {
                FireSceneEnter();
            }
            catch (Exception err)
            {
                Shutdown(SceneEndReason.Faulted, null, err);
                throw;
            }
            // OnSceneEnter is allowed to cancel the scene it was told about.
            if (!_running) return;

            var startBlock = _sceneGraph.GetStartBlock();
            if (startBlock == null)
            {
                var fault = Shutdown(SceneEndReason.Completed);
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
            if (!_running || _closing) return;
            EnsureOwnerThread("Cancel()");
            var fault = Shutdown(SceneEndReason.Cancelled);
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

        /// <summary>The stable id of this scene (sc_u0vqg2g8) — the one to store outside the payload.</summary>
        /// <remarks>OnSceneExit is global, and the handle it is given was the only way to tell WHICH
        /// scene ended when several play at once; it could not say. The id is what survives a
        /// rename.</remarks>
        public string GetSceneId() => _sceneGraph.GetScene().Id;

        /// <summary>The path of this scene (reactor_breach) — what a writer reads, and what a rename changes.</summary>
        public string GetScenePath() => _sceneGraph.GetScene().Scene;

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
                foreach (var waiter in _waitOrder)
                {
                    bool allCompleted = true;
                    foreach (var u in _pendingWaits[waiter])
                    {
                        if (!_completed.Contains(u)) { allCompleted = false; break; }
                    }
                    if (allCompleted) satisfied.Add(waiter);
                }
                foreach (var waiter in satisfied)
                {
                    // Closing the scene clears the waits: a release that closed it leaves nothing
                    // for the ones after it to wake.
                    if (!_pendingWaits.Remove(waiter)) continue;
                    _waitOrder.Remove(waiter);
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
        /// cancels every live track. That contradicted the promise Track.Retire makes — child
        /// tracks survive, only an explicit Cancel() cascades — for the one track that opens most
        /// of them, and it made a whole port silently do nothing: a port whose targets are ALL
        /// isAsync leaves the main flow no continuation, so it ends the instant it has spawned
        /// them, and shutdown cancelled the branches born three lines earlier. They never got past
        /// OnBeforeBlock.</para>
        /// <para>A track parked on a waitForBlocks does NOT count as able to advance: it is waiting
        /// for another track to finish a block, so once every survivor is parked, nothing will ever
        /// finish anything again. Keeping the scene open on those would turn an unreachable wait
        /// into a scene that never closes — and OnSceneExit is told Deadlocked, with the blocks
        /// still awaited, so a miswired join no longer reads like a scene played to its last
        /// line.</para>
        /// <para>An explicit Cancel() still tears the whole scene down at once — that is its
        /// job.</para>
        /// </remarks>
        public Exception? TrackEnded(Track track, string ending)
        {
            RemoveTrack(track);
            if (_closing || CanStillAdvance()) return null;

            var waitingFor = WaitingFor();
            return waitingFor.Count > 0
                ? Shutdown(SceneEndReason.Deadlocked, waitingFor)
                : Shutdown(ending);
        }

        /// <summary>A track just parked. Close the scene if that left nothing able to release it.</summary>
        /// <remarks>The other half of the deadlock TrackEnded closes on. Checking only when a track
        /// ENDED missed the case where the last track able to move PARKED instead: a single flow
        /// waiting on a block of a branch it never took stayed open for good.</remarks>
        public Exception? TrackParked()
        {
            if (_closing || CanStillAdvance()) return null;
            return Shutdown(SceneEndReason.Deadlocked, WaitingFor());
        }

        /// <summary>Code of the game threw during the walk. Close the scene; the track re-throws.</summary>
        /// <remarks><paramref name="error"/> is handed to OnSceneExit, because the re-throw reaches
        /// whoever entered the walk — a click, a timer — and never the code awaiting the end of the
        /// scene. What a cleanup throws while closing is dropped, on purpose: the game gets the
        /// exception that started it, which is the one that explains everything after.</remarks>
        public void Fault(Exception error)
        {
            if (!_running || _closing) return;
            Shutdown(SceneEndReason.Faulted, null, error);
        }

        /// <summary>Throw when the game calls into a running scene from another thread than the
        /// one that started it.</summary>
        public void EnsureOwnerThread(string call)
        {
            if (!_running) return;
            var current = Environment.CurrentManagedThreadId;
            if (current == _ownerThreadId) return;
            throw new InvalidOperationException(
                $"LSDE: {call} was called on thread {current}, but this scene was started on thread {_ownerThreadId}. " +
                "The engine is not thread-safe: call it from the thread that started the scene. In Unity that is the " +
                "main thread — switch back before calling it (await UniTask.SwitchToMainThread(), or queue the call " +
                "for the main thread).");
        }

        /// <summary>Park a track (or the main flow) until every listed block has FINISHED.</summary>
        public void RegisterWaitForBlocks(IWaiter waiter, List<string> blockIds)
        {
            if (!_pendingWaits.ContainsKey(waiter)) _waitOrder.Add(waiter);
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

        /// <summary>Is there a track left that could still finish a block? A parked one cannot.</summary>
        private bool CanStillAdvance()
        {
            foreach (var track in _tracks)
            {
                if (track.IsRunning() && !track.IsWaitingForBlocks()) return true;
            }
            return false;
        }

        /// <summary>The blocks the parked tracks still wait for, each once, in the order they were
        /// asked for.</summary>
        private List<string> WaitingFor()
        {
            var ids = new List<string>();
            var seen = new HashSet<string>();
            foreach (var waiter in _waitOrder)
            {
                foreach (var id in _pendingWaits[waiter])
                {
                    if (!_completed.Contains(id) && seen.Add(id)) ids.Add(id);
                }
            }
            return ids;
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
            // A null Entry names no CHOICE block: it answers like one never reached, instead of throwing
            // ArgumentNullException out of a Dictionary in the middle of a scene.
            if (test.Entry == null || !_choiceHistory.TryGetValue(test.Entry, out var history)) return negated;

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


        /// <summary>Close the scene down: cancel every track, fire OnSceneExit, tell the engine.</summary>
        /// <remarks>Returns what a cleanup threw rather than throwing it, so the teardown always
        /// runs to the end. Callers re-throw once there is nothing left to unwind.
        /// <para>waitingFor must be read BEFORE: the pending waits are cleared on the way in. error
        /// is the fault that closed the scene, handed to OnSceneExit.</para></remarks>
        private Exception? Shutdown(string reason, List<string>? waitingFor = null, Exception? error = null)
        {
            if (_closing) return null;
            _closing = true;

            _pendingWaits.Clear();
            _waitOrder.Clear();

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

            // OnSceneExit is the game's code too, and it used to throw between _running = false
            // and telling the engine: the handle then sat in the engine's registry for good,
            // IsRunning() answered true, and Stop() could not reach it — Cancel() returns at once on
            // a scene that is not running. The engine is ALWAYS told; what OnSceneExit threw is
            // carried like a cleanup's fault.
            var context = new SceneContext { Reason = reason, WaitingFor = waitingFor?.AsReadOnly(), Error = error };
            var exitFault = Cleanups.Run(() => FireSceneExit(context));
            _callbacks.OnSceneEnded?.Invoke(this);
            return fault ?? exitFault;
        }

        // ─── Scene lifecycle ─────────────────────────────────────────────────

        private void FireSceneEnter()
        {
            var handler = _sceneRegistry.EnterHandler ?? _globalRegistry.SceneEnterHandler;
            handler?.Invoke(new SceneLifecycleArgs { Scene = this, Context = new SceneContext() });
        }

        private void FireSceneExit(SceneContext context)
        {
            var handler = _sceneRegistry.ExitHandler ?? _globalRegistry.SceneExitHandler;
            handler?.Invoke(new SceneLifecycleArgs { Scene = this, Context = context });
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

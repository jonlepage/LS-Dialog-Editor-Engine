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

    /// <summary>
    /// The engine-facing properties of a block, read straight out of Props.
    /// <para>v2 has one bag: natives and the writer's own properties share Props, keyed by bare id.
    /// Ids cannot collide — LSDE refuses a project property that takes a native name — so reading a
    /// native is a plain lookup. Only two of them mean anything to the traversal: IsAsync spawns a
    /// parallel track, WaitForBlocks parks one. The rest are passed through untouched.</para>
    /// </summary>
    internal static class Natives
    {
        internal static NativeProperties Of(BlueprintBlock block) => LsdeUtils.GetNativeProperties(block);

        internal static bool IsAsync(BlueprintBlock block)
        {
            return block.Props != null
                && block.Props.TryGetValue("isAsync", out var value)
                && value is bool flag
                && flag;
        }

        internal static List<string>? WaitForBlocks(BlueprintBlock block)
        {
            return LsdeUtils.GetNativeProperties(block).WaitForBlocks;
        }
    }

    internal static class NoteWalk
    {
        /// <summary>
        /// Walk past NOTE blocks to the first block the engine actually dispatches.
        ///
        /// NOTE blocks are designer-only: they carry no handler and are never executed, so the
        /// traversal steps over them and follows their first outgoing connection.
        ///
        /// Returns <c>null</c> when the walk runs out of connections — and also when it comes
        /// back to a NOTE it already stepped over. A designer can wire a NOTE into a loop, and
        /// following it recursively overflowed the stack instead of ending the flow.
        /// </summary>
        internal static BlueprintBlock? SkipNotes(BlueprintBlock block, SceneGraph sceneGraph)
        {
            var current = block;
            HashSet<string>? seen = null;

            while (current != null && current.Type == BlockType.Note)
            {
                seen ??= new HashSet<string>();
                if (!seen.Add(current.Id)) return null;

                var links = sceneGraph.GetOutgoingLinks(current.Id);
                current = links.Count > 0 ? sceneGraph.GetBlock(links[0].To) : null;
            }

            return current;
        }
    }

    // ─── AsyncTrack — parallel execution branch ──────────────────────────────────

    /// <summary>Anything the traversal can park until a set of blocks has been visited.</summary>
    /// <remarks>WaitForBlocks is a property of the BLOCK — "the block waits for these before it
    /// advances", in the format's own words. Only AsyncTrack read it, so a designer who set it on
    /// a block of the main flow got nothing at all, silently, with the checkbox ticked in the
    /// editor. The main flow parks through this same interface now.</remarks>
    internal interface IWaiter
    {
        void NotifyWaitSatisfied();
    }

    /// <summary>Running the cleanups a handler returned, without letting one break a teardown.</summary>
    /// <remarks>A cleanup runs while the engine is tearing something down — leaving a block,
    /// ending a track, closing a scene. An exception escaping mid-teardown STOPPED the teardown:
    /// the scene stayed running, OnSceneExit never fired, the remaining tracks were never
    /// cancelled, and the handle sat in the engine's registry forever. The game got its exception
    /// and an engine it could no longer use.
    /// <para>So the shutdown always finishes and the fault is re-thrown once there is nothing left
    /// to unwind — the same contract as a handler that throws.</para></remarks>
    internal static class Cleanups
    {
        /// <summary>Run a cleanup and hand back what it threw instead of letting it escape.</summary>
        internal static Exception? Run(Action? cleanup)
        {
            if (cleanup == null) return null;
            try
            {
                cleanup();
                return null;
            }
            catch (Exception err)
            {
                return err;
            }
        }

        /// <summary>Combine a scene cleanup and a global one. BOTH always run.</summary>
        /// <remarks>They release unrelated things — a scene handler's panel and a global handler's
        /// audio voice — so letting the first one's failure skip the second leaked whatever the
        /// second owned. The first fault is re-thrown once both have had their turn.</remarks>
        internal static Action? Combine(Action? a, Action? b)
        {
            if (a != null && b != null)
            {
                return () =>
                {
                    var first = Run(a);
                    var second = Run(b);
                    var fault = first ?? second;
                    if (fault != null) throw fault;
                };
            }
            if (a != null) return a;
            if (b != null) return b;
            return null;
        }
    }

    internal class AsyncTrack : IWaiter
    {
        private bool _running = true;
        private BlueprintBlock? _currentBlock;
        /// <summary>The block this track came from, for OnValidateNextBlock. Its own, not the main flow's.</summary>
        private BlueprintBlock? _previousBlock;
        private Card? _previousCharacter;
        private Action? _previousCleanup;
        private Action? _pendingAdvance;

        internal readonly int Id;
        internal readonly int? ParentTrackId;
        internal readonly string StartBlockUuid;
        private readonly List<int> _childTrackIds = new List<int>();

        private readonly BlueprintBlock _startBlock;
        private readonly SceneGraph _sceneGraph;
        private readonly SceneHandleImpl _parentHandle;

        internal AsyncTrack(SceneGraph sceneGraph, SceneHandleImpl parentHandle, BlueprintBlock startBlock, int id, int? parentTrackId)
        {
            _sceneGraph = sceneGraph;
            _parentHandle = parentHandle;
            _startBlock = startBlock;
            Id = id;
            ParentTrackId = parentTrackId;
            StartBlockUuid = startBlock.Id;
        }

        /// <summary>Begin track execution. Must be called after the track is added to the pool.</summary>
        internal void Start()
        {
            var waitBlocks = Natives.WaitForBlocks(_startBlock);
            if (waitBlocks != null && waitBlocks.Count > 0)
            {
                bool allVisited = true;
                foreach (var uuid in waitBlocks)
                {
                    if (!_parentHandle.IsVisited(uuid)) { allVisited = false; break; }
                }
                if (!allVisited)
                {
                    _pendingAdvance = () => ProcessBlock(_startBlock);
                    _parentHandle.RegisterWaitForBlocks(this, waitBlocks);
                    return;
                }
            }
            ProcessBlock(_startBlock);
        }

        /// <summary>Stop this track and every track it spawned.</summary>
        /// <remarks>Returns a fault instead of throwing one: EndScene() cancels the whole pool in
        /// a loop, and one badly-behaved cleanup must not leave the tracks after it running.</remarks>
        internal Exception? Cancel()
        {
            if (!_running) return null;
            _running = false;

            var cleanup = _previousCleanup;
            _previousCleanup = null;
            var fault = Cleanups.Run(cleanup);

            _currentBlock = null;
            _pendingAdvance = null;
            foreach (var childId in _childTrackIds)
            {
                fault = fault ?? _parentHandle.CancelTrack(childId);
            }
            _childTrackIds.Clear();
            return fault;
        }

        internal bool IsRunning() => _running;

        /// <summary>Called by the parent handle when all waitForBlocks UUIDs have been visited.</summary>
        public void NotifyWaitSatisfied()
        {
            if (!_running || _pendingAdvance == null) return;
            var advance = _pendingAdvance;
            _pendingAdvance = null;
            advance();
        }

        /// <summary>Build a read-only snapshot of this track's state for the public API.</summary>
        internal TrackInfo GetTrackInfo()
        {
            return new TrackInfo
            {
                Id = this.Id,
                ParentTrackId = this.ParentTrackId,
                StartBlockUuid = this.StartBlockUuid,
                CurrentBlockUuid = _currentBlock?.Id,
                Running = _running
            };
        }

        // ─── Traversal ──────────────────────────────────────────────────

        private void ProcessBlock(BlueprintBlock startingBlock)
        {
            if (!_running) return;

            var block = NoteWalk.SkipNotes(startingBlock, _sceneGraph);
            if (block == null)
            {
                var deadEnd = EndTrack();
                if (deadEnd != null) throw deadEnd;
                return;
            }

            // The same gate the main flow goes through. A parallel track is still the game's dialogue.
            if (!_parentHandle.RunValidation(block, _previousBlock, _previousCharacter)) return;

            _currentBlock = block;
            _parentHandle.AddVisited(block.Id);

            // Fire onBeforeBlock — same gate pattern as SceneHandleImpl.ProcessBlock
            var registry = _parentHandle.GetGlobalRegistry();
            if (registry.BeforeBlockHandler != null)
            {
                var resolvedOnce = false;
                registry.BeforeBlockHandler(new BeforeBlockArgs
                {
                    Block = block,
                    Scene = _parentHandle,
                    Context = new BeforeBlockContext { NativeProperties = Natives.Of(block) },
                    Resolve = () =>
                    {
                        if (resolvedOnce) return;
                        resolvedOnce = true;
                        ExecuteBlockHandler(block);
                    }
                });
            }
            else
            {
                ExecuteBlockHandler(block);
            }
        }

        private void ExecuteBlockHandler(BlueprintBlock block)
        {
            if (!_running) return;

            var resolved = HandlerResolver.ResolveHandler(
                block.Type, block.Id,
                _parentHandle.GetSceneRegistry(),
                _parentHandle.GetGlobalRegistry());

            var context = _parentHandle.CreateBlockContext(block);
            if (context == null)
            {
                AdvanceToNextBlock(block, null);
                return;
            }

            if (resolved.SceneHandler == null && resolved.GlobalHandler == null)
            {
                AdvanceToNextBlock(block, context);
                return;
            }

            bool nextCalled = false;
            bool syncPhase = true;
            Action? sceneCleanup = null;
            Action? globalCleanup = null;

            void next()
            {
                if (nextCalled) return;
                nextCalled = true;

                var waitBlocks = Natives.WaitForBlocks(block);
                if (waitBlocks != null && waitBlocks.Count > 0)
                {
                    bool allVisited = true;
                    foreach (var uuid in waitBlocks)
                    {
                        if (!_parentHandle.IsVisited(uuid)) { allVisited = false; break; }
                    }
                    if (!allVisited)
                    {
                        _pendingAdvance = () => AdvanceToNextBlock(block, context);
                        _parentHandle.RegisterWaitForBlocks(this, waitBlocks);
                        return;
                    }
                }

                if (syncPhase) return;
                AdvanceToNextBlock(block, context);
            }

            try
            {
                if (resolved.SceneHandler != null)
                {
                    sceneCleanup = resolved.SceneHandler(_parentHandle, block, context, next);
                    bool globalPrevented = GetGlobalPrevented(context);
                    if (!globalPrevented && resolved.GlobalHandler != null)
                    {
                        globalCleanup = resolved.GlobalHandler(_parentHandle, block, context, next);
                    }
                }
                else if (resolved.GlobalHandler != null)
                {
                    globalCleanup = resolved.GlobalHandler(_parentHandle, block, context, next);
                }
            }
            catch
            {
                // The track is closed down first, THEN the error is re-thrown. By the time it
                // reaches the game, the cleanups have run and the track is gone — it stops
                // properly, and the game decides what to do about it. Swallowing it here was the
                // v1 behaviour, and it made the same fault behave in two opposite ways depending
                // on whether it happened in a handler or in the cleanup that handler returned.
                EndTrack();
                throw;
            }

            _previousCleanup = Cleanups.Combine(sceneCleanup, globalCleanup);

            syncPhase = false;
            if (nextCalled && _pendingAdvance == null)
            {
                AdvanceToNextBlock(block, context);
            }
        }

        private void AdvanceToNextBlock(BlueprintBlock block, IBaseBlockContext? context)
        {
            if (!_running) return;

            _previousBlock = block;
            _previousCharacter = context?.Character;

            var resolution = PortResolver.ResolvePort(new PortResolutionInput
            {
                Block = block,
                Links = _sceneGraph.GetOutgoingLinks(block.Id),
                SelectedOptionId = (context as InternalChoiceContext)?.SelectedOptionId,
                ConditionPort = (context as InternalConditionContext)?.ConditionPort,
                ActionRejected = (context as InternalActionContext)?.ActionRejected,
                ActorPort = (context as InternalDialogContext)?.ActorPort
            });

            var allLinks = resolution.Links;
            Link? mainLink = null;
            var asyncLinks = new List<Link>();

            foreach (var link in allLinks)
            {
                var targetBlock = _sceneGraph.GetBlock(link.To);
                if (targetBlock == null) continue;

                if (mainLink == null && !Natives.IsAsync(targetBlock))
                {
                    mainLink = link;
                }
                else
                {
                    asyncLinks.Add(link);
                }
            }

            foreach (var link in asyncLinks)
            {
                var targetBlock = _sceneGraph.GetBlock(link.To);
                if (targetBlock != null)
                {
                    var trackId = _parentHandle.SpawnAsyncTrack(targetBlock, this.Id);
                    _childTrackIds.Add(trackId);
                }
            }

            if (mainLink != null)
            {
                var nextBlock = _sceneGraph.GetBlock(mainLink.To);
                if (nextBlock != null)
                {
                    var cleanupToRun = _previousCleanup;
                    _previousCleanup = null;
                    var fault = Cleanups.Run(cleanupToRun);
                    if (fault != null)
                    {
                        EndTrack();
                        throw fault;
                    }
                    ProcessBlock(nextBlock);
                    return;
                }
            }

            var endFault = EndTrack();
            if (endFault != null) throw endFault;
        }

        /// <summary>Close this track down. Returns what its cleanup threw, having finished regardless.</summary>
        private Exception? EndTrack()
        {
            var cleanup = _previousCleanup;
            _previousCleanup = null;
            var fault = Cleanups.Run(cleanup);

            // Child tracks survive — only explicit Cancel() cascades
            _running = false;
            _currentBlock = null;
            _parentHandle.RemoveTrack(this);
            return fault;
        }

        private static bool GetGlobalPrevented(IBaseBlockContext context)
        {
            return context is InternalBlockContext internalContext && internalContext.GlobalPrevented;
        }

    }

    // ─── SceneHandleImpl ─────────────────────────────────────────────────────────

    internal class SceneHandleImpl : ISceneHandle, IWaiter
    {
        private readonly SceneGraph _sceneGraph;
        private readonly HandlerRegistry _globalRegistry;
        private readonly SceneHandlerRegistry _sceneRegistry = new SceneHandlerRegistry();
        private readonly SceneHandleCallbacks _callbacks;

        private bool _running;
        private bool _cancelled;
        private BlueprintBlock? _currentBlock;
        private BlueprintBlock? _previousBlock;
        private Card? _previousCharacter;
        private readonly HashSet<string> _visited = new HashSet<string>();
        private readonly Dictionary<string, List<string>> _choiceHistory = new Dictionary<string, List<string>>();
        private Action? _previousCleanup;
        private readonly List<AsyncTrack> _asyncTracks = new List<AsyncTrack>();
        private int _nextTrackId = 1;
        private readonly Dictionary<IWaiter, List<string>> _pendingWaits = new Dictionary<IWaiter, List<string>>();
        /// <summary>The main flow's own parked advance, when its block carries WaitForBlocks.</summary>
        private Action? _pendingAdvance;
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
            _cancelled = false;
            _callbacks.OnSceneStarted?.Invoke(this);

            FireSceneEnter();

            var startBlock = _sceneGraph.GetStartBlock();
            if (startBlock != null)
            {
                ProcessBlock(startBlock);
            }
            else
            {
                var fault = EndScene();
                if (fault != null) throw fault;
            }
        }

        public void Cancel()
        {
            if (!_running) return;
            _cancelled = true;
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

        public BlueprintBlock? GetCurrentBlock() => _currentBlock;

        public IReadOnlyCollection<string> GetVisitedBlocks() => _visited;

        public bool IsRunning() => _running;

        public int GetActiveTracks()
        {
            int count = 0;
            foreach (var track in _asyncTracks)
            {
                if (track.IsRunning()) count++;
            }
            return count;
        }

        public IReadOnlyList<TrackInfo> GetTrackInfos()
        {
            var result = new List<TrackInfo>();
            foreach (var track in _asyncTracks)
            {
                if (track.IsRunning()) result.Add(track.GetTrackInfo());
            }
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

        // ─── Internal API (used by AsyncTrack) ───────────────────────────────

        internal SceneGraph GetSceneGraph() => _sceneGraph;
        internal SceneHandlerRegistry GetSceneRegistry() => _sceneRegistry;
        internal HandlerRegistry GetGlobalRegistry() => _globalRegistry;
        internal void AddVisited(string uuid)
        {
            _visited.Add(uuid);
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

        internal int SpawnAsyncTrack(BlueprintBlock startBlock, int? parentTrackId)
        {
            var id = _nextTrackId++;
            var track = new AsyncTrack(_sceneGraph, this, startBlock, id, parentTrackId);
            _asyncTracks.Add(track);
            track.Start();
            return id;
        }

        internal Exception? CancelTrack(int trackId)
        {
            foreach (var track in _asyncTracks)
            {
                if (track.Id == trackId) return track.Cancel();
            }
            return null;
        }

        /// <summary>Park a track (or the main flow) until every listed block has been visited.</summary>
        internal void RegisterWaitForBlocks(IWaiter waiter, List<string> blockIds)
        {
            _pendingWaits[waiter] = blockIds;
        }

        internal bool IsVisited(string uuid) => _visited.Contains(uuid);

        /// <summary>Called once every block this flow was waiting on has been visited.</summary>
        public void NotifyWaitSatisfied()
        {
            if (!_running || _cancelled || _pendingAdvance == null) return;
            var advance = _pendingAdvance;
            _pendingAdvance = null;
            advance();
        }

        /// <summary>Run OnValidateNextBlock for a block, and OnInvalidateBlock when it refuses.</summary>
        /// <remarks>Called by BOTH the main flow and every parallel track. It used to live inline
        /// in the main flow only, so a game using this hook as a gate — "do not enter this block
        /// unless the player has the keycard" — was bypassed the moment a branch was marked
        /// IsAsync. Nothing in the hook's contract said it only applied to the flow the player was
        /// watching, and nothing on screen would have told anyone.</remarks>
        /// <returns>false when the caller must stop rather than dispatch the block.</returns>
        internal bool RunValidation(BlueprintBlock block, BlueprintBlock? fromBlock, Card? fromCharacter)
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

        internal void RemoveTrack(AsyncTrack track)
        {
            int idx = _asyncTracks.IndexOf(track);
            if (idx >= 0) _asyncTracks.RemoveAt(idx);
        }

        internal IBaseBlockContext? CreateBlockContext(BlueprintBlock block)
        {
            return CreateContext(block);
        }

        private void RecordChoice(string blockId, string choiceUuid)
        {
            if (_choiceHistory.TryGetValue(blockId, out var existing))
            {
                existing.Add(choiceUuid);
            }
            else
            {
                _choiceHistory[blockId] = new List<string> { choiceUuid };
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

        // ─── Traversal loop ────────────────────────────────────────────────

        private void ProcessBlock(BlueprintBlock startingBlock)
        {
            if (!_running || _cancelled) return;

            // Step 1: Skip NOTE blocks
            var block = NoteWalk.SkipNotes(startingBlock, _sceneGraph);
            if (block == null)
            {
                var deadEnd = EndScene();
                if (deadEnd != null) throw deadEnd;
                return;
            }

            // Step 2: Validate
            if (!RunValidation(block, _previousBlock, _previousCharacter)) return;

            if (_cancelled) return;

            // Step 3: Mark as current and visited
            _currentBlock = block;
            AddVisited(block.Id);

            // Step 3b: onBeforeBlock
            if (_globalRegistry.BeforeBlockHandler != null)
            {
                // GUARDED like Next(): a delay timer that fires twice would otherwise
                // dispatch the same block twice.
                var resolvedOnce = false;
                _globalRegistry.BeforeBlockHandler(new BeforeBlockArgs
                {
                    Block = block,
                    Scene = this,
                    Context = new BeforeBlockContext { NativeProperties = Natives.Of(block) },
                    Resolve = () =>
                    {
                        if (resolvedOnce) return;
                        resolvedOnce = true;
                        ExecuteBlockHandler(block);
                    }
                });
            }
            else
            {
                ExecuteBlockHandler(block);
            }
        }

        private void ExecuteBlockHandler(BlueprintBlock block)
        {
            // `_running` and not just `_cancelled`: a Resolve() kept in a closure and fired
            // after the scene ended on its own would otherwise restart traversal on a dead
            // scene, re-dispatching blocks and firing OnSceneExit a second time.
            if (!_running || _cancelled) return;

            // Step 4: Resolve handler
            var resolved = HandlerResolver.ResolveHandler(
                block.Type, block.Id, _sceneRegistry, _globalRegistry);

            // Create context
            var context = CreateContext(block);
            if (context == null)
            {
                AdvanceToNextBlock(block, null);
                return;
            }

            // No handler -> advance silently (handlers are validated at start())
            if (resolved.SceneHandler == null && resolved.GlobalHandler == null)
            {
                AdvanceToNextBlock(block, context);
                return;
            }

            bool nextCalled = false;
            bool syncPhase = true;
            Action? sceneCleanup = null;
            Action? globalCleanup = null;

            void next()
            {
                if (nextCalled) return;
                nextCalled = true;

                // WaitForBlocks: park until every listed block has been visited. The main flow
                // honours it exactly like a parallel track — this is the join half of the fork
                // IsAsync opens.
                var waitBlocks = Natives.WaitForBlocks(block);
                if (waitBlocks != null && waitBlocks.Count > 0)
                {
                    bool allVisited = true;
                    foreach (var id in waitBlocks)
                    {
                        if (!IsVisited(id)) { allVisited = false; break; }
                    }
                    if (!allVisited)
                    {
                        _pendingAdvance = () => AdvanceToNextBlock(block, context);
                        RegisterWaitForBlocks(this, waitBlocks);
                        return;
                    }
                }

                if (syncPhase) return;
                AdvanceToNextBlock(block, context);
            }

            try
            {
                if (resolved.SceneHandler != null)
                {
                    sceneCleanup = resolved.SceneHandler(this, block, context, next);
                    bool globalPrevented = GetGlobalPrevented(context);
                    if (!globalPrevented && resolved.GlobalHandler != null)
                    {
                        globalCleanup = resolved.GlobalHandler(this, block, context, next);
                    }
                }
                else if (resolved.GlobalHandler != null)
                {
                    globalCleanup = resolved.GlobalHandler(this, block, context, next);
                }
            }
            catch
            {
                // The scene is closed down first, THEN the error is re-thrown. The order is what
                // makes this usable: by the time the game sees the error, the cleanups have run,
                // the async tracks are cancelled and OnSceneExit has fired. The dialogue stopped
                // PROPERLY, and the error surfaces where the game called Start() or next().
                //
                // v1 swallowed it — silently, not even logged — while an exception from the
                // cleanup that same handler returned reached the caller.
                EndScene();
                throw;
            }

            _previousCleanup = Cleanups.Combine(sceneCleanup, globalCleanup);

            // Unless the block is parked on WaitForBlocks: releasing it is NotifyWaitSatisfied's job.
            syncPhase = false;
            if (nextCalled && _pendingAdvance == null)
            {
                AdvanceToNextBlock(block, context);
            }
        }

        private void AdvanceToNextBlock(BlueprintBlock block, IBaseBlockContext? context)
        {
            if (_cancelled) return;

            _previousBlock = block;
            _previousCharacter = context?.Character;

            var resolution = PortResolver.ResolvePort(new PortResolutionInput
            {
                Block = block,
                Links = _sceneGraph.GetOutgoingLinks(block.Id),
                SelectedOptionId = (context as InternalChoiceContext)?.SelectedOptionId,
                ConditionPort = (context as InternalConditionContext)?.ConditionPort,
                ActionRejected = (context as InternalActionContext)?.ActionRejected,
                ActorPort = (context as InternalDialogContext)?.ActorPort
            });

            var allLinks = resolution.Links;

            // Separate: first non-async = main track, rest = async
            Link? mainLink = null;
            var asyncLinks = new List<Link>();

            foreach (var link in allLinks)
            {
                var targetBlock = _sceneGraph.GetBlock(link.To);
                if (targetBlock == null) continue;

                if (mainLink == null && !Natives.IsAsync(targetBlock))
                {
                    mainLink = link;
                }
                else
                {
                    asyncLinks.Add(link);
                }
            }

            // Spawn async tracks
            foreach (var link in asyncLinks)
            {
                var targetBlock = _sceneGraph.GetBlock(link.To);
                if (targetBlock != null)
                {
                    SpawnAsyncTrack(targetBlock, null);
                }
            }

            // Continue main track
            if (mainLink != null)
            {
                var nextBlock = _sceneGraph.GetBlock(mainLink.To);
                if (nextBlock != null)
                {
                    var cleanupToRun = _previousCleanup;
                    _previousCleanup = null;
                    var fault = Cleanups.Run(cleanupToRun);
                    if (fault != null)
                    {
                        // Same order as a handler that throws: the scene is closed down first, and
                        // the error reaches the game with the dialogue already stopped properly.
                        EndScene();
                        throw fault;
                    }
                    ProcessBlock(nextBlock);
                    return;
                }
            }

            // Dead end — scene complete
            var endFault = EndScene();
            if (endFault != null) throw endFault;
        }

        /// <summary>Close the scene down: cancel every track, run the pending cleanup, fire OnSceneExit.</summary>
        /// <remarks>Returns what a cleanup threw rather than throwing it, so the teardown always
        /// runs to the end. Callers re-throw once there is nothing left to unwind.</remarks>
        private Exception? EndScene()
        {
            return Shutdown();
        }

        private Exception? Shutdown()
        {
            _pendingWaits.Clear();
            _pendingAdvance = null;

            Exception? fault = null;
            foreach (var track in _asyncTracks)
            {
                // Every track is cancelled even if an earlier one's cleanup threw: leaving live
                // tracks behind on a closed scene is how a dialogue kept running after it ended.
                fault = fault ?? track.Cancel();
            }
            _asyncTracks.Clear();

            var cleanup = _previousCleanup;
            _previousCleanup = null;
            fault = fault ?? Cleanups.Run(cleanup);

            _running = false;
            _currentBlock = null;
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

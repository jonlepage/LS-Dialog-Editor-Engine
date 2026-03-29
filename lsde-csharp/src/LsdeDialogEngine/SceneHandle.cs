// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop (C# port of scene-handle.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    internal class SceneHandleCallbacks
    {
        internal Action<SceneHandleImpl>? OnSceneStarted;
        internal Action<SceneHandleImpl>? OnSceneEnded;
        internal Func<Func<List<BlockCharacter>, BlockCharacter?>>? GetResolveCharacter;
        internal Func<Func<ExportCondition, bool>?>? GetChoiceFilter;
        internal Func<string>? GetLocale;
    }

    // ─── AsyncTrack — parallel execution branch ──────────────────────────────────

    internal class AsyncTrack
    {
        private bool _running = true;
        private BlueprintBlock? _currentBlock;
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
            StartBlockUuid = startBlock.Uuid;
        }

        /// <summary>Begin track execution. Must be called after the track is added to the pool.</summary>
        internal void Start()
        {
            var waitBlocks = _startBlock.NativeProperties?.WaitForBlocks;
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

        internal void Cancel()
        {
            if (!_running) return;
            _running = false;
            if (_previousCleanup != null)
            {
                _previousCleanup();
                _previousCleanup = null;
            }
            _currentBlock = null;
            _pendingAdvance = null;
            foreach (var childId in _childTrackIds)
            {
                _parentHandle.CancelTrack(childId);
            }
            _childTrackIds.Clear();
        }

        internal bool IsRunning() => _running;

        /// <summary>Called by the parent handle when all waitForBlocks UUIDs have been visited.</summary>
        internal void NotifyWaitSatisfied()
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
                CurrentBlockUuid = _currentBlock?.Uuid,
                Running = _running
            };
        }

        // ─── Traversal ──────────────────────────────────────────────────

        private void ProcessBlock(BlueprintBlock block)
        {
            if (!_running) return;

            if (block.Type == BlockType.NOTE)
            {
                var connections = _sceneGraph.GetOutgoingConnections(block.Uuid);
                if (connections.Count > 0)
                {
                    var nextBlock = _sceneGraph.GetBlock(connections[0].ToId);
                    if (nextBlock != null)
                    {
                        ProcessBlock(nextBlock);
                        return;
                    }
                }
                EndTrack();
                return;
            }

            _currentBlock = block;
            _parentHandle.AddVisited(block.Uuid);

            // Fire onBeforeBlock — same gate pattern as SceneHandleImpl.ProcessBlock
            var registry = _parentHandle.GetGlobalRegistry();
            if (registry.BeforeBlockHandler != null)
            {
                registry.BeforeBlockHandler(new BeforeBlockArgs
                {
                    Block = block,
                    Scene = _parentHandle,
                    Context = new BeforeBlockContext { NativeProperties = block.NativeProperties },
                    Resolve = () => ExecuteBlockHandler(block)
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
                block.Type, block.Uuid,
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

                var waitBlocks = block.NativeProperties?.WaitForBlocks;
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
                EndTrack();
                return;
            }

            _previousCleanup = CombineCleanups(sceneCleanup, globalCleanup);

            syncPhase = false;
            if (nextCalled && _pendingAdvance == null)
            {
                AdvanceToNextBlock(block, context);
            }
        }

        private void AdvanceToNextBlock(BlueprintBlock block, IBaseBlockContext? context)
        {
            if (!_running) return;

            var connections = _sceneGraph.GetOutgoingConnections(block.Uuid);
            var resolution = PortResolver.ResolvePort(new PortResolutionInput
            {
                Block = block,
                Connections = connections,
                SelectedChoiceUuid = (context as InternalChoiceContext)?.SelectedChoiceUuid,
                ConditionResult = (context as InternalConditionContext)?.ConditionResult,
                ActionRejected = (context as InternalActionContext)?.ActionRejected,
                CharacterPortIndex = (context as InternalDialogContext)?.CharacterPortIndex
            });

            var allConnections = resolution.Connections;
            BlueprintConnection? mainConnection = null;
            var asyncConnections = new List<BlueprintConnection>();

            foreach (var conn in allConnections)
            {
                var targetBlock = _sceneGraph.GetBlock(conn.ToId);
                if (targetBlock == null) continue;

                if (mainConnection == null && targetBlock.NativeProperties?.IsAsync != true)
                {
                    mainConnection = conn;
                }
                else
                {
                    asyncConnections.Add(conn);
                }
            }

            foreach (var conn in asyncConnections)
            {
                var targetBlock = _sceneGraph.GetBlock(conn.ToId);
                if (targetBlock != null)
                {
                    var trackId = _parentHandle.SpawnAsyncTrack(targetBlock, this.Id);
                    _childTrackIds.Add(trackId);
                }
            }

            if (mainConnection != null)
            {
                var nextBlock = _sceneGraph.GetBlock(mainConnection.ToId);
                if (nextBlock != null)
                {
                    var cleanupToRun = _previousCleanup;
                    _previousCleanup = null;
                    cleanupToRun?.Invoke();
                    ProcessBlock(nextBlock);
                    return;
                }
            }

            EndTrack();
        }

        private void EndTrack()
        {
            if (_previousCleanup != null)
            {
                _previousCleanup();
                _previousCleanup = null;
            }
            // Child tracks survive — only explicit Cancel() cascades
            _running = false;
            _currentBlock = null;
            _parentHandle.RemoveTrack(this);
        }

        private static bool GetGlobalPrevented(IBaseBlockContext context)
        {
            if (context is InternalDialogContext dc) return dc.GlobalPrevented;
            if (context is InternalChoiceContext cc) return cc.GlobalPrevented;
            if (context is InternalConditionContext cndc) return cndc.GlobalPrevented;
            if (context is InternalActionContext ac) return ac.GlobalPrevented;
            return false;
        }

        private static Action? CombineCleanups(Action? a, Action? b)
        {
            if (a != null && b != null) return () => { a(); b(); };
            if (a != null) return a;
            if (b != null) return b;
            return null;
        }
    }

    // ─── SceneHandleImpl ─────────────────────────────────────────────────────────

    internal class SceneHandleImpl : ISceneHandle
    {
        private readonly SceneGraph _sceneGraph;
        private readonly HandlerRegistry _globalRegistry;
        private readonly SceneHandlerRegistry _sceneRegistry = new SceneHandlerRegistry();
        private readonly SceneHandleCallbacks _callbacks;

        private bool _running;
        private bool _cancelled;
        private BlueprintBlock? _currentBlock;
        private BlueprintBlock? _previousBlock;
        private BlockCharacter? _previousCharacter;
        private BlockCharacter? _preResolvedNextCharacter;
        private bool _hasPreResolvedCharacter;
        private readonly HashSet<string> _visited = new HashSet<string>();
        private readonly Dictionary<string, List<string>> _choiceHistory = new Dictionary<string, List<string>>();
        private Action? _previousCleanup;
        private readonly List<AsyncTrack> _asyncTracks = new List<AsyncTrack>();
        private int _nextTrackId = 1;
        private readonly Dictionary<AsyncTrack, List<string>> _pendingWaits = new Dictionary<AsyncTrack, List<string>>();
        private Func<List<BlockCharacter>, BlockCharacter?>? _resolveCharacter;

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
            if (_sceneRegistry.ConditionHandler == null && _globalRegistry.ConditionHandler == null) missing.Add("OnCondition");
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
                EndScene();
            }
        }

        public void Cancel()
        {
            if (!_running) return;
            _cancelled = true;
            _pendingWaits.Clear();
            foreach (var track in _asyncTracks)
            {
                track.Cancel();
            }
            _asyncTracks.Clear();
            if (_previousCleanup != null)
            {
                _previousCleanup();
                _previousCleanup = null;
            }
            _running = false;
            _currentBlock = null;
            FireSceneExit();
            _callbacks.OnSceneEnded?.Invoke(this);
        }

        public void OnEnter(SceneLifecycleHandler handler)
        {
            _sceneRegistry.EnterHandler = handler;
        }

        public void OnExit(SceneLifecycleHandler handler)
        {
            _sceneRegistry.ExitHandler = handler;
        }

        public void OnBlock(string blockUuid, BlockHandler<BlueprintBlock, IBaseBlockContext> handler)
        {
            _sceneRegistry.SetBlockHandler(blockUuid,
                (scene, block, context, next) => handler(new BlockHandlerArgs<BlueprintBlock, IBaseBlockContext>(scene, block, context, next)));
        }

        public void OnDialog(BlockHandler<DialogBlock, IDialogContext> handler)
        {
            _sceneRegistry.DialogHandler = handler;
        }

        public void OnChoice(BlockHandler<ChoiceBlock, IChoiceContext> handler)
        {
            _sceneRegistry.ChoiceHandler = handler;
        }

        public void OnCondition(BlockHandler<ConditionBlock, IConditionContext> handler)
        {
            _sceneRegistry.ConditionHandler = handler;
        }

        public void OnAction(BlockHandler<ActionBlock, IActionContext> handler)
        {
            _sceneRegistry.ActionHandler = handler;
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

        public IReadOnlyList<string>? GetChoice(string blockUuid)
        {
            return _choiceHistory.TryGetValue(blockUuid, out var list) ? list.AsReadOnly() : null;
        }

        /// <summary>Evaluate a condition against the scene's choice history.
        /// Returns false for non-choice conditions (game-state conditions are not resolved here).</summary>
        public bool EvaluateCondition(ExportCondition condition)
        {
            return EvaluateConditionWithHistory(condition, _ => false);
        }

        /// <summary>Set a scene-level character resolution override.</summary>
        public void OnResolveCharacter(Func<List<BlockCharacter>, BlockCharacter?> resolver)
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
                var satisfied = new List<AsyncTrack>();
                foreach (var kvp in _pendingWaits)
                {
                    bool allVisited = true;
                    foreach (var u in kvp.Value)
                    {
                        if (!_visited.Contains(u)) { allVisited = false; break; }
                    }
                    if (allVisited) satisfied.Add(kvp.Key);
                }
                foreach (var track in satisfied)
                {
                    _pendingWaits.Remove(track);
                    track.NotifyWaitSatisfied();
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

        internal void CancelTrack(int trackId)
        {
            foreach (var track in _asyncTracks)
            {
                if (track.Id == trackId) { track.Cancel(); return; }
            }
        }

        internal void RegisterWaitForBlocks(AsyncTrack track, List<string> blockUuids)
        {
            _pendingWaits[track] = blockUuids;
        }

        internal bool IsVisited(string uuid) => _visited.Contains(uuid);

        internal void RemoveTrack(AsyncTrack track)
        {
            int idx = _asyncTracks.IndexOf(track);
            if (idx >= 0) _asyncTracks.RemoveAt(idx);
        }

        internal IBaseBlockContext? CreateBlockContext(BlueprintBlock block)
        {
            return CreateContext(block);
        }

        private void RecordChoice(string blockUuid, string choiceUuid)
        {
            if (_choiceHistory.TryGetValue(blockUuid, out var existing))
            {
                existing.Add(choiceUuid);
            }
            else
            {
                _choiceHistory[blockUuid] = new List<string> { choiceUuid };
            }
        }

        private bool EvaluateConditionWithHistory(
            ExportCondition condition,
            Func<ExportCondition, bool> fallbackEvaluator)
        {
            if (condition.Key.StartsWith("choice:"))
            {
                var blockUuid = condition.Key.Substring(7);
                if (!_choiceHistory.TryGetValue(blockUuid, out var history))
                {
                    return condition.Operator == "!=";
                }
                bool includes = history.Contains(condition.Value);
                return condition.Operator == "!=" ? !includes : includes;
            }
            return fallbackEvaluator(condition);
        }

        internal bool EvaluateConditionForBlock(
            ExportCondition condition,
            Func<ExportCondition, bool> fallbackEvaluator)
        {
            return EvaluateConditionWithHistory(condition, fallbackEvaluator);
        }

        // ─── Traversal loop ────────────────────────────────────────────────

        private void ProcessBlock(BlueprintBlock block)
        {
            if (_cancelled) return;

            // Step 1: Skip NOTE blocks
            if (block.Type == BlockType.NOTE)
            {
                var connections = _sceneGraph.GetOutgoingConnections(block.Uuid);
                if (connections.Count > 0)
                {
                    var nextBlock = _sceneGraph.GetBlock(connections[0].ToId);
                    if (nextBlock != null)
                    {
                        ProcessBlock(nextBlock);
                        return;
                    }
                }
                EndScene();
                return;
            }

            // Step 2: Validate
            if (_globalRegistry.ValidateNextBlockHandler != null)
            {
                var nextCharacters = block.Metadata?.Characters ?? new List<BlockCharacter>();
                var nextCharacter = GetResolveCharacterFn()(nextCharacters);

                var result = _globalRegistry.ValidateNextBlockHandler(new ValidateNextBlockArgs
                {
                    NextBlock = block,
                    FromBlock = _previousBlock,
                    NextContext = new ValidateNextBlockContext { Character = nextCharacter },
                    FromContext = _previousBlock != null ? new ValidateNextBlockContext { Character = _previousCharacter } : null,
                    Port = null
                });
                if (!result.Valid)
                {
                    _globalRegistry.InvalidateBlockHandler?.Invoke(new InvalidateBlockArgs
                    {
                        Scene = this,
                        Reason = result.Reason ?? "validation_failed"
                    });
                    return;
                }
                _hasPreResolvedCharacter = true;
                _preResolvedNextCharacter = nextCharacter;
            }

            if (_cancelled) return;

            // Step 3: Mark as current and visited
            _currentBlock = block;
            AddVisited(block.Uuid);

            // Step 3b: onBeforeBlock
            if (_globalRegistry.BeforeBlockHandler != null)
            {
                _globalRegistry.BeforeBlockHandler(new BeforeBlockArgs
                {
                    Block = block,
                    Scene = this,
                    Context = new BeforeBlockContext { NativeProperties = block.NativeProperties },
                    Resolve = () => ExecuteBlockHandler(block)
                });
            }
            else
            {
                ExecuteBlockHandler(block);
            }
        }

        private void ExecuteBlockHandler(BlueprintBlock block)
        {
            if (_cancelled) return;

            // Step 4: Resolve handler
            var resolved = HandlerResolver.ResolveHandler(
                block.Type, block.Uuid, _sceneRegistry, _globalRegistry);

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
                EndScene();
                return;
            }

            _previousCleanup = CombineCleanups(sceneCleanup, globalCleanup);

            syncPhase = false;
            if (nextCalled)
            {
                AdvanceToNextBlock(block, context);
            }
        }

        private void AdvanceToNextBlock(BlueprintBlock block, IBaseBlockContext? context)
        {
            if (_cancelled) return;

            _previousBlock = block;
            _previousCharacter = context?.Character;

            var connections = _sceneGraph.GetOutgoingConnections(block.Uuid);
            var resolution = PortResolver.ResolvePort(new PortResolutionInput
            {
                Block = block,
                Connections = connections,
                SelectedChoiceUuid = (context as InternalChoiceContext)?.SelectedChoiceUuid,
                ConditionResult = (context as InternalConditionContext)?.ConditionResult,
                ActionRejected = (context as InternalActionContext)?.ActionRejected,
                CharacterPortIndex = (context as InternalDialogContext)?.CharacterPortIndex
            });

            var allConnections = resolution.Connections;

            // Separate: first non-async = main track, rest = async
            BlueprintConnection? mainConnection = null;
            var asyncConnections = new List<BlueprintConnection>();

            foreach (var conn in allConnections)
            {
                var targetBlock = _sceneGraph.GetBlock(conn.ToId);
                if (targetBlock == null) continue;

                if (mainConnection == null && targetBlock.NativeProperties?.IsAsync != true)
                {
                    mainConnection = conn;
                }
                else
                {
                    asyncConnections.Add(conn);
                }
            }

            // Clear pre-resolved cache before spawning async tracks to prevent
            // an async track from consuming the main track's cached character.
            _hasPreResolvedCharacter = false;
            _preResolvedNextCharacter = null;

            // Spawn async tracks
            foreach (var conn in asyncConnections)
            {
                var targetBlock = _sceneGraph.GetBlock(conn.ToId);
                if (targetBlock != null)
                {
                    SpawnAsyncTrack(targetBlock, null);
                }
            }

            // Continue main track
            if (mainConnection != null)
            {
                var nextBlock = _sceneGraph.GetBlock(mainConnection.ToId);
                if (nextBlock != null)
                {
                    var cleanupToRun = _previousCleanup;
                    _previousCleanup = null;
                    cleanupToRun?.Invoke();
                    ProcessBlock(nextBlock);
                    return;
                }
            }

            // Dead end — scene complete
            EndScene();
        }

        private void EndScene()
        {
            _pendingWaits.Clear();
            foreach (var track in _asyncTracks)
            {
                track.Cancel();
            }
            _asyncTracks.Clear();
            if (_previousCleanup != null)
            {
                _previousCleanup();
                _previousCleanup = null;
            }
            _running = false;
            _currentBlock = null;
            FireSceneExit();
            _callbacks.OnSceneEnded?.Invoke(this);
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

        private Func<List<BlockCharacter>, BlockCharacter?> GetResolveCharacterFn()
        {
            return _resolveCharacter
                ?? _callbacks.GetResolveCharacter?.Invoke()
                ?? (chars => chars.Count > 0 ? chars[0] : null);
        }

        private RuntimeChoiceItem[] TagChoiceVisibility(
            List<ChoiceItem> choices,
            Func<ExportCondition, bool>? filter)
        {
            if (filter == null)
            {
                // No filter installed — return choices as-is (no Visible tag)
                var items = new RuntimeChoiceItem[choices.Count];
                for (int i = 0; i < choices.Count; i++)
                {
                    var c = choices[i];
                    items[i] = new RuntimeChoiceItem
                    {
                        Uuid = c.Uuid,
                        StructureKey = c.StructureKey,
                        Label = c.Label,
                        DialogueText = c.DialogueText,
                        VisibilityConditions = c.VisibilityConditions,
                        Visible = null,
                    };
                }
                return items;
            }

            var result = new RuntimeChoiceItem[choices.Count];
            for (int i = 0; i < choices.Count; i++)
            {
                var choice = choices[i];
                bool visible;
                if (choice.VisibilityConditions == null || choice.VisibilityConditions.Count == 0)
                {
                    visible = true;
                }
                else
                {
                    visible = ConditionEvaluator.EvaluateConditionChain(choice.VisibilityConditions, cond =>
                    {
                        if (cond.Key.StartsWith("choice:"))
                        {
                            return EvaluateConditionWithHistory(cond, _ => false);
                        }
                        return filter(cond);
                    });
                }
                result[i] = new RuntimeChoiceItem
                {
                    Uuid = choice.Uuid,
                    StructureKey = choice.StructureKey,
                    Label = choice.Label,
                    DialogueText = choice.DialogueText,
                    VisibilityConditions = choice.VisibilityConditions,
                    Visible = visible,
                };
            }
            return result;
        }

        private IBaseBlockContext? CreateContext(BlueprintBlock block)
        {
            BlockCharacter? resolvedCharacter;
            if (_hasPreResolvedCharacter)
            {
                resolvedCharacter = _preResolvedNextCharacter;
                _hasPreResolvedCharacter = false;
                _preResolvedNextCharacter = null;
            }
            else
            {
                var characters = block.Metadata?.Characters ?? new List<BlockCharacter>();
                resolvedCharacter = GetResolveCharacterFn()(characters);
            }

            switch (block)
            {
                case DialogBlock db:
                    return BlockContextFactory.CreateDialogContext(db, resolvedCharacter);
                case ChoiceBlock cb:
                {
                    var choiceFilter = _callbacks.GetChoiceFilter?.Invoke();
                    var taggedChoices = TagChoiceVisibility(cb.Choices ?? new List<ChoiceItem>(), choiceFilter);
                    return BlockContextFactory.CreateChoiceContext(cb, taggedChoices, RecordChoice, resolvedCharacter);
                }
                case ConditionBlock _:
                    return BlockContextFactory.CreateConditionContext(resolvedCharacter);
                case ActionBlock _:
                    return BlockContextFactory.CreateActionContext(resolvedCharacter);
                default:
                    return null;
            }
        }

        private static bool GetGlobalPrevented(IBaseBlockContext context)
        {
            if (context is InternalDialogContext dc) return dc.GlobalPrevented;
            if (context is InternalChoiceContext cc) return cc.GlobalPrevented;
            if (context is InternalConditionContext cndc) return cndc.GlobalPrevented;
            if (context is InternalActionContext ac) return ac.GlobalPrevented;
            return false;
        }

        private static Action? CombineCleanups(Action? a, Action? b)
        {
            if (a != null && b != null) return () => { a(); b(); };
            if (a != null) return a;
            if (b != null) return b;
            return null;
        }
    }
}

// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop (C# port of scene-handle.ts)

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    internal class SceneHandleCallbacks
    {
        internal Action<SceneHandleImpl>? OnSceneStarted;
        internal Action<SceneHandleImpl>? OnSceneEnded;
        internal Func<IStateBridge?>? GetStateBridge;
        internal Func<string>? GetLocale;
    }

    // ─── AsyncTrack — parallel execution branch ──────────────────────────────────

    internal class AsyncTrack
    {
        private bool _running = true;
        private BlueprintBlock? _currentBlock;
        private Action? _previousCleanup;
        private readonly bool _followNarrative;
        private Action? _pendingAdvance;

        private readonly SceneGraph _sceneGraph;
        private readonly SceneHandleImpl _parentHandle;

        internal AsyncTrack(SceneGraph sceneGraph, SceneHandleImpl parentHandle, BlueprintBlock startBlock)
        {
            _sceneGraph = sceneGraph;
            _parentHandle = parentHandle;
            _followNarrative = startBlock.NativeProperties?.FollowNarrative == true;
            ProcessBlock(startBlock);
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
        }

        internal bool IsRunning() => _running;
        internal bool IsFollowNarrative() => _followNarrative;

        internal void NotifyMainAdvance()
        {
            if (!_running || !_followNarrative) return;

            if (_pendingAdvance != null)
            {
                var advance = _pendingAdvance;
                _pendingAdvance = null;
                advance();
            }
            else
            {
                ForceAdvance();
            }
        }

        // ─── Traversal ──────────────────────────────────────────────────

        private void ProcessBlock(BlueprintBlock block)
        {
            if (!_running) return;

            // Skip NOTE blocks
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

            ExecuteBlockHandler(block);
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

            // Auto-behavior
            if (resolved.SceneHandler == null && resolved.GlobalHandler == null)
            {
                if (block is ConditionBlock cb)
                {
                    AutoEvaluateCondition(cb, (InternalConditionContext)context);
                    return;
                }
                if (block is ActionBlock ab)
                {
                    AutoExecuteAction(ab, (InternalActionContext)context);
                    return;
                }
            }

            bool nextCalled = false;
            bool syncPhase = true;
            Action? sceneCleanup = null;
            Action? globalCleanup = null;

            void next()
            {
                if (nextCalled) return;
                nextCalled = true;

                if (_followNarrative)
                {
                    _pendingAdvance = () => AdvanceToNextBlock(block, context);
                    return;
                }

                if (syncPhase) return;
                AdvanceToNextBlock(block, context);
            }

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

            _previousCleanup = CombineCleanups(sceneCleanup, globalCleanup);

            syncPhase = false;
            if (nextCalled && !_followNarrative)
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

            // Async tracks follow the first connection only
            if (resolution.Connections.Count > 0)
            {
                var conn = resolution.Connections[0];
                var nextBlock = _sceneGraph.GetBlock(conn.ToId);
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

        private void ForceAdvance()
        {
            if (!_running || _currentBlock == null) return;
            var block = _currentBlock;
            if (_previousCleanup != null)
            {
                _previousCleanup();
                _previousCleanup = null;
            }
            AdvanceToNextBlock(block, null);
        }

        private void EndTrack()
        {
            if (_previousCleanup != null)
            {
                _previousCleanup();
                _previousCleanup = null;
            }
            _running = false;
            _currentBlock = null;
            _parentHandle.RemoveTrack(this);
        }

        private void AutoEvaluateCondition(ConditionBlock block, InternalConditionContext context)
        {
            var bridge = _parentHandle.GetStateBridgeInternal();
            if (bridge == null) { EndTrack(); return; }
            context.ConditionResult = ConditionEvaluator.EvaluateConditionChain(
                block.Conditions ?? new List<ExportCondition>(),
                bridge.EvaluateCondition);
            _previousCleanup = null;
            AdvanceToNextBlock(block, context);
        }

        private void AutoExecuteAction(ActionBlock block, InternalActionContext context)
        {
            var bridge = _parentHandle.GetStateBridgeInternal();
            if (bridge == null) { EndTrack(); return; }
            foreach (var action in block.Actions ?? new List<ExportAction>())
            {
                bridge.ExecuteAction(action, null);
            }
            context.ActionRejected = false;
            _previousCleanup = null;
            AdvanceToNextBlock(block, context);
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
        private readonly HashSet<string> _visited = new HashSet<string>();
        private Action? _previousCleanup;
        private readonly List<AsyncTrack> _asyncTracks = new List<AsyncTrack>();

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

        // ─── Internal API (used by AsyncTrack) ───────────────────────────────

        internal SceneGraph GetSceneGraph() => _sceneGraph;
        internal SceneHandlerRegistry GetSceneRegistry() => _sceneRegistry;
        internal HandlerRegistry GetGlobalRegistry() => _globalRegistry;
        internal IStateBridge? GetStateBridgeInternal() => _callbacks.GetStateBridge?.Invoke();
        internal void AddVisited(string uuid) => _visited.Add(uuid);

        internal void RemoveTrack(AsyncTrack track)
        {
            int idx = _asyncTracks.IndexOf(track);
            if (idx >= 0) _asyncTracks.RemoveAt(idx);
        }

        internal IBaseBlockContext? CreateBlockContext(BlueprintBlock block)
        {
            return CreateContext(block);
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
                var result = _globalRegistry.ValidateNextBlockHandler(new ValidateNextBlockArgs
                {
                    NextBlock = block,
                    FromBlock = _previousBlock,
                    Port = null,
                    Context = new SceneContext()
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
            }

            if (_cancelled) return;

            // Step 3: Mark as current and visited
            _currentBlock = block;
            _visited.Add(block.Uuid);

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

            // Auto-behavior: no handlers → auto-evaluate/execute
            if (resolved.SceneHandler == null && resolved.GlobalHandler == null)
            {
                if (block is ConditionBlock cb)
                {
                    AutoEvaluateCondition(cb, (InternalConditionContext)context);
                    return;
                }
                if (block is ActionBlock ab)
                {
                    AutoExecuteAction(ab, (InternalActionContext)context);
                    return;
                }
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

            // Spawn async tracks
            foreach (var conn in asyncConnections)
            {
                var targetBlock = _sceneGraph.GetBlock(conn.ToId);
                if (targetBlock != null)
                {
                    _asyncTracks.Add(new AsyncTrack(_sceneGraph, this, targetBlock));
                }
            }

            // Notify existing follow-narrative tracks
            foreach (var track in _asyncTracks)
            {
                if (track.IsFollowNarrative())
                {
                    track.NotifyMainAdvance();
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

        // ─── Auto-behaviors ──────────────────────────────────────────────────

        private void AutoEvaluateCondition(ConditionBlock block, InternalConditionContext context)
        {
            var bridge = _callbacks.GetStateBridge?.Invoke();
            if (bridge == null)
            {
                EndScene();
                return;
            }
            context.ConditionResult = ConditionEvaluator.EvaluateConditionChain(
                block.Conditions ?? new List<ExportCondition>(),
                bridge.EvaluateCondition);
            _previousCleanup = null;
            AdvanceToNextBlock(block, context);
        }

        private void AutoExecuteAction(ActionBlock block, InternalActionContext context)
        {
            var bridge = _callbacks.GetStateBridge?.Invoke();
            if (bridge == null)
            {
                EndScene();
                return;
            }
            foreach (var action in block.Actions ?? new List<ExportAction>())
            {
                bridge.ExecuteAction(action, null);
            }
            context.ActionRejected = false;
            _previousCleanup = null;
            AdvanceToNextBlock(block, context);
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

        private IBaseBlockContext? CreateContext(BlueprintBlock block)
        {
            var bridge = _callbacks.GetStateBridge?.Invoke();
            var characters = block.Metadata?.Characters ?? new List<BlockCharacter>();
            var resolvedCharacter = bridge?.ResolveCharacter(characters);

            switch (block)
            {
                case DialogBlock db:
                    return BlockContextFactory.CreateDialogContext(db, resolvedCharacter);
                case ChoiceBlock cb:
                {
                    Func<ExportCondition, bool> evaluator = bridge != null
                        ? bridge.EvaluateCondition
                        : (_ => true);
                    return BlockContextFactory.CreateChoiceContext(cb, evaluator, resolvedCharacter);
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

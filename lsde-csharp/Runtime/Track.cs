// LSDE Dialog Engine — one track walking the graph (C# port of track.ts)
//
// This is THE traversal. There is one of it, and every track uses it: the one the player is
// watching and every parallel branch IsAsync opens. A track is a cursor — it knows which block it
// is on, what it still has to clean up, and whether it is parked. It does not know it is the main
// one; only the scene knows that, and only when the track ends.
//
// It used to be written twice. SceneHandleImpl walked the graph itself for the main flow, and
// AsyncTrack walked it again for the parallel ones — the same five methods, side by side in one
// file. Then the two drifted, because a change to one is silent in the other:
//
//   WaitForBlocks was added to the parallel copy       -> inert on the main flow, for months
//   OnValidateNextBlock was added to the main copy     -> never fired on a parallel branch
//
// Both shipped in v1 and neither showed up at runtime. That is the whole argument for this file.

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>Anything the engine can park until a set of blocks has been visited.</summary>
    internal interface IWaiter
    {
        void NotifyWaitSatisfied();
    }

    /// <summary>
    /// Running the cleanups a handler returned, without letting one break a teardown.
    /// </summary>
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

    /// <summary>
    /// The engine-facing properties of a block, read straight out of Props.
    /// </summary>
    /// <remarks>v2 has one bag: natives and the writer's own properties share Props, keyed by bare
    /// id. Ids cannot collide — LSDE refuses a project property that takes a native name — so
    /// reading a native is a plain lookup. Only two of them mean anything here: IsAsync opens a
    /// track, WaitForBlocks holds one. The rest are passed through untouched.</remarks>
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
        /// NOTE blocks are designer-only: they carry no handler and are never executed, so a track
        /// steps over them and follows their first outgoing connection.
        ///
        /// Returns <c>null</c> when the walk runs out of connections — and also when it comes back
        /// to a NOTE it already stepped over. A designer can wire a NOTE into a loop, and following
        /// it recursively overflowed the stack instead of ending the flow.
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

    /// <summary>
    /// What a track needs from the scene that owns it.
    /// </summary>
    /// <remarks>Deliberately narrow. Everything here is SHARED between tracks — the visited set,
    /// the registries, the pending waits — which is exactly why it lives on the scene and not on a
    /// track. A track that could reach the whole SceneHandleImpl would drift back into doing the
    /// scene's job.</remarks>
    internal interface ITrackHost
    {
        SceneGraph GetSceneGraph();
        HandlerRegistry GetGlobalRegistry();
        SceneHandlerRegistry GetSceneRegistry();

        /// <summary>The handle handed to handlers as Scene. Always the scene, never the track.</summary>
        ISceneHandle AsSceneHandle();

        /// <summary>Is the scene still playing? A track stops the moment its scene does.</summary>
        bool IsSceneRunning();

        void AddVisited(string blockId);
        bool IsVisited(string blockId);
        void RegisterWaitForBlocks(IWaiter waiter, List<string> blockIds);

        IBaseBlockContext? CreateBlockContext(BlueprintBlock block);
        bool RunValidation(BlueprintBlock block, BlueprintBlock? fromBlock, Card? fromCharacter);

        /// <summary>Open a parallel track on startBlock. Returns its id.</summary>
        int SpawnTrack(BlueprintBlock startBlock, int? parentTrackId);
        Exception? CancelTrack(int trackId);

        /// <summary>This track reached the end of its flow. The scene decides what that means.</summary>
        Exception? TrackEnded(Track track);
    }

    /// <summary>One cursor walking the graph. The main flow is one of these, with id 0.</summary>
    internal class Track : IWaiter
    {
        /// <summary>The id of the track the player is watching. Every other track is numbered from 1.</summary>
        /// <remarks>A number and not a flag because the main track is not special: it is the first
        /// one, and the scene ends when it ends. That is the ONLY thing that sets it apart.</remarks>
        internal const int MainTrackId = 0;

        internal int Id { get; }
        internal int? ParentTrackId { get; }
        internal string StartBlockUuid { get; }

        private readonly ITrackHost _host;
        private readonly BlueprintBlock _startBlock;
        /// <summary>Tracks this one opened. Only an explicit Cancel() cascades to them.</summary>
        private readonly List<int> _childTrackIds = new List<int>();

        private bool _running = true;
        private BlueprintBlock? _currentBlock;
        /// <summary>Where this track came from, for OnValidateNextBlock. Its own, not another track's.</summary>
        private BlueprintBlock? _previousBlock;
        private Card? _previousCharacter;
        private Action? _previousCleanup;
        /// <summary>What to resume when a WaitForBlocks is satisfied.</summary>
        private Action? _pendingAdvance;

        internal Track(ITrackHost host, BlueprintBlock startBlock, int id, int? parentTrackId)
        {
            _host = host;
            _startBlock = startBlock;
            Id = id;
            ParentTrackId = parentTrackId;
            StartBlockUuid = startBlock.Id;
        }

        /// <summary>Begin walking. Must be called after the track is in the scene's pool.</summary>
        internal void Start()
        {
            ProcessBlock(_startBlock);
        }

        /// <summary>Stop this track and every track it opened.</summary>
        /// <remarks>Returns a fault instead of throwing one: the scene cancels the whole pool in a
        /// loop, and one badly-behaved cleanup must not leave the tracks after it running.</remarks>
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
                fault = fault ?? _host.CancelTrack(childId);
            }
            _childTrackIds.Clear();
            return fault;
        }

        internal bool IsRunning() => _running;

        internal BlueprintBlock? GetCurrentBlock() => _currentBlock;

        /// <summary>Called once every block this track was waiting on has been visited.</summary>
        public void NotifyWaitSatisfied()
        {
            if (!_running || !_host.IsSceneRunning() || _pendingAdvance == null) return;
            var advance = _pendingAdvance;
            _pendingAdvance = null;
            advance();
        }

        /// <summary>A read-only snapshot, for a debug view.</summary>
        internal TrackInfo GetTrackInfo()
        {
            return new TrackInfo
            {
                Id = Id,
                ParentTrackId = ParentTrackId,
                StartBlockUuid = StartBlockUuid,
                CurrentBlockUuid = _currentBlock?.Id,
                Running = _running,
            };
        }

        // ─── The traversal ───────────────────────────────────────────────

        /// <summary>
        /// Take a block, and either park on it or dispatch it.
        /// </summary>
        /// <remarks>The order matters and each step earns its place:
        /// <para>1. Step over NOTEs. They are designer-only and never dispatched.</para>
        /// <para>2. Honour WaitForBlocks. BEFORE anything else — see the note inside.</para>
        /// <para>3. Ask OnValidateNextBlock. The game's gate; a refusal stops this track.</para>
        /// <para>4. Mark it current and visited, which may release another parked track.</para>
        /// <para>5. Fire OnBeforeBlock, whose Resolve() releases the type handler.</para></remarks>
        private void ProcessBlock(BlueprintBlock startingBlock)
        {
            if (!_running || !_host.IsSceneRunning()) return;

            var sceneGraph = _host.GetSceneGraph();

            var block = NoteWalk.SkipNotes(startingBlock, sceneGraph);
            if (block == null)
            {
                var deadEnd = EndFlow();
                if (deadEnd != null) throw deadEnd;
                return;
            }

            // WaitForBlocks holds the block BEFORE it is dispatched — the handler is never called,
            // so the game does not even learn the block exists until the wait lifts. That is the
            // engine's decision, not a rendering choice a game could make differently: the
            // property is native, the designer ticks it in LSDE, and the engine owes them the
            // behaviour.
            //
            // It used to mean two different things depending on where the block sat: a track's
            // FIRST block was held before dispatch, any later one was dispatched and held before
            // advancing. Same checkbox, two meanings, and the second one showed the line early.
            var waitBlocks = Natives.WaitForBlocks(block);
            if (waitBlocks != null && waitBlocks.Count > 0 && !AllVisited(waitBlocks))
            {
                var parked = block;
                _pendingAdvance = () => ProcessBlock(parked);
                _host.RegisterWaitForBlocks(this, waitBlocks);
                return;
            }

            if (!_host.RunValidation(block, _previousBlock, _previousCharacter)) return;

            _currentBlock = block;
            _host.AddVisited(block.Id);

            var registry = _host.GetGlobalRegistry();
            if (registry.BeforeBlockHandler != null)
            {
                // GUARDED like Next(): a delay timer that fires twice would otherwise dispatch the
                // same block twice — the handler runs again, cleanups pile up, and the track
                // advances from a block it already left.
                var resolvedOnce = false;
                registry.BeforeBlockHandler(new BeforeBlockArgs
                {
                    Block = block,
                    Scene = _host.AsSceneHandle(),
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

        /// <summary>
        /// Run the handlers for a block, then leave when the game says so.
        /// </summary>
        /// <remarks>Next() is guarded and deferred: called during the handler it only raises a
        /// flag, and the advance happens once both handlers have returned. Otherwise a scene
        /// handler calling Next() would move the flow on before the global handler ever ran.</remarks>
        private void ExecuteBlockHandler(BlueprintBlock block)
        {
            // Running and not just the scene's: a Resolve() kept in a closure and fired after this
            // track ended would otherwise restart it on a dead flow.
            if (!_running || !_host.IsSceneRunning()) return;

            var resolved = HandlerResolver.ResolveHandler(
                block.Type, block.Id,
                _host.GetSceneRegistry(),
                _host.GetGlobalRegistry());

            var context = _host.CreateBlockContext(block);
            if (context == null)
            {
                AdvanceToNextBlock(block, null);
                return;
            }

            // No handler → advance silently. Start() already refused a scene missing one.
            if (resolved.SceneHandler == null && resolved.GlobalHandler == null)
            {
                AdvanceToNextBlock(block, context);
                return;
            }

            var nextCalled = false;
            var syncPhase = true;
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
                    sceneCleanup = resolved.SceneHandler(_host.AsSceneHandle(), block, context, next);
                    var globalPrevented = GetGlobalPrevented(context);
                    if (!globalPrevented && resolved.GlobalHandler != null)
                    {
                        globalCleanup = resolved.GlobalHandler(_host.AsSceneHandle(), block, context, next);
                    }
                }
                else if (resolved.GlobalHandler != null)
                {
                    globalCleanup = resolved.GlobalHandler(_host.AsSceneHandle(), block, context, next);
                }
            }
            catch
            {
                // The flow is closed down first, THEN the error is re-thrown. By the time the game
                // sees it, the cleanups have run and OnSceneExit has fired if this was the main
                // track. The dialogue stopped PROPERLY, and the error surfaces where the game
                // called Start() or next().
                //
                // v1 swallowed it — silently, not even logged — while an exception from the
                // cleanup that same handler returned reached the caller.
                EndFlow();
                throw;
            }

            // Stored BEFORE any advance runs, so leaving the block finds it.
            _previousCleanup = Cleanups.Combine(sceneCleanup, globalCleanup);

            syncPhase = false;
            if (nextCalled)
            {
                AdvanceToNextBlock(block, context);
            }
        }

        /// <summary>
        /// Leave a block: pick the outgoing links, open a track per parallel target, follow the rest.
        /// </summary>
        /// <remarks>The FIRST non-async target continues this track; every other resolved link
        /// opens one. A port with several non-async targets is a MULTIPLE_NON_ASYNC_FORK warning at
        /// init, and here the second one simply never becomes the continuation.</remarks>
        private void AdvanceToNextBlock(BlueprintBlock block, IBaseBlockContext? context)
        {
            if (!_running || !_host.IsSceneRunning()) return;

            _previousBlock = block;
            _previousCharacter = context?.Character;

            var sceneGraph = _host.GetSceneGraph();
            var resolution = PortResolver.ResolvePort(new PortResolutionInput
            {
                Block = block,
                Links = sceneGraph.GetOutgoingLinks(block.Id),
                SelectedOptionId = (context as InternalChoiceContext)?.SelectedOptionId,
                ConditionPort = (context as InternalConditionContext)?.ConditionPort,
                ActionRejected = (context as InternalActionContext)?.ActionRejected,
                ActorPort = (context as InternalDialogContext)?.ActorPort,
            });

            Link? mainLink = null;
            var asyncLinks = new List<Link>();

            foreach (var link in resolution.Links)
            {
                var targetBlock = sceneGraph.GetBlock(link.To);
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
                var targetBlock = sceneGraph.GetBlock(link.To);
                if (targetBlock != null)
                {
                    _childTrackIds.Add(_host.SpawnTrack(targetBlock, Id));
                }
            }

            if (mainLink != null)
            {
                var nextBlock = sceneGraph.GetBlock(mainLink.To);
                if (nextBlock != null)
                {
                    var cleanupToRun = _previousCleanup;
                    _previousCleanup = null;
                    var fault = Cleanups.Run(cleanupToRun);
                    if (fault != null)
                    {
                        // Same order as a handler that throws: close down first, surface after.
                        EndFlow();
                        throw fault;
                    }
                    ProcessBlock(nextBlock);
                    return;
                }
            }

            var endFault = EndFlow();
            if (endFault != null) throw endFault;
        }

        /// <summary>
        /// This track has nowhere left to go.
        /// </summary>
        /// <remarks>Its own cleanup runs, then the scene is told. Whether that ends the scene or
        /// just retires a branch is the scene's call — a track does not know which one it is.
        /// <para>Child tracks SURVIVE: they live independently in the pool, and only an explicit
        /// Cancel() cascades to them.</para></remarks>
        private Exception? EndFlow()
        {
            var cleanup = _previousCleanup;
            _previousCleanup = null;
            var fault = Cleanups.Run(cleanup);

            _running = false;
            _currentBlock = null;
            _pendingAdvance = null;

            var hostFault = _host.TrackEnded(this);
            return fault ?? hostFault;
        }

        private bool AllVisited(List<string> blockIds)
        {
            foreach (var id in blockIds)
            {
                if (!_host.IsVisited(id)) return false;
            }
            return true;
        }

        private static bool GetGlobalPrevented(IBaseBlockContext context)
        {
            return context is InternalBlockContext internalContext && internalContext.GlobalPrevented;
        }
    }
}

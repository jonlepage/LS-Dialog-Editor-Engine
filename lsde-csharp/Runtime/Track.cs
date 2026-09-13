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
    /// <summary>Anything the engine can park until a set of blocks has FINISHED.</summary>
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
    /// track, WaitForBlocks holds one. InPortPerCharacter is read by the scene, when it resolves
    /// the cards. The rest are passed through untouched.</remarks>
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
        /// <summary>The track has LEFT this block: handler returned, port resolved, cleanup run.</summary>
        void AddCompleted(string blockId);
        bool IsCompleted(string blockId);
        void RegisterWaitForBlocks(IWaiter waiter, List<string> blockIds);

        /// <summary>Build the context of a block. entryPort is the port the wire arrived on — a CARD
        /// ID under InPortPerCharacter, "in" otherwise.</summary>
        IBaseBlockContext? CreateBlockContext(BlueprintBlock block, string entryPort);
        bool RunValidation(BlueprintBlock block, string entryPort, BlueprintBlock? fromBlock, Card? fromCharacter);

        /// <summary>Open a parallel track on startBlock, entered through entryPort. Returns its id.</summary>
        int SpawnTrack(BlueprintBlock startBlock, int? parentTrackId, string entryPort);
        Exception? CancelTrack(int trackId);

        /// <summary>This track reached the end of its flow — <see cref="SceneEndReason.Completed"/>
        /// or <see cref="SceneEndReason.Invalidated"/>. The scene decides what that means.</summary>
        Exception? TrackEnded(Track track, string ending);

        /// <summary>A track just parked on a WaitForBlocks. The scene closes if nothing is left to
        /// release it.</summary>
        Exception? TrackParked();

        /// <summary>Code of the game threw <paramref name="error"/> during the walk: close the scene,
        /// and hand the error to OnSceneExit. The caller re-throws.</summary>
        /// <remarks>Idempotent — a fault on a nested track passes through every walk on its way
        /// out, and only the first one closes anything, so the error OnSceneExit sees is the one
        /// that started it.</remarks>
        void Fault(Exception error);

        /// <summary>Throw when the game calls into the scene from another thread than the one that
        /// started it. <paramref name="call"/> names the call, for the message.</summary>
        void EnsureOwnerThread(string call);
    }

    /// <summary>
    /// One unit of the walk, handed back to <see cref="Track"/>'s loop instead of called.
    /// </summary>
    /// <remarks>Process takes a block the track has arrived at, Execute dispatches it once
    /// OnBeforeBlock has let it through, Advance leaves it once the game has said so.</remarks>
    internal sealed class Step
    {
        internal enum StepKind { Process, Execute, Advance }

        internal StepKind Kind { get; }
        internal BlueprintBlock Block { get; }
        internal string EntryPort { get; }
        internal IBaseBlockContext? Context { get; }

        private Step(StepKind kind, BlueprintBlock block, string entryPort, IBaseBlockContext? context)
        {
            Kind = kind;
            Block = block;
            EntryPort = entryPort;
            Context = context;
        }

        internal static Step Process(BlueprintBlock block, string entryPort) => new Step(StepKind.Process, block, entryPort, null);
        internal static Step Execute(BlueprintBlock block, string entryPort) => new Step(StepKind.Execute, block, entryPort, null);
        internal static Step Advance(BlueprintBlock block, IBaseBlockContext? context) => new Step(StepKind.Advance, block, Ports.In, context);
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
        internal string StartBlockId { get; }

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
        private Step? _pendingStep;

        /// <summary>The wires this track still owes, in the order it will walk them.</summary>
        /// <remarks>A port may carry several wires. The ones whose target is IsAsync open their
        /// own track; the others are THIS track's to walk, one after the other — so they queue
        /// here, and the track picks the next one up when the branch it is on runs out of graph.
        /// <para>New wires go in at the FRONT. A designer reading their own graph expects a branch
        /// to finish before its sibling starts: A then [B, C], and B then [D, E], plays B, D, E,
        /// then C — not B, D, C, E. Front insertion is what makes the walk depth-first, which is
        /// how the graph reads on screen.</para></remarks>
        private readonly List<Link> _queue = new List<Link>();

        /// <summary>The entry port of the wire that opened this track. "in" for the flow the player watches.</summary>
        private readonly string _startEntryPort;

        internal Track(ITrackHost host, BlueprintBlock startBlock, int id, int? parentTrackId, string startEntryPort)
        {
            _host = host;
            _startBlock = startBlock;
            Id = id;
            ParentTrackId = parentTrackId;
            StartBlockId = startBlock.Id;
            _startEntryPort = startEntryPort;
        }

        /// <summary>Begin walking. Must be called after the track is in the scene's pool.</summary>
        internal void Start()
        {
            Run(Step.Process(_startBlock, _startEntryPort));
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
            _pendingStep = null;
            _queue.Clear();
            foreach (var childId in _childTrackIds)
            {
                // Evaluated FIRST, then kept — see the note in SceneHandleImpl.Shutdown().
                var childFault = _host.CancelTrack(childId);
                fault = fault ?? childFault;
            }
            _childTrackIds.Clear();
            return fault;
        }

        internal bool IsRunning() => _running;

        /// <summary>Parked on a waitForBlocks — alive, but unable to move on its own.</summary>
        /// <remarks>It is waiting for ANOTHER track to finish a block, so it cannot be what keeps a
        /// scene open: once every remaining track is parked like this, nothing will ever finish
        /// anything again. That is the deadlock SceneHandleImpl closes the scene on — whether the
        /// last track able to move ENDS (TrackEnded) or PARKS (TrackParked).</remarks>
        internal bool IsWaitingForBlocks() => _pendingStep != null;

        internal BlueprintBlock? GetCurrentBlock() => _currentBlock;

        /// <summary>Called once every block this track was waiting on has been finished.</summary>
        public void NotifyWaitSatisfied()
        {
            if (!_running || !_host.IsSceneRunning() || _pendingStep == null) return;
            var step = _pendingStep;
            _pendingStep = null;
            Run(step);
        }

        /// <summary>A read-only snapshot, for a debug view.</summary>
        internal TrackInfo GetTrackInfo()
        {
            return new TrackInfo
            {
                Id = Id,
                ParentTrackId = ParentTrackId,
                StartBlockId = StartBlockId,
                CurrentBlockId = _currentBlock?.Id,
                Running = _running,
            };
        }

        // ─── The loop ────────────────────────────────────────────────────

        /// <summary>
        /// Walk from <paramref name="first"/> until the track has to wait for the game. The one
        /// error boundary.
        /// </summary>
        /// <remarks>
        /// <para><b>The stack.</b> Every step used to CALL the next one — ProcessBlock,
        /// ExecuteBlockHandler, AdvanceToNextBlock, ProcessBlock again — three frames per block for
        /// as long as the game advanced synchronously, and nothing brought the stack back down. A
        /// condition/action loop is a StackOverflowException here: no catch stops it, and it takes
        /// the whole Unity process down — the shared spec's loop crashed the test host outright.
        /// Every one of those calls was the LAST thing its caller did, so each step now RETURNS the
        /// next one and this loop takes it: the same steps, in the same order, at a constant
        /// depth.</para>
        /// <para>What still nests is what has to come back: opening a child track, and releasing a
        /// parked one. Each runs the other track's loop and returns here. The depth they add is how
        /// many are opened or released in a row without the game ever waiting — a property of the
        /// graph's async shape, not of its length.</para>
        /// <para><b>The faults.</b> Only the type handler used to sit inside a try. A throwing
        /// validation, OnBeforeBlock or resolver — or a fault on a track this one had just opened —
        /// escaped through a track that had not finished leaving its block, and the scene stayed
        /// open with nothing able to move it. Every entry into the walk comes through here, so every
        /// line of the game's code the walk calls is inside this try. The scene is closed down
        /// FIRST — cleanups run, tracks cancelled, OnSceneExit fired — and THEN the exception is
        /// re-thrown, with its original stack, to whoever called Start(), Next() or Resolve(). That
        /// is problem 11 of MIGRATION-V2.md, and it now holds for all of them, on every
        /// track.</para>
        /// </remarks>
        private void Run(Step first)
        {
            Step? step = first;
            try
            {
                while (step != null) step = Take(step);
            }
            catch (Exception err)
            {
                _host.Fault(err);
                throw;
            }
        }

        private Step? Take(Step step)
        {
            switch (step.Kind)
            {
                case Step.StepKind.Process: return ProcessBlock(step.Block, step.EntryPort);
                case Step.StepKind.Execute: return ExecuteBlockHandler(step.Block, step.EntryPort);
                default: return AdvanceToNextBlock(step.Block, step.Context);
            }
        }

        // ─── The traversal ───────────────────────────────────────────────

        /// <summary>
        /// Take a block, and either park on it or dispatch it.
        /// </summary>
        /// <remarks>The order matters and each step earns its place:
        /// <para>1. Step over NOTEs. They are designer-only and never dispatched.</para>
        /// <para>2. Honour WaitForBlocks. BEFORE anything else — see the note inside.</para>
        /// <para>3. Ask OnValidateNextBlock. The game's gate; a refusal stops this track.</para>
        /// <para>4. Mark it current and visited.</para>
        /// <para>5. Fire OnBeforeBlock, whose Resolve() releases the type handler.</para></remarks>
        /// <returns>The next step, or null when the track has to wait — for Resolve(), for a join,
        /// or for good.</returns>
        private Step? ProcessBlock(BlueprintBlock startingBlock, string entryPort)
        {
            if (!_running || !_host.IsSceneRunning()) return null;

            var sceneGraph = _host.GetSceneGraph();

            var block = NoteWalk.SkipNotes(startingBlock, sceneGraph);
            if (block == null)
            {
                // The end of THIS branch, not of the track: whatever is queued is still owed.
                return EndBranch();
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
            // It waits on blocks that have FINISHED, not on blocks that have been reached.
            // Reaching was the old rule and it made the property nearly inert: a join is normally
            // drawn onto blocks dispatched a fraction of a millisecond earlier, so the wait lifted
            // in the very tick it was registered and the joining line spoke over the one it had
            // been told to wait for. MIGRATION-V2.md records the decision.
            var waitBlocks = Natives.WaitForBlocks(block);
            if (waitBlocks != null && waitBlocks.Count > 0 && !AllCompleted(waitBlocks))
            {
                _pendingStep = Step.Process(block, entryPort);
                _host.RegisterWaitForBlocks(this, waitBlocks);

                // Parking may be exactly what leaves the scene with nothing able to move. That used
                // to be noticed only when a track ENDED, so when the last track able to move PARKED
                // instead — a single flow waiting on a block of a branch it did not take — the scene
                // stayed open for good: no OnSceneExit, the handle in the engine's registry,
                // IsRunning() true.
                var deadlock = _host.TrackParked();
                if (deadlock != null) throw deadlock;
                return null;
            }

            if (!_host.RunValidation(block, entryPort, _previousBlock, _previousCharacter))
            {
                // A refusal is a dead end like any other, so it ENDS this track.
                //
                // There is no API to resume a refused track — no goto, no retry, and Start()
                // refuses a running scene. Returning silently left the track alive and idle for
                // good: on the main flow that was the whole scene hung open, with no OnSceneExit,
                // the handle still in the engine's registry and IsRunning() answering true
                // forever; on a parallel branch it was a phantom track GetActiveTracks() kept
                // counting.
                //
                // Every other dead end here already does it: a NOTE loop, a port with no wire, a
                // missing target.
                var refused = EndFlow(SceneEndReason.Invalidated);
                if (refused != null) throw refused;
                return null;
            }

            _currentBlock = block;
            _host.AddVisited(block.Id);

            var registry = _host.GetGlobalRegistry();
            if (registry.BeforeBlockHandler == null) return Step.Execute(block, entryPort);

            // GUARDED like Next(): a delay timer that fires twice would otherwise dispatch the same
            // block twice — the handler runs again, cleanups pile up, and the track advances from a
            // block it already left.
            //
            // And DEFERRED like Next(): a Resolve() called while OnBeforeBlock is still running only
            // raises a flag, and the block is dispatched once OnBeforeBlock has returned. Dispatching
            // it on the spot ran the whole rest of the walk INSIDE the game's callback — a frame per
            // block that nothing ever gave back — and ran the type handler before the lines the game
            // had written after its Resolve().
            var resolvedOnce = false;
            var inside = true;
            var resolvedInside = false;
            registry.BeforeBlockHandler(new BeforeBlockArgs
            {
                Block = block,
                Scene = _host.AsSceneHandle(),
                Context = new BeforeBlockContext { NativeProperties = Natives.Of(block) },
                Resolve = () =>
                {
                    if (resolvedOnce) return;
                    _host.EnsureOwnerThread("Resolve()");
                    resolvedOnce = true;
                    if (inside)
                    {
                        resolvedInside = true;
                        return;
                    }
                    Run(Step.Execute(block, entryPort));
                }
            });
            inside = false;
            return resolvedInside ? Step.Execute(block, entryPort) : null;
        }

        /// <summary>
        /// Run the handlers for a block, then leave when the game says so.
        /// </summary>
        /// <remarks>Next() is guarded and deferred: called during the handler it only raises a
        /// flag, and the advance happens once both handlers have returned. Otherwise a scene
        /// handler calling Next() would move the flow on before the global handler ever ran.</remarks>
        /// <returns>The advance, when the game has already said so; null while it has not.</returns>
        private Step? ExecuteBlockHandler(BlueprintBlock block, string entryPort)
        {
            // Running and not just the scene's: a Resolve() kept in a closure and fired after this
            // track ended would otherwise restart it on a dead flow.
            if (!_running || !_host.IsSceneRunning()) return null;

            var resolved = HandlerResolver.ResolveHandler(
                block.Type, block.Id,
                _host.GetSceneRegistry(),
                _host.GetGlobalRegistry());

            var context = _host.CreateBlockContext(block, entryPort);
            if (context == null) return Step.Advance(block, null);

            // No handler → advance silently. Start() already refused a scene missing one.
            if (resolved.SceneHandler == null && resolved.GlobalHandler == null) return Step.Advance(block, context);

            var nextCalled = false;
            var syncPhase = true;
            Action? sceneCleanup = null;
            Action? globalCleanup = null;

            void next()
            {
                if (nextCalled) return;
                _host.EnsureOwnerThread("Next()");
                nextCalled = true;
                if (syncPhase) return;
                Run(Step.Advance(block, context));
            }

            // No try here any more. A handler that throws reaches Run(), which closes the scene
            // before re-throwing — the same boundary as every other callback of the game, instead
            // of a boundary of its own that the others did not have.
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

            var cleanup = Cleanups.Combine(sceneCleanup, globalCleanup);

            // The handler may have closed the flow from inside itself — scene.Cancel(),
            // engine.Stop(), anything that ends this track. Storing the cleanup then hung it on a
            // block nobody will ever leave again, and whatever it held — a panel, an audio voice —
            // was never released. The engine HAS left the block, so the cleanup runs now.
            if (!_running || !_host.IsSceneRunning())
            {
                var closed = Cleanups.Run(cleanup);
                if (closed != null) throw closed;
                return null;
            }

            // Stored BEFORE any advance runs, so leaving the block finds it.
            _previousCleanup = cleanup;

            syncPhase = false;
            return nextCalled ? Step.Advance(block, context) : null;
        }

        /// <summary>
        /// Leave a block: pick the outgoing links, open a track per parallel target, follow the rest.
        /// </summary>
        /// <remarks>A port may carry several wires, and each one's TARGET says how it is walked:
        /// IsAsync opens its own track and runs beside this one; anything else belongs to THIS
        /// track — the first becomes the continuation, the others queue up and are walked when the
        /// continuation runs out of graph.
        /// <para>That second line is what IsAsync used to be unable to say. Every wire but the
        /// first was detached whether the designer had ticked the box or not, so on a secondary
        /// wire the property was INERT. MIGRATION-V2.md records the whole decision.</para></remarks>
        /// <returns>The block this track goes on to, or null when it has ended.</returns>
        private Step? AdvanceToNextBlock(BlueprintBlock block, IBaseBlockContext? context)
        {
            if (!_running || !_host.IsSceneRunning()) return null;

            _previousBlock = block;
            _previousCharacter = context?.Character;

            var sceneGraph = _host.GetSceneGraph();
            var resolution = PortResolver.ResolvePort(new PortResolutionInput
            {
                Block = block,
                Links = sceneGraph.GetOutgoingLinks(block.Id),
                SelectedOptionId = (context as InternalChoiceContext)?.SelectedOptionId,
                ConditionPort = (context as InternalConditionContext)?.ConditionPort,
                RouterPorts = (context as InternalRouterContext)?.RouterPorts,
                ActionRejected = (context as InternalActionContext)?.ActionRejected,
                ActorPort = (context as InternalDialogContext)?.ActorPort,
            });

            Link? continuation = null;
            var detached = new List<Link>();
            var queued = new List<Link>();

            // Sorted first, acted on after. Opening a track runs its handler immediately, and a
            // handler may cancel the scene — so nothing here may depend on what a spawn changed.
            foreach (var link in resolution.Links)
            {
                var targetBlock = sceneGraph.GetBlock(link.To);
                // A wire to a block that is not in this scene: init() reports it as BROKEN_LINK,
                // and the traversal simply has nowhere to go.
                if (targetBlock == null) continue;

                if (Natives.IsAsync(targetBlock)) detached.Add(link);
                else if (continuation == null) continuation = link;
                else queued.Add(link);
            }

            // In front of what was already owed: this block's own siblings come before an
            // ancestor's.
            if (queued.Count > 0) _queue.InsertRange(0, queued);

            foreach (var link in detached)
            {
                var targetBlock = sceneGraph.GetBlock(link.To);
                if (targetBlock != null)
                {
                    _childTrackIds.Add(_host.SpawnTrack(targetBlock, Id, link.ToPort));
                }
            }

            // The block is now DONE, and this is the one place that says so.
            //
            // Its handler returned, its exit port is resolved and its cleanup has just run, so a
            // bubble is off the screen and an audio voice is stopped BEFORE anything waiting on
            // this block is allowed to speak. Marking it any earlier would let the joining line
            // play over the one it was told to wait for.
            //
            // The cleanup runs here rather than inside EndBranch for the same reason; EndBranch
            // calls it again and finds nothing, which is what makes that safe.
            //
            // A cleanup that throws is a fault like a handler that throws: Run() closes the scene,
            // then surfaces it.
            var cleanupFault = RunBlockCleanup();
            if (cleanupFault != null) throw cleanupFault;

            _host.AddCompleted(block.Id);

            // Releasing a parked track re-enters the traversal immediately, and a handler there is
            // allowed to cancel the scene, so the guard is re-read rather than assumed.
            if (!_running || !_host.IsSceneRunning()) return null;

            if (continuation != null)
            {
                var nextBlock = sceneGraph.GetBlock(continuation.To);
                if (nextBlock != null) return Step.Process(nextBlock, continuation.ToPort);
            }

            return EndBranch();
        }

        /// <summary>This branch has nowhere left to go — hand over to the queue, or stop.</summary>
        /// <remarks>The block's cleanup runs FIRST, before the next wire is picked up: leaving a
        /// block is leaving a block, whether the track carries on or not. Hanging on to it until
        /// the queue emptied would keep a panel open, or an audio voice alive, through everything
        /// that came after it.</remarks>
        private Step? EndBranch()
        {
            var cleanupFault = RunBlockCleanup();
            if (cleanupFault != null) throw cleanupFault;

            var sceneGraph = _host.GetSceneGraph();
            while (_queue.Count > 0)
            {
                var link = _queue[0];
                _queue.RemoveAt(0);
                var target = sceneGraph.GetBlock(link.To);
                if (target == null) continue;
                return Step.Process(target, link.ToPort);
            }

            var retired = Retire(SceneEndReason.Completed);
            if (retired != null) throw retired;
            return null;
        }

        /// <summary>Run the cleanup of the block this track is leaving, once, carrying what it
        /// threw.</summary>
        private Exception? RunBlockCleanup()
        {
            var cleanup = _previousCleanup;
            _previousCleanup = null;
            return Cleanups.Run(cleanup);
        }

        /// <summary>Stop this track for good, DROPPING whatever it still owed.</summary>
        /// <remarks>For OnValidateNextBlock refusing a block — the guide has always read
        /// OnInvalidateBlock as "the scene stops" — so the queue goes with it. Playing the next wire
        /// after the game refused this one would be answering a no with "then try that". A handler
        /// or a cleanup that throws no longer comes here: that closes the whole scene, in
        /// Run().</remarks>
        private Exception? EndFlow(string ending)
        {
            var fault = RunBlockCleanup();
            return fault ?? Retire(ending);
        }

        /// <summary>The track is done. Its cleanup has already run; the scene decides what its
        /// ending means.</summary>
        /// <remarks>Child tracks SURVIVE: they live independently in the pool, and only an
        /// explicit Cancel() cascades to them.</remarks>
        private Exception? Retire(string ending)
        {
            _running = false;
            _currentBlock = null;
            _pendingStep = null;
            _queue.Clear();

            return _host.TrackEnded(this, ending);
        }

        private bool AllCompleted(List<string> blockIds)
        {
            foreach (var id in blockIds)
            {
                if (!_host.IsCompleted(id)) return false;
            }
            return true;
        }

        private static bool GetGlobalPrevented(IBaseBlockContext context)
        {
            return context is InternalBlockContext internalContext && internalContext.GlobalPrevented;
        }
    }
}

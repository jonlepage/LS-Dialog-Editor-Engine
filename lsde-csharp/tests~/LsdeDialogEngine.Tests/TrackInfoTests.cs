// LSDE Dialog Engine — TrackInfo and the cancel cascade (C# port of the "TrackInfo" and
// "cancel cascade" suites of multitrack.test.ts)
//
// GetTrackInfos() and GetActiveTracks() expose the PARALLEL tracks, for debug and rendering. The
// main flow, id 0, is not one of them. Track ids count up from 1 and never repeat within a scene;
// ParentTrackId is null when the main flow opened the track.
//
// Child tracks SURVIVE the natural end of their parent: only an explicit Cancel() cascades.

using System.Collections.Generic;
using Xunit;

namespace LsdeDialogEngine.Tests
{
    public class TrackInfoTests
    {
        /// <summary>A scene whose dialog handler holds every block in <paramref name="held"/>
        /// open — it never calls Next() — and advances the rest at once.</summary>
        private static (DialogueEngine engine, List<string> cleaned) Engine(BlueprintExport data, params string[] held)
        {
            var cleaned = new List<string>();
            var holding = new HashSet<string>(held);
            var engine = new DialogueEngine();
            Assert.Empty(engine.Init(new InitOptions { Data = data }).Errors);
            engine.OnChoice(args => { args.Next(); });
            engine.OnCondition(args => { args.Next(); });
            engine.OnAction(args => { args.Next(); });
            engine.OnDialog(args =>
            {
                var id = args.Block.Id;
                if (!holding.Contains(id)) args.Next();
                return () => cleaned.Add(id);
            });
            return (engine, cleaned);
        }

        [Fact]
        public void GetTrackInfosReturnsCorrectDataForRunningTracks()
        {
            var (engine, _) = Engine(Build.OneScene(
                Build.Dialog("FORK").Wire("MAIN").Wire("SIDE"),
                Build.Dialog("MAIN"),
                Build.Dialog("SIDE").Prop("isAsync", true)), "MAIN", "SIDE");

            var handle = engine.Scene("s1");
            handle.Start();

            var infos = handle.GetTrackInfos();
            Assert.Single(infos);
            Assert.Equal(1, infos[0].Id);
            Assert.Null(infos[0].ParentTrackId);
            Assert.Equal("SIDE", infos[0].StartBlockId);
            Assert.Equal("SIDE", infos[0].CurrentBlockId);
            Assert.True(infos[0].Running);
        }

        [Fact]
        public void SubTrackParentTrackIdMatchesParentTrackId()
        {
            var (engine, _) = Engine(Build.OneScene(
                Build.Dialog("FORK").Wire("MAIN").Wire("SIDE"),
                Build.Dialog("MAIN"),
                Build.Dialog("SIDE").Prop("isAsync", true).Wire("SUB"),
                Build.Dialog("SUB").Prop("isAsync", true)), "MAIN", "SUB");

            var handle = engine.Scene("s1");
            handle.Start();

            // SIDE opened SUB and then ran out of graph, so SUB is the one still running — and it
            // names SIDE's id (1) as its parent, not the main flow.
            var infos = handle.GetTrackInfos();
            Assert.Single(infos);
            Assert.Equal(2, infos[0].Id);
            Assert.Equal(1, infos[0].ParentTrackId);
            Assert.Equal("SUB", infos[0].StartBlockId);
        }

        [Fact]
        public void AnEndedTrackDoesNotAppearInGetTrackInfos()
        {
            var (engine, _) = Engine(Build.OneScene(
                Build.Dialog("FORK").Wire("MAIN").Wire("SIDE"),
                Build.Dialog("MAIN"),
                Build.Dialog("SIDE").Prop("isAsync", true)), "MAIN");

            var handle = engine.Scene("s1");
            handle.Start();

            // SIDE answered at once and ended; MAIN is still holding the scene open.
            Assert.True(handle.IsRunning());
            Assert.Empty(handle.GetTrackInfos());
            Assert.Equal(0, handle.GetActiveTracks());
        }

        [Fact]
        public void ExplicitCancelCascadesToChildTracksButANaturalEndDoesNot()
        {
            var (engine, cleaned) = Engine(Build.OneScene(
                Build.Dialog("FORK").Wire("MAIN").Wire("SIDE"),
                Build.Dialog("MAIN"),
                Build.Dialog("SIDE").Prop("isAsync", true).Wire("SUB"),
                Build.Dialog("SUB").Prop("isAsync", true)), "MAIN", "SUB");

            var handle = engine.Scene("s1");
            handle.Start();

            // SIDE ended naturally after opening SUB: SUB survives.
            Assert.Equal(1, handle.GetActiveTracks());
            Assert.DoesNotContain("SUB", cleaned);

            // An explicit Cancel() tears everything down, SUB included.
            handle.Cancel();
            Assert.Equal(0, handle.GetActiveTracks());
            Assert.Contains("SUB", cleaned);
            Assert.Contains("MAIN", cleaned);
            Assert.False(handle.IsRunning());
        }
    }
}

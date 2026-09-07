// LSDE Dialog Engine — Playground (C# port of playground.ts)
//
// Loads a real LSDE v2 export and plays a scene. Read it as the shortest complete integration:
// init, a locale, the two resolvers, the four handlers. Everything the engine asks of a game is in
// here, and nothing else is needed.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using LsdeDialogEngine;
using LsdeDialogEngine.Json;

// ─── Load the payload ────────────────────────────────────────────────────────

string? blueprintPath = args.Length > 0 ? args[0] : null;

if (blueprintPath == null)
{
    var dir = AppContext.BaseDirectory;
    for (int i = 0; i < 10; i++)
    {
        var candidate = Path.Combine(
            dir, "mock", "blueprints", "Engine-Conformance-Scene.blueprints.json");
        if (File.Exists(candidate))
        {
            blueprintPath = candidate;
            break;
        }
        var parent = Directory.GetParent(dir);
        if (parent == null) break;
        dir = parent.FullName;
    }
}

if (blueprintPath == null || !File.Exists(blueprintPath))
{
    Console.WriteLine("Usage: MiniRuntime <blueprints.json>");
    return;
}

var blueprint = LsdeJson.Parse(File.ReadAllText(blueprintPath));

// ─── The game's state ────────────────────────────────────────────────────────
//
// A real game reads its own save here. What matters is the SHAPE of the answer: the engine hands
// over a test and expects true or false. It never reads a dictionary itself, never implements an
// operator, never knows what "credits" holds.

var gameState = new Dictionary<string, Dictionary<string, object>>
{
    ["switches"] = new Dictionary<string, object>
    {
        ["door_unlocked"] = true, ["oracle_awake"] = false, ["reactor_stable"] = false,
        ["met_vesk"] = true, ["alarm_armed"] = true,
    },
    ["variables"] = new Dictionary<string, object>
    {
        ["chapter"] = 3d, ["credits"] = 80d, ["trust_kael"] = 2d, ["alarm_level"] = 3d,
    },
    ["items"] = new Dictionary<string, object>
    {
        ["plasma_cell"] = 1d, ["keycard"] = 0d, ["ration"] = 2d,
    },
    ["flags"] = new Dictionary<string, object>
    {
        ["faction"] = "salvage", ["last_port"] = "reactor_deck", ["player_callsign"] = "Vane",
    },
};

bool ResolveCondition(ConditionTest test)
{
    if (!gameState.TryGetValue(test.Dict, out var entries)) return false;
    if (!entries.TryGetValue(test.Entry, out var actual)) return false;

    var expected = test.Value;

    switch (test.Op)
    {
        case ConditionOperator.Equals: return Equals(actual?.ToString(), expected?.ToString());
        case ConditionOperator.NotEquals: return !Equals(actual?.ToString(), expected?.ToString());
        case ConditionOperator.LessThan: return AsNumber(actual) < AsNumber(expected);
        case ConditionOperator.LessOrEqual: return AsNumber(actual) <= AsNumber(expected);
        case ConditionOperator.GreaterThan: return AsNumber(actual) > AsNumber(expected);
        case ConditionOperator.GreaterOrEqual: return AsNumber(actual) >= AsNumber(expected);
        default: return false;
    }
}

static double AsNumber(object? value)
{
    try { return value == null ? 0 : Convert.ToDouble(value); }
    catch { return 0; }
}

// ─── Init ────────────────────────────────────────────────────────────────────

var engine = new DialogueEngine();
var report = engine.Init(new InitOptions { Data = blueprint });

Console.WriteLine($"\n🔧 Init — {report.Errors.Count} errors, {report.Warnings.Count} warnings");
foreach (var e in report.Errors) Console.WriteLine($"   ⛔ {e.Code}: {e.Message}");
foreach (var w in report.Warnings) Console.WriteLine($"   ⚠️  {w.Code}: {w.Message}");
Console.WriteLine($"📊 scenes={report.Stats.SceneCount} blocks={report.Stats.BlockCount} "
                  + $"wires={report.Stats.ConnectionCount}");

if (report.Errors.Count > 0) return;

engine.SetLocale("fr");

// Which actor of the block is the one speaking. Actors is a CAST, and LSDE deliberately refuses to
// say whether its order means "who speaks" or "who is present" — so the game decides. Returning
// null is legitimate: it means nobody available can carry this line.
engine.OnResolveCharacter(actors => actors.Count > 0 ? actors[0] : null);

// The single game-state evaluator. It answers option visibility AND condition cases. Tests on the
// reserved "choice" dictionary never reach it — the engine answers those from its own history.
engine.OnResolveCondition(ResolveCondition);

// ─── The four handlers ───────────────────────────────────────────────────────

engine.OnDialog(args =>
{
    // The engine hands the RAW string over and never looks inside it. {{@a1}} and the like are the
    // game's own markers, in the game's own keys, filled by the game's own system.
    var line = LsdeUtils.GetLocalizedText(args.Block.Text);
    var who = args.Context.Actors.Count > 0
        ? string.Join(" + ", args.Context.Actors.Select(a => a.Name))
        : "—";
    var tone = args.Context.Emotion != null
        ? $" ({args.Context.Emotion.Name} {args.Context.Intensity})"
        : "";

    Console.WriteLine($"\n💬 {args.Block.Id}  [{who}]{tone}");
    Console.WriteLine($"   {line ?? "«no text in this export»"}");

    args.Next();
});

engine.OnChoice(args =>
{
    Console.WriteLine($"\n❓ {args.Block.Id}");

    // Every option comes tagged. Filtering is the game's call — greying a locked answer out is a
    // perfectly good use of the ones that are not visible.
    foreach (var option in args.Context.Options)
    {
        var text = LsdeUtils.GetLocalizedText(option.Text);
        Console.WriteLine($"   {(option.Visible == false ? "🔒" : "▸")} {option.Id}  {text}");
    }

    var picked = args.Context.Options.FirstOrDefault(o => o.Visible != false);
    if (picked == null)
    {
        Console.WriteLine("   (nothing to pick — the flow stops here)");
        args.Next();
        return;
    }

    Console.WriteLine($"   → picking {picked.Id}");
    args.Context.SelectChoice(picked.Id);
    args.Next();
});

engine.OnCondition(args =>
{
    // Optional: with a resolver installed the engine already picked the port. This is where a game
    // logs what matched, or overrides it with Context.Resolve("K2").
    var cases = string.Join(" ", args.Context.Cases.Select(c => $"{c.Port}={c.Result}"));
    var matched = args.Context.Cases.Where(c => c.Result == true).Select(c => c.Port).ToList();

    Console.WriteLine($"\n🔀 {args.Block.Id}  cases: {cases}");
    Console.WriteLine($"   matched: {(matched.Count > 0 ? string.Join(", ", matched) : "none → default")}");

    args.Next();
});

engine.OnAction(args =>
{
    Console.WriteLine($"\n⚙️  {args.Block.Id}");
    foreach (var call in args.Context.Calls)
    {
        // Fn is empty when the writer has not picked a function yet. That is a draft, not an error.
        var argList = string.Join(", ", call.Args.Select(kv => $"{kv.Key}={kv.Value}"));
        Console.WriteLine($"   {(string.IsNullOrEmpty(call.Fn) ? "«no function picked»" : call.Fn)}({argList})");
    }

    args.Context.Resolve();
    args.Next();
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

engine.OnSceneEnter(_ => Console.WriteLine("\n▶️  scene entered"));
engine.OnSceneExit(_ => Console.WriteLine("\n⏹️  scene exited"));

// ─── Play ────────────────────────────────────────────────────────────────────
//
// A scene opens by its path OR by the id that survives a rename. Store the id anywhere outside the
// payload — a Unity asset, a save file — because the path changes the day someone renames it.

var scenePath = blueprint.Scenes.Count > 0 ? blueprint.Scenes[0].Scene : null;
if (scenePath == null)
{
    Console.WriteLine("This export has no scene.");
    return;
}

var handle = engine.Scene(scenePath);
handle.Start();

Console.WriteLine($"\n📜 choice history: {handle.GetChoiceHistory().Count} block(s)");
Console.WriteLine($"🧭 visited {handle.GetVisitedBlocks().Count} blocks");
Console.WriteLine($"🔗 wires in the scene: {engine.GetSceneConnections(scenePath).Count}");

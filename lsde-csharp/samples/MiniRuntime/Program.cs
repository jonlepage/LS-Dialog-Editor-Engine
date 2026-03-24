// LSDE Dialog Engine — Playground (C# port of playground.ts)
// Loads a blueprint JSON, registers colorful console handlers, runs the first scene.

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

// ─── ANSI Color Helpers ──────────────────────────────────────────────────────

const string R = "\x1b[0m";
string Red(string s) => $"\x1b[31m{s}{R}";
string Green(string s) => $"\x1b[32m{s}{R}";
string Yellow(string s) => $"\x1b[33m{s}{R}";
string Blue(string s) => $"\x1b[34m{s}{R}";
string Magenta(string s) => $"\x1b[35m{s}{R}";
string Cyan(string s) => $"\x1b[36m{s}{R}";
string White(string s) => $"\x1b[37m{s}{R}";
string Dim(string s) => $"\x1b[2m{s}{R}";
string Bold(string s) => $"\x1b[1m{s}{R}";
string Gray(string s) => $"\x1b[90m{s}{R}";

string Label(BlueprintBlock block) => block.Label ?? block.Uuid[..Math.Min(8, block.Uuid.Length)];

// ─── JSON Options ────────────────────────────────────────────────────────────

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = { new JsonStringEnumConverter() },
};

// ─── Load Blueprint ──────────────────────────────────────────────────────────

string? blueprintPath = args.Length > 0 ? args[0] : null;

// If no argument, try to find blueprints/blueprint.json (same as TS playground)
if (blueprintPath == null)
{
    var dir = AppContext.BaseDirectory;
    for (int i = 0; i < 8; i++)
    {
        var candidate = Path.Combine(dir, "blueprints", "blueprint.json");
        if (File.Exists(candidate))
        {
            blueprintPath = candidate;
            break;
        }
        var parent = Directory.GetParent(dir);
        if (parent == null)
            break;
        dir = parent.FullName;
    }
}

if (blueprintPath == null || !File.Exists(blueprintPath))
{
    Console.WriteLine("Usage: npm run playground -- <blueprint.json>");
    Console.WriteLine("  Without arguments, auto-loads test-cases.json from the tests/ directory.");
    return;
}

var raw = File.ReadAllText(blueprintPath);
var blueprint = JsonSerializer.Deserialize<BlueprintExport>(raw, jsonOptions);

if (blueprint == null)
{
    Console.WriteLine(Red("ERROR: Failed to deserialize blueprint."));
    return;
}

Console.WriteLine(Dim($"Loaded: {Path.GetFileName(blueprintPath)}"));

// ─── Init Engine ─────────────────────────────────────────────────────────────

var engine = new DialogueEngine();
var report = engine.Init(new InitOptions { Data = blueprint });

Console.WriteLine(
    $"{Bold(Cyan("Init"))} Errors: {(report.Errors.Count == 0 ? Green("0") : Red(report.Errors.Count.ToString()))}"
);
Console.WriteLine(
    Dim(
        $"     Stats: {report.Stats.SceneCount} scenes, {report.Stats.BlockCount} blocks, {report.Stats.ConnectionCount} connections"
    )
);

if (report.Errors.Count > 0)
{
    foreach (var e in report.Errors)
        Console.WriteLine(Red($"  [{e.Code}] {e.Message}"));
    return;
}
if (report.Warnings.Count > 0)
{
    foreach (var w in report.Warnings)
        Console.WriteLine(Yellow($"  [{w.Code}] {w.Message}"));
}

var locale = blueprint.PrimaryLanguage ?? "en";
engine.SetLocale(locale);

// ─── StateBridge ─────────────────────────────────────────────────────────────

engine.SetStateBridge(new PlaygroundStateBridge(Gray));

// ─── Handlers ────────────────────────────────────────────────────────────────

engine.OnBeforeBlock(beforeArgs =>
{
    var delay = beforeArgs.Block.NativeProperties?.Delay;
    if (delay.HasValue)
        Console.WriteLine(Gray($"       [before] {Label(beforeArgs.Block)} delay={delay}s"));
    beforeArgs.Resolve();
});

int choiceCount = 0;

engine.OnDialog(dialogArgs =>
{
    var block = dialogArgs.Block;
    var ctx = dialogArgs.Context;
    var ch = ctx.Character;
    var charStr =
        ch != null ? $"{Magenta(ch.Name)} {Dim($"({ch.Emotion ?? "?"})")}" : Dim("(no character)");
    var text =
        block.DialogueText != null && block.DialogueText.ContainsKey(locale)
            ? block.DialogueText[locale]
            : block.Content ?? "—";
    var flags = new List<string>();
    if (block.NativeProperties?.PortPerCharacter == true)
        flags.Add("portPerCharacter");
    if (block.NativeProperties?.IsAsync == true)
        flags.Add("async");
    if (block.NativeProperties?.Debug == true)
        flags.Add("debug");
    var flagStr = flags.Count > 0 ? Yellow($"[{string.Join(", ", flags)}]") : "";

    Console.WriteLine($"\n  {Bold(Blue("DIALOG"))} {Cyan(Label(block))} {flagStr}");
    Console.WriteLine($"         {charStr}");
    Console.WriteLine($"         {White($"\"{text}\"")}");

    if (block.NativeProperties?.PortPerCharacter == true && ch != null)
    {
        Console.WriteLine(Dim($"         -> resolveCharacterPort: {ch.Name}"));
        ctx.ResolveCharacterPort(ch.Name);
    }
    dialogArgs.Next();

    return () => Console.WriteLine(Gray($"       [cleanup] {Label(block)}"));
});

engine.OnChoice(choiceArgs =>
{
    var block = choiceArgs.Block;
    var ctx = choiceArgs.Context;
    choiceCount++;
    Console.WriteLine(
        $"\n  {Bold(Yellow("CHOICE"))} {Cyan(Label(block))} {ctx.Choices.Count} visible:"
    );
    foreach (var c in ctx.Choices)
    {
        var choiceLabel = c.Label ?? c.Uuid[..Math.Min(8, c.Uuid.Length)];
        var choiceText =
            c.DialogueText != null && c.DialogueText.ContainsKey(locale)
                ? c.DialogueText[locale]
                : "—";
        Console.WriteLine($"         {Yellow(">")} {choiceLabel}: {White($"\"{choiceText}\"")}");
    }
    // Pick choice[1] on 2nd visit to avoid infinite loop, else choice[0]
    var pick = ctx.Choices.Count > 1 && choiceCount > 1 ? ctx.Choices[1] : ctx.Choices[0];
    Console.WriteLine(
        Dim($"         -> selecting: {pick.Label ?? pick.Uuid[..Math.Min(8, pick.Uuid.Length)]}")
    );
    ctx.SelectChoice(pick.Uuid);
    choiceArgs.Next();
    return null;
});

engine.OnCondition(condArgs =>
{
    var block = condArgs.Block;
    var conds = block.Conditions ?? new List<ExportCondition>();
    var result = conds.Count > 0;
    Console.WriteLine(
        $"\n  {Bold(Magenta("CONDITION"))} {Cyan(Label(block))} {conds.Count} conditions -> {(result ? Green("true") : Red("false"))}"
    );
    condArgs.Context.Resolve(result);
    condArgs.Next();
    return null;
});

engine.OnAction(actionArgs =>
{
    var block = actionArgs.Block;
    var actions = block.Actions ?? new List<ExportAction>();
    Console.WriteLine($"\n  {Bold(Green("ACTION"))} {Cyan(Label(block))} {actions.Count} actions");
    foreach (var a in actions)
        Console.WriteLine($"         {Green(">")} {a.ActionId}({string.Join(", ", a.Params)})");
    actionArgs.Context.Resolve();
    actionArgs.Next();
    return () => Console.WriteLine(Gray($"       [cleanup] {Label(block)}"));
});

engine.OnSceneEnter(_ => Console.WriteLine($"\n{Bold(Green("--- Scene Enter ---"))}"));

engine.OnSceneExit(_ => Console.WriteLine($"{Bold(Red("--- Scene Exit ---"))}\n"));

engine.OnValidateNextBlock(valArgs =>
{
    if (valArgs.FromBlock != null)
        Console.WriteLine(
            Gray($"       [validate] {Label(valArgs.FromBlock)} -> {Label(valArgs.NextBlock)}")
        );
    return ValidationResult.Ok();
});

engine.OnInvalidateBlock(invArgs =>
{
    Console.WriteLine(Red($"  INVALIDATED: {invArgs.Reason}"));
    invArgs.Scene.Cancel();
});

// ─── Launch ──────────────────────────────────────────────────────────────────

var sceneId = blueprint.Scenes.Count > 0 ? blueprint.Scenes[0].Uuid : null;
if (sceneId == null)
{
    Console.WriteLine("No scenes found.");
    return;
}

var sceneName = blueprint.Scenes[0].Label;
Console.WriteLine(
    Dim($"\nLaunching scene: {sceneName} ({sceneId[..Math.Min(12, sceneId.Length)]})")
);

var handle = engine.Scene(sceneId);
handle.Start();

// Visited summary
var visitedLabels = new List<string>();
foreach (var uuid in handle.GetVisitedBlocks())
{
    string? found = null;
    foreach (var scene in blueprint.Scenes)
    {
        foreach (var b in scene.Blocks)
        {
            if (b.Uuid == uuid)
            {
                found = b.Label ?? uuid[..Math.Min(8, uuid.Length)];
                break;
            }
        }
        if (found != null)
            break;
    }
    visitedLabels.Add(Cyan(found ?? uuid[..Math.Min(8, uuid.Length)]));
}
Console.WriteLine($"{Bold("Visited:")} {string.Join(", ", visitedLabels)}");
Console.WriteLine(
    $"{Bold("Engine:")} running={(!engine.IsRunning() ? Dim("false") : Green("true"))}"
);

// ─── Helper types ────────────────────────────────────────────────────────────

class PlaygroundStateBridge : IStateBridge
{
    private readonly Func<string, string> _gray;

    public PlaygroundStateBridge(Func<string, string> gray) => _gray = gray;

    public bool EvaluateCondition(ExportCondition condition)
    {
        Console.WriteLine(
            _gray(
                $"       [bridge] eval: {condition.Key} {condition.Operator} {condition.Value} -> true"
            )
        );
        return true;
    }

    public void ExecuteAction(ExportAction action, ActionSignature? signature)
    {
        Console.WriteLine(
            _gray(
                $"       [bridge] exec: {signature?.Label ?? action.ActionId}({string.Join(", ", action.Params)})"
            )
        );
    }

    public object ResolveDictionary(string groupLabel, string rowKey)
    {
        return $"{groupLabel}.{rowKey}";
    }
}

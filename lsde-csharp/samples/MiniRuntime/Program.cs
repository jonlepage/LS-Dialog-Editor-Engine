// LSDE Dialog Engine — Playground (C# port of playground.ts)
// Loads a blueprint JSON, registers the new handler-based API, runs the first scene.
// Mirrors the TS playground exactly for cross-language validation.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

// ─── JSON Options ────────────────────────────────────────────────────────────

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters =
    {
        new JsonStringEnumConverter(),
        new BlueprintBlockConverter(),
        new BlockPropertyValueConverter(),
    },
};

// ─── Load Blueprint ──────────────────────────────────────────────────────────

string? blueprintPath = args.Length > 0 ? args[0] : null;

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
    Console.WriteLine("Usage: MiniRuntime <blueprint.json>");
    return;
}

var raw = File.ReadAllText(blueprintPath);
var blueprint = JsonSerializer.Deserialize<BlueprintExport>(raw, jsonOptions);
if (blueprint == null)
{
    Console.WriteLine("ERROR: Failed to deserialize blueprint.");
    return;
}

// ─── Init ───────────────────────────────────────────────────────────────────

var engine = new DialogueEngine();
var report = engine.Init(new InitOptions { Data = blueprint });
var stats = report.Stats;

Console.WriteLine($"\n🔧 Init — {report.Errors.Count} errors, {report.Warnings.Count} warnings");
foreach (var w in report.Warnings)
    Console.WriteLine($"   ⚠️  {w.Code}: {w.Message}");
Console.WriteLine(
    $"📊 sceneCount={stats.SceneCount}, blockCount={stats.BlockCount}, connectionCount={stats.ConnectionCount}"
);

if (report.Errors.Count > 0)
{
    foreach (var e in report.Errors)
        Console.WriteLine($"   ❌ {e.Code}: {e.Message}");
    return;
}

// on peut changer les locales on the fly
engine.SetLocale("fr");

// on ajoute l'algorithme de résolution de personnage
engine.OnResolveCharacter(characters => characters.Count > 0 ? characters[0] : null);

// Unified condition resolver — evaluates game-state conditions for both choice visibility and condition blocks.
// choice: conditions are handled internally by the engine via choice history.
engine.OnResolveCondition(cond =>
{
    Console.WriteLine($"◽onResolveCondition: {cond.Key} {cond.Operator} {cond.Value}");
    var parts = cond.Key.Split('.');
    if (parts.Length == 2 && parts[0] == "VariableGlobal")
    {
        return parts[1] switch
        {
            "key1" => true,
            "key2" => false,
            _ => true,
        };
    }
    return true;
});

// ─── 4 Required Handlers ────────────────────────────────────────────────────

engine.OnDialog(args =>
{
    var block = (DialogBlock)args.Block;
    var ctx = args.Context;
    var character = ctx.Character;
    var text = LsdeUtils.GetLocalizedText(block.DialogueText);

    Console.WriteLine($"\n💬 DIALOG  {block.Label}");
    Console.WriteLine($"   🎭 {character?.Name} {character?.Id} [{character?.Emotion ?? ""}]");
    Console.WriteLine($"   📝 \"{text ?? "—"}\"");

    if (block.NativeProperties?.PortPerCharacter == true && character != null)
    {
        Console.WriteLine($"   🔀 resolveCharacterPort: {character.Uuid}");
        ctx.ResolveCharacterPort(character.Uuid);
    }
    args.Next();

    return () => Console.WriteLine($"   🧹 cleanup: {block.Label}");
});

engine.OnChoice(args =>
{
    var block = args.Block;
    var ctx = args.Context;
    var choices = ctx.Choices;

    // choices are tagged with .Visible by the engine (SetChoiceFilter installed above)
    var visible = choices.Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;
    // le moteur de jeux decidera quel visible choix est actif par default
    var active = visible.Count > 0 ? visible[0] : null;

    Console.WriteLine(
        $"\n❓ CHOICE  {block.Label} — {visible.Count}/{choices.Count} choices visible"
    );
    foreach (var choice in visible)
    {
        var text = LsdeUtils.GetLocalizedText(choice.DialogueText);
        var isActive = choice == active;
        var label = choice.Label ?? choice.Uuid[..Math.Min(8, choice.Uuid.Length)];
        Console.WriteLine($"   👉 {label}: \"{text ?? "—"}\"{(isActive ? " (active)" : "")}");
    }

    if (timeout.HasValue)
    {
        Console.WriteLine($"💌timeout: {timeout.Value}");
        // In a real game, we'd use a timer. For playground, just auto-select after logging.
        if (active != null)
        {
            var lbl = active.Label ?? active.Uuid[..Math.Min(8, active.Uuid.Length)];
            Console.WriteLine($"   ✅ selecting: {lbl}");
            ctx.SelectChoice(active.Uuid);
        }
        args.Next();
    }
    else
    {
        // si pas de timeout, on va utiliser un waitinput dans le game engine
        if (active != null)
        {
            var lbl = active.Label ?? active.Uuid[..Math.Min(8, active.Uuid.Length)];
            Console.WriteLine($"   ✅ selecting: {lbl}");
            ctx.SelectChoice(active.Uuid);
        }
        args.Next();
    }

    return () => Console.WriteLine($"   🧹 cleanup: {block.Label}");
});

engine.OnCondition(args =>
{
    var block = (ConditionBlock)args.Block;
    var conditionGroups = args.Context.ConditionGroups!;
    var isDispatcher = block.NativeProperties?.EnableDispatcher == true;

    foreach (var (g, i) in conditionGroups.Select((g, i) => (g, i)))
    foreach (var cond in g.Conditions)
        Console.WriteLine(
            $"   [case {i}] {g.PortIndex} key:{cond.Key} {cond.Operator} {cond.Value} → {g.Result}"
        );

    // Derive result from pre-evaluated groups
    var matched = conditionGroups.Where(c => c.Result == true).Select(c => c.PortIndex).ToList();
    object result = isDispatcher ? (object)matched : (object)(matched.Count > 0 ? matched[0] : -1);

    Console.WriteLine(
        $"\n🔀 CONDITION  {block.Label} — {conditionGroups.Count} groups{(isDispatcher ? " [DISPATCHER]" : "")} → {FormatResult(result)}"
    );
    args.Context.Resolve(result);
    args.Next();
    return null;
});

engine.OnAction(args =>
{
    var block = (ActionBlock)args.Block;
    var actions = block.Actions ?? new List<ExportAction>();
    Console.WriteLine($"\n⚡ ACTION  {block.Label} — {actions.Count} actions");
    foreach (var a in actions)
        Console.WriteLine($"   🎯 {a.ActionId}({string.Join(", ", a.Params)})");
    args.Context.Resolve();
    args.Next();

    return () => Console.WriteLine($"   🧹 cleanup: {block.Label}");
});

// ─── Optional Handlers ──────────────────────────────────────────────────────

engine.OnBeforeBlock(args =>
{
    var delay = args.Block.NativeProperties?.Delay;
    if (delay.HasValue)
        Console.WriteLine($"   ⏳ before: {args.Block.Label} delay={delay}s");
    args.Resolve();
});

engine.OnSceneEnter(args =>
    Console.WriteLine($"\n🟢 ━━━ Scene Enter ━━━  running={args.Scene.IsRunning()}")
);

engine.OnSceneExit(_ => Console.WriteLine("🔴 ━━━ Scene Exit ━━━\n"));

engine.OnValidateNextBlock(args =>
{
    if (args.FromBlock != null)
        Console.WriteLine(
            $"   ✔️  validate: {args.FromBlock.Label} → {args.NextBlock.Label} (char: {args.NextContext?.Character?.Name ?? "none"})"
        );
    return ValidationResult.Ok();
});

engine.OnInvalidateBlock(args =>
{
    Console.WriteLine($"   ❌ INVALIDATED: {args.Reason}");
    args.Scene.Cancel();
});

// ─── Run ────────────────────────────────────────────────────────────────────

var sceneId = blueprint.Scenes.Count > 0 ? blueprint.Scenes[0].Uuid : "";
var sceneName = blueprint.Scenes.Count > 0 ? blueprint.Scenes[0].Label : sceneId;
Console.WriteLine($"\n🚀 Launching scene: {sceneName}");

var handle = engine.Scene(sceneId);
handle.Start();

// ─── Summary ────────────────────────────────────────────────────────────────

var visitedLabels = new List<string>();
foreach (var uuid in handle.GetVisitedBlocks())
{
    string? found = null;
    foreach (var scene in blueprint.Scenes)
    {
        var b = scene.Blocks.FirstOrDefault(bl => bl.Uuid == uuid);
        if (b != null)
        {
            found = b.Label ?? uuid[..Math.Min(8, uuid.Length)];
            break;
        }
    }
    visitedLabels.Add(found ?? uuid[..Math.Min(8, uuid.Length)]);
}
Console.WriteLine($"\n📋 Visited: {string.Join(", ", visitedLabels)}");

// Choice history
var historyEntries = new List<string>();
foreach (var kvp in handle.GetChoiceHistory())
    historyEntries.Add($"{kvp.Key}: [{string.Join(", ", kvp.Value)}]");
Console.WriteLine($"📊 Choice History: {{{string.Join(", ", historyEntries)}}}");
Console.WriteLine($"🏁 Engine running: {engine.IsRunning()}");

// ─── Helpers ────────────────────────────────────────────────────────────────

static string FormatResult(object result)
{
    if (result is List<int> list)
        return $"[{string.Join(",", list)}]";
    return result?.ToString() ?? "null";
}

// ─── JSON Converters ────────────────────────────────────────────────────────

class BlueprintBlockConverter : JsonConverter<BlueprintBlock>
{
    public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(BlueprintBlock);

    public override BlueprintBlock Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options
    )
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        if (!root.TryGetProperty("type", out var typeProp))
            throw new JsonException("BlueprintBlock missing 'type' field");
        var typeStr = typeProp.GetString();
        var json = root.GetRawText();
        return typeStr switch
        {
            "DIALOG" => JsonSerializer.Deserialize<DialogBlock>(json, options)!,
            "CHOICE" => JsonSerializer.Deserialize<ChoiceBlock>(json, options)!,
            "CONDITION" => JsonSerializer.Deserialize<ConditionBlock>(json, options)!,
            "ACTION" => JsonSerializer.Deserialize<ActionBlock>(json, options)!,
            "NOTE" => JsonSerializer.Deserialize<NoteBlock>(json, options)!,
            _ => throw new JsonException($"Unknown block type: {typeStr}"),
        };
    }

    public override void Write(
        Utf8JsonWriter writer,
        BlueprintBlock value,
        JsonSerializerOptions options
    ) => JsonSerializer.Serialize(writer, value, value.GetType(), options);
}

class BlockPropertyValueConverter : JsonConverter<object>
{
    public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(object);

    public override object? Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options
    )
    {
        return reader.TokenType switch
        {
            JsonTokenType.String => reader.GetString(),
            JsonTokenType.Number => reader.TryGetInt64(out var l)
                ? (object)(double)l
                : reader.GetDouble(),
            JsonTokenType.True => true,
            JsonTokenType.False => false,
            JsonTokenType.Null => null,
            _ => throw new JsonException($"Unexpected token {reader.TokenType}"),
        };
    }

    public override void Write(
        Utf8JsonWriter writer,
        object value,
        JsonSerializerOptions options
    ) => JsonSerializer.Serialize(writer, value, options);
}

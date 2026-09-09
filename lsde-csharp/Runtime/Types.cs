// LSDE Dialog Engine — Type definitions (C# port of types.ts)
// All classes, enums, interfaces, and delegates for the engine.

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    // ─── The payload contract ───────────────────────────────────────────────────
    //
    // These mirror the C# header LSDE generates beside its JSON, in the engine's own casing:
    // PascalCase properties fed by a camelCase naming policy (LsdeJson wires that up), which is
    // idiomatic C# and is exactly why the engine reads camelCase JSON only — a deserializer
    // already does that conversion, so renaming keys inside the payload would buy nothing and
    // would corrupt the three bags whose KEYS are the game's own data: Text, Props and Args.
    //
    // Block ids repeat between scenes. The counter restarts at 1 in every scene, so DIALOG-001
    // legitimately exists in two of them: a block is identified by the pair (scene, id).

    /// <summary>What a block is. Decides which optional fields it carries.</summary>
    public static class BlockType
    {
        /// <summary>A line spoken by a cast of actors. Exits by <c>out</c>.</summary>
        public const string Dialog = "dialog";
        /// <summary>A question. Each option exits by its own id — C1, C2…</summary>
        public const string Choice = "choice";
        /// <summary>A test on game state. Exits by <c>out</c>/<c>default</c>, or by K1… with portPerCase.</summary>
        public const string Condition = "condition";
        /// <summary>A dispatcher. Carries the SAME cases as a condition and reads them the opposite
        /// way: every case is evaluated, each true one launches its port, and the flow then always
        /// continues — by <c>then</c> when all of them held, by <c>catch</c> when any did not. A
        /// router with no case at all leaves by <c>then</c>, the way Promise.all([]) resolves.</summary>
        public const string Router = "router";
        /// <summary>A call into the game. Exits by <c>then</c>, or <c>catch</c> when a call failed.</summary>
        public const string Action = "action";
        /// <summary>A designer-only note. Never dispatched: the traversal steps over it.</summary>
        public const string Note = "note";
    }

    /// <summary>How a condition compares a dictionary entry to its value.</summary>
    public static class ConditionOperator
    {
        /// <summary>The entry equals the value.</summary>
        public new const string Equals = "equals";
        /// <summary>The entry differs from the value.</summary>
        public const string NotEquals = "notEquals";
        /// <summary>The entry is below the value.</summary>
        public const string LessThan = "lessThan";
        /// <summary>The entry is below the value, or equal to it.</summary>
        public const string LessOrEqual = "lessOrEqual";
        /// <summary>The entry is above the value.</summary>
        public const string GreaterThan = "greaterThan";
        /// <summary>The entry is above the value, or equal to it.</summary>
        public const string GreaterOrEqual = "greaterOrEqual";
    }

    /// <summary>How a comparison links to the one ABOVE it. The list is flat: precedence is yours.</summary>
    public static class ConditionJoin
    {
        /// <summary>Both this comparison and the one above it must hold.</summary>
        public const string And = "and";
        /// <summary>This comparison or the one above it must hold.</summary>
        public const string Or = "or";
    }

    /// <summary>What a function parameter accepts: a literal, or a key picked in a dictionary.</summary>
    public static class ValueType
    {
        /// <summary>A literal true or false.</summary>
        public const string Boolean = "boolean";
        /// <summary>A literal string.</summary>
        public const string String = "string";
        /// <summary>A literal number.</summary>
        public const string Number = "number";
        /// <summary>A key picked in one of the blueprint dictionaries, not a literal.</summary>
        public const string DictionaryKey = "dictionaryKey";
    }

    /// <summary>What a card is used for in the editor.</summary>
    public static class CardRole
    {
        /// <summary>The card has no assigned role.</summary>
        public const string None = "none";
        /// <summary>The card is an actor: what a block's <c>Actors</c> reference.</summary>
        public const string Characters = "characters";
        /// <summary>The card is an emotion: what a block's <c>Emotion</c> references.</summary>
        public const string Emotions = "emotions";
        /// <summary>The card is a place.</summary>
        public const string Places = "places";
    }

    /// <summary>The ports every runtime must know. Option, case and actor ports are named by the project.</summary>
    public static class Ports
    {
        /// <summary>The single entry port of every block.</summary>
        public const string In = "in";

        /// <summary>The default exit of a dialog, and the true exit of an if-style condition.</summary>
        public const string Out = "out";

        /// <summary>The nominal exit, on two block types: an action whose calls all succeeded, and a
        /// router whose cases were ALL true.</summary>
        public const string Then = "then";

        /// <summary>The exception exit, on the same two: an action where a call failed, and a router
        /// where at least one case was false. On a router it does NOT cancel anything — the tracks of
        /// the true cases are already running, exactly like a Promise.all that rejects.</summary>
        public const string Catch = "catch";

        /// <summary>The fallback exit of a condition block: no case matched.</summary>
        public const string Default = "default";

        /// <summary>NOT a port: the reserved ConditionTest.Dict that reads past answers of THIS scene.
        /// Entry is a CHOICE block id, Value an Option.Id of that block. The engine answers it from
        /// what it recorded while the scene played; no project dictionary may take this id.</summary>
        public const string Choice = "choice";
    }

    /// <summary>Which software wrote the file, to trace a delivered payload back to its version.</summary>
    public class Generator
    {
        /// <summary>Always LSDE.</summary>
        public string App { get; set; } = "";

        /// <summary>The software version, e.g. 2.0.3 — not the format version.</summary>
        public string Version { get; set; } = "";
    }

    /// <summary>A dictionary the game maintains, as declared in the project. Conditions cite it by id.</summary>
    public class DictionaryDefinition
    {
        /// <summary>The dictionary id, as ConditionTest.Dict cites it.</summary>
        public string Id { get; set; } = "";

        /// <summary>What its entries are compared to: boolean, string or number.</summary>
        public string ValueType { get; set; } = "";

        /// <summary>The entry keys, in declaration order.</summary>
        public List<string> Entries { get; set; } = new List<string>();
    }

    /// <summary>One parameter of an engine function.</summary>
    public class FunctionParameter
    {
        /// <summary>The argument name, as ActionCall.Args keys it.</summary>
        public string Name { get; set; } = "";

        /// <summary>What the argument holds.</summary>
        public string Type { get; set; } = "";

        /// <summary>Only when Type is dictionaryKey: where the value is picked.</summary>
        public string? Dictionary { get; set; }
    }

    /// <summary>A function the game implements, as ActionCall.Fn names it.</summary>
    public class FunctionDefinition
    {
        /// <summary>The function id.</summary>
        public string Id { get; set; } = "";

        /// <summary>Its parameters, in declaration order.</summary>
        public List<FunctionParameter> Params { get; set; } = new List<FunctionParameter>();
    }

    /// <summary>A card cited by blocks: the other end of Block.Actors and Block.Emotion.</summary>
    public class Card
    {
        /// <summary>The stable editor id (var3) that blocks reference.</summary>
        public string Id { get; set; } = "";

        /// <summary>The name the game gives this card, never the editor label.</summary>
        public string Name { get; set; } = "";

        /// <summary>What the card is used for: characters, emotions, places or none.</summary>
        public string Role { get; set; } = "";
    }

    /// <summary>An outgoing wire, seen from the block that carries it.</summary>
    public class Link
    {
        /// <summary>The exit port: a fixed port (see Ports), an option id, a case port or a card id.</summary>
        public string Port { get; set; } = "";

        /// <summary>The target block id, relative to the SAME scene. A wire never crosses one.</summary>
        public string To { get; set; } = "";

        /// <summary>The target's entry port, always "in" today.</summary>
        public string ToPort { get; set; } = "in";
    }

    /// <summary>A wire seen from OUTSIDE the block that carries it.
    /// <para>In the payload a wire is a Link listed in Block.Next, so it only knows where it goes.
    /// Graph inspection needs both ends, so the engine flattens every Next into this shape.
    /// Nothing in the file has it; it exists only in memory.</para></summary>
    public class BlueprintConnection
    {
        /// <summary>The id of the block this wire leaves, within its scene.</summary>
        public string From { get; set; } = "";

        /// <summary>The exit port it leaves by.</summary>
        public string Port { get; set; } = "";

        /// <summary>The block it goes to, in the same scene.</summary>
        public string To { get; set; } = "";

        /// <summary>The target's entry port.</summary>
        public string ToPort { get; set; } = "in";
    }

    /// <summary>What an action block asks the game to run.</summary>
    public class ActionCall
    {
        /// <summary>The function id. May be empty when the writer has not picked one yet.</summary>
        public string Fn { get; set; } = "";

        /// <summary>The arguments BY NAME, as declared in FunctionDefinition.Params.</summary>
        public Dictionary<string, object> Args { get; set; } = new Dictionary<string, object>();
    }

    /// <summary>One comparison: a dictionary entry against a value.
    /// <para>The reserved dict id "choice" is the exception — it reads the answers the player
    /// already gave IN THIS SCENE, which the engine tracks on its own.</para></summary>
    public class ConditionTest
    {
        /// <summary>The dictionary id. "choice" is reserved: see Ports.Choice.</summary>
        public string Dict { get; set; } = "";

        /// <summary>The entry read in that dictionary. With dict "choice", a CHOICE block id.</summary>
        public string Entry { get; set; } = "";

        /// <summary>The comparison. See ConditionOperator.</summary>
        public string Op { get; set; } = ConditionOperator.Equals;

        /// <summary>The right-hand side; its type follows the dictionary's ValueType.</summary>
        public object? Value { get; set; }

        /// <summary>Link with the comparison ABOVE. Absent on the first one; absent means AND.</summary>
        public string? Join { get; set; }
    }

    /// <summary>One case of a condition or a router block: the exit port, and what must hold for it.
    /// The data is identical on both; only the engine's reading differs — see BlockType.</summary>
    public class ConditionCase
    {
        /// <summary>The exit port of this case (K1…), or the block's Out when cases share one exit.</summary>
        public string Port { get; set; } = "";

        /// <summary>Absent = always true. Such a case makes every following case unreachable.</summary>
        public List<ConditionTest>? When { get; set; }
    }

    /// <summary>One answer of a choice block, a translated key in its own right.</summary>
    public class Option
    {
        /// <summary>The option id, which is ALSO its exit port (C1…).</summary>
        public string Id { get; set; } = "";

        /// <summary>The full i18n key of its text.</summary>
        public string Key { get; set; } = "";

        /// <summary>Its text by locale, when texts are exported inside the payload.</summary>
        public Dictionary<string, string>? Text { get; set; }

        /// <summary>Absent = always offered.</summary>
        public List<ConditionTest>? When { get; set; }
    }

    /// <summary>An option tagged with what OnResolveCondition said about its When.
    /// <para>The engine hands over EVERY option, tagged — never a shortened list. Filter with
    /// <c>options.Where(o =&gt; o.Visible != false)</c>, or keep the rest to show them locked.</para></summary>
    public class RuntimeChoiceItem : Option
    {
        /// <summary>true = offered, false = hidden, null = no resolver installed (treat as offered).</summary>
        public bool? Visible { get; set; }
    }

    /// <summary>A condition case with its pre-evaluated result.
    /// <para>The case carries its own exit port, so there is no index to map back to anything —
    /// that is the v1 shape and it is gone. Pass the Port to Resolve() to override the routing.</para></summary>
    public class RuntimeConditionCase
    {
        /// <summary>The exit port of this case: K1… with PortPerCase, otherwise the block's Out.</summary>
        public string Port { get; set; } = "";

        /// <summary>Its comparisons, chained left to right with no precedence. Absent = always true.</summary>
        public List<ConditionTest>? When { get; set; }

        /// <summary>true if the case holds, false if not, null if no resolver is installed.</summary>
        public bool? Result { get; set; }
    }

    /// <summary>The block properties the ENGINE acts on, read out of Block.Props.
    /// <para>In v2 there is no separate bag: natives and the writer's own properties share Props,
    /// keyed by bare id. Ids cannot collide — LSDE refuses a project property that takes a native
    /// name — so telling them apart is a lookup against NativePropertyIds, not a guess.</para>
    /// <para>Most are inert: Delay, Timeout, Debug, WaitInput, PortPerCharacter and
    /// SkipIfMissingActor are passed through untouched. Three are not: IsAsync spawns a parallel
    /// track, WaitForBlocks parks one until its blocks have FINISHED, and InPortPerCharacter makes
    /// the wire name the actor.</para>
    /// <para><b>Inert is not the same as free.</b> A writer who fills a field in expects a
    /// behaviour, and the doc on each property below says which one. Timeout is the one that is
    /// easy to implement backwards, so read it before wiring a timer.</para>
    /// <para><b>Delay and Timeout are MILLISECONDS in v2.</b> They were seconds in v1, and nothing
    /// reports the difference at runtime: a migrated project turns a 3-second pause into 3 ms.</para></summary>
    public class NativeProperties
    {
        /// <summary>Run this block on a parallel track instead of the main flow.</summary>
        public bool? IsAsync { get; set; }

        /// <summary>MILLISECONDS to wait before the block runs. Applied by OnBeforeBlock, not by the engine.</summary>
        public double? Delay { get; set; }

        /// <summary>MILLISECONDS the block STAYS once its line has been said — an auto-advance
        /// for blocks.
        /// <para><b>The countdown starts at the END of the reveal, not when the block is
        /// dispatched.</b> What the writer sets is how long the line remains on screen after its
        /// last character has been typed (or its last syllable spoken), and then the block leaves
        /// on its own. Counting from arrival instead cuts the line in half whenever the text takes
        /// longer to reveal than the timeout allows — a 2500 ms timeout on a 120-character line
        /// truncates it mid-sentence.</para>
        /// <para><b>It overrides WaitInput and it overrides leaving immediately.</b> All three say
        /// WHEN the block is left, and the one the writer put on the card is the most specific
        /// answer. So a click no longer dismisses the block: it may only HURRY the reveal to its
        /// end, which is what arms the countdown.</para>
        /// <para>Leaving the block is also what marks it FINISHED, so on a block listed in a
        /// WaitForBlocks elsewhere, this is the property that releases the join.</para>
        /// <para>The engine enforces none of it — no timers, no game loop. The game arms the
        /// countdown, and this is the behaviour the writer is owed when they fill the field.</para>
        /// </summary>
        public double? Timeout { get; set; }

        /// <summary>Wait for player input or a game signal instead of leaving on its own. Passed
        /// through, never interpreted — and outranked by Timeout, which says the block plays its
        /// own time and cannot be dismissed early.</summary>
        public bool? WaitInput { get; set; }

        /// <summary>Editor debug flag. Passed through.</summary>
        public bool? Debug { get; set; }

        /// <summary>One exit port per actor CARD ID, with Out as the fallback.</summary>
        public bool? PortPerCharacter { get; set; }

        /// <summary>One ENTRY port per actor CARD ID, "in" as the fallback — the mirror of
        /// PortPerCharacter.
        /// <para>The wire names the speaker: a link's ToPort carries the CARD ID of the actor the
        /// block is to be assigned to on that pass. This is what lets several wires reach one block
        /// and each stand for a different actor — a block alone cannot tell which path brought it.</para>
        /// <para>The engine still ASKS: OnResolveCharacter is handed that one actor rather than the
        /// whole cast, and a game that returns null says the character does not exist. Entering
        /// through "in" names nobody, and the callback gets the whole list as everywhere else.</para></summary>
        public bool? InPortPerCharacter { get; set; }

        /// <summary>Skip the block when its actor is absent at runtime. Passed through.</summary>
        public bool? SkipIfMissingActor { get; set; }

        /// <summary>Condition blocks: each case exits by its own port instead of sharing Out.</summary>
        public bool? PortPerCase { get; set; }

        /// <summary>Block ids OF THIS SCENE that must have FINISHED before this block STARTS.</summary>
        /// <remarks>The join half of the fork IsAsync opens: a branch runs in parallel, and a block
        /// downstream waits for it to be over before it plays.
        /// <para><b>Finished, not reached.</b> A listed block counts once the flow has LEFT it:
        /// the game called next(), the exit port was resolved, and the cleanup has run. So the
        /// bubble is off the screen before the joining line is dispatched. Being reached was the
        /// rule in the first v2 releases and it made the property nearly inert: a fork into two
        /// blocks, then a join on both, lifted in the very tick it was registered.</para>
        /// <para><b>The engine holds the block BEFORE dispatching it.</b> No handler is called, so
        /// the game never learns the block exists until the wait lifts — nothing of it can reach
        /// the screen early. That is the engine's decision and not a rendering choice a game could
        /// make differently: this is a NATIVE property, the designer ticks it in LSDE, and the
        /// engine owes them the behaviour.</para>
        /// <para>The rule is the same on every track, the one the player is watching included.</para>
        /// <para>ALL the listed blocks must have FINISHED, not just one. Finishing a block
        /// releases everything waiting on it, in turn. A block that never finishes parks its
        /// track for good — and a block waiting on player input forever never finishes. Init()
        /// reports UNKNOWN_WAIT_BLOCK when an id is not a block of the scene at all, but it cannot
        /// know whether a real one will ever be played. GetVisitedBlocks() is unaffected: it still
        /// lists what the player has been SHOWN.</para></remarks>
        public List<string>? WaitForBlocks { get; set; }
    }

    /// <summary>The ten ids of NativeProperties, to sort a Props bag into natives and the writer's
    /// own properties. Anything not in here belongs to the game.</summary>
    public static class NativePropertyIds
    {
        /// <summary>The ten ids LSDE reserves. Everything else in <c>Props</c> is the writer's own.</summary>
        public static readonly string[] All =
        {
            "isAsync", "delay", "timeout", "waitInput", "debug",
            "portPerCharacter", "inPortPerCharacter", "skipIfMissingActor", "portPerCase", "waitForBlocks",
        };

        /// <summary>Whether an id in <c>Props</c> is a native rather than one of the writer's properties.</summary>
        public static bool Contains(string id)
        {
            foreach (var known in All)
            {
                if (known == id) return true;
            }
            return false;
        }
    }

    /// <summary>A node of the graph. Type decides which optional fields are present.</summary>
    public class BlueprintBlock
    {
        /// <summary>Identity RELATIVE to its scene (DIALOG-002): what links and Scene.Start reference.</summary>
        public string Id { get; set; } = "";

        /// <summary>The full i18n key, as localization files carry it.</summary>
        public string Key { get; set; } = "";

        /// <summary>The readable name, when the writer wrote one. There is no mandatory block name.</summary>
        public string? Label { get; set; }

        /// <summary>Readable names above the block, root first. Empty ones are skipped.</summary>
        public List<string>? ParentLabels { get; set; }

        /// <summary>What the block is. See BlockType — lowercase in v2.</summary>
        public string Type { get; set; } = "";

        /// <summary>Card ids of who speaks. Resolve them through the export's Cards table.
        /// <para>The ORDER is significant, but its meaning does not belong to the engine: LSDE
        /// deliberately refuses to say whether it is "who speaks" or "who is present". The game
        /// decides, through OnResolveCharacter.</para></summary>
        public List<string>? Actors { get; set; }

        /// <summary>Card id of the emotion — the tone of the LINE, not of a speaker.</summary>
        public string? Emotion { get; set; }

        /// <summary>Only with Emotion.</summary>
        public double? Intensity { get; set; }

        /// <summary>The line by locale, dialogs only, when texts are exported inside the payload.
        /// <para>The engine never reads what is INSIDE this string. Markers like {{@a1}} are the
        /// game's own, in the game's own keys, filled by the game's own system.</para></summary>
        public Dictionary<string, string>? Text { get; set; }

        /// <summary>The body of a note block: never translated, only when notes are exported.</summary>
        public string? Body { get; set; }

        /// <summary>The team note on the block, only when notes are exported.</summary>
        public string? Note { get; set; }

        /// <summary>Properties SET on the block, native and project-declared alike, by bare id.</summary>
        public Dictionary<string, object>? Props { get; set; }

        /// <summary>Action blocks: what to run, in order.</summary>
        public List<ActionCall>? Calls { get; set; }

        /// <summary>Condition AND router blocks: the cases, in evaluation order.</summary>
        public List<ConditionCase>? Cases { get; set; }

        /// <summary>Choice blocks: the answers, in display order.</summary>
        public List<Option>? Options { get; set; }

        /// <summary>Outgoing wires. Absent when nothing leaves the block.</summary>
        public List<Link>? Next { get; set; }
    }

    /// <summary>One scene: its blocks, and where it starts.</summary>
    public class BlueprintScene
    {
        /// <summary>The scene path without the reserved namespace (acte1, chap1.acte1).</summary>
        public string Scene { get; set; } = "";

        /// <summary>The scene identity that SURVIVES A RENAME (sc_ then eight chars).
        /// <para>Scene is what a writer reads and what builds the i18n keys, but it changes the day
        /// someone renames the scene — so an asset that stored it stops resolving, silently, with
        /// no compiler to catch it. Store THIS one wherever a scene is referenced from outside the
        /// payload, and show Scene as its label.</para></summary>
        public string Id { get; set; } = "";

        /// <summary>The readable name of the scene, when written.</summary>
        public string? Label { get; set; }

        /// <summary>The entry block id. Absent = the scene has no entry and cannot play.</summary>
        public string? Start { get; set; }

        /// <summary>Every exported block of the scene.</summary>
        public List<BlueprintBlock> Blocks { get; set; } = new List<BlueprintBlock>();
    }

    /// <summary>The whole file. One scene per file or all of them: the only difference between
    /// the two split modes.</summary>
    public class BlueprintExport
    {
        /// <summary>Always "lsde-blueprints". Anything else is refused outright.</summary>
        public string Format { get; set; } = "";

        /// <summary>The FORMAT version. Bumps only when the payload contract changes.</summary>
        public int Version { get; set; }

        /// <summary>Which software wrote the file.</summary>
        public Generator? Generator { get; set; }

        /// <summary>ISO 8601 instant of the export.</summary>
        public string ExportedAt { get; set; } = "";

        /// <summary>The project name.</summary>
        public string Project { get; set; } = "";

        /// <summary>Every locale of the project.</summary>
        public List<string> Locales { get; set; } = new List<string>();

        /// <summary>The locale that is written first. Empty when the project declares none.</summary>
        public string ReferenceLocale { get; set; } = "";

        /// <summary>The declared vocabulary, whole, never trimmed to the exported scenes.</summary>
        public List<DictionaryDefinition> Dictionaries { get; set; } = new List<DictionaryDefinition>();

        /// <summary>The declared engine functions.</summary>
        public List<FunctionDefinition> Functions { get; set; } = new List<FunctionDefinition>();

        /// <summary>The cards that blocks may cite.</summary>
        public List<Card> Cards { get; set; } = new List<Card>();

        /// <summary>The scenes carried by this file.</summary>
        public List<BlueprintScene> Scenes { get; set; } = new List<BlueprintScene>();
    }

    /// <summary>A read-only snapshot of one parallel track, for debug and rendering.</summary>
    public class TrackInfo
    {
        /// <summary>Unique id of this track within the scene.</summary>
        public int Id { get; set; }

        /// <summary>Id of the track that spawned this one, or null when the main flow did.</summary>
        public int? ParentTrackId { get; set; }

        /// <summary>The block this track started on.</summary>
        public string StartBlockId { get; set; } = "";

        /// <summary>The block it is on now, or null when it has ended.</summary>
        public string? CurrentBlockId { get; set; }

        /// <summary>Whether it is still running.</summary>
        public bool Running { get; set; }
    }

    // ─── Engine Types ────────────────────────────────────────────────────────────

    /// <summary>Single diagnostic entry (error or warning).</summary>
    public class DiagnosticEntry
    {
        /// <summary>Machine-readable code, e.g. BROKEN_LINK or UNKNOWN_WAIT_BLOCK.
        /// <para>The seventeen the engine emits are listed in the Getting Started guide, split into
        /// the eleven that refuse the payload and the six that let it play. It is a string and not
        /// an enum on purpose: a runtime is allowed to add one — TypeScript and GDScript read the
        /// raw payload and can say WRONG_NAMING_CONVENTION, where this runtime only ever sees a
        /// typed object and reports INVALID_FORMAT for the same file.</para></summary>
        public string Code { get; set; } = "";

        /// <summary>Human-readable description of the issue.</summary>
        public string Message { get; set; } = "";

        /// <summary>Id of the scene where the issue was found, if applicable.</summary>
        public string? SceneId { get; set; }

        /// <summary>Id of the block where the issue was found, if applicable.</summary>
        public string? BlockId { get; set; }
    }

    /// <summary>Aggregate statistics from blueprint validation.</summary>
    public class DiagnosticStats
    {
        /// <summary>How many scenes the export holds.</summary>
        public int SceneCount { get; set; }
        /// <summary>How many blocks, across every scene.</summary>
        public int BlockCount { get; set; }
        /// <summary>How many wires, across every scene.</summary>
        public int ConnectionCount { get; set; }
    }

    /// <summary>Result of engine.Init() — validation report.</summary>
    public class DiagnosticReport
    {
        /// <summary>What makes the payload unusable. A non-empty list means the engine did not load it.</summary>
        public List<DiagnosticEntry> Errors { get; set; } = new List<DiagnosticEntry>();
        /// <summary>What loaded, but will probably surprise someone at runtime.</summary>
        public List<DiagnosticEntry> Warnings { get; set; } = new List<DiagnosticEntry>();
        /// <summary>What the payload contains, counted.</summary>
        public DiagnosticStats Stats { get; set; } = new DiagnosticStats();
    }

    /// <summary>Options for cross-validating blueprint data against game capabilities.
    /// When provided, the engine warns about references that don't match your game.</summary>
    public class CheckOptions
    {
        /// <summary>Function ids your game implements. A blueprint function outside this list warns.</summary>
        public List<string>? Functions { get; set; }

        /// <summary>Dictionary ids and their entry keys, as your game holds them.</summary>
        public Dictionary<string, List<string>>? Dictionaries { get; set; }

        /// <summary>Card NAMES your game knows — Card.Name, never the editor id (var1).</summary>
        public List<string>? Cards { get; set; }
    }

    /// <summary>Options passed to engine.Init().</summary>
    public class InitOptions
    {
        /// <summary>The blueprint data to load and validate.</summary>
        public BlueprintExport Data { get; set; } = new BlueprintExport();

        /// <summary>The several files of a per-scene export, instead of Data.
        /// <para>Each file of that mode is self-contained — it carries the whole header, so a scene
        /// loads and plays on its own. Pass the list and the engine stacks the scenes behind one
        /// header, after checking Project and ExportedAt match across the files.</para></summary>
        public List<BlueprintExport>? Files { get; set; }

        /// <summary>Optional cross-validation options.</summary>
        public CheckOptions? Check { get; set; }
    }

    /// <summary>Result of block validation.</summary>
    public class ValidationResult
    {
        /// <summary>Whether the block passed validation. When false, OnInvalidateBlock is called.</summary>
        public bool Valid { get; set; }

        /// <summary>Reason for validation failure.</summary>
        public string? Reason { get; set; }

        /// <summary>Let the flow enter the block.</summary>
        public static ValidationResult Ok() => new ValidationResult { Valid = true };

        /// <summary>Refuse the block: OnInvalidateBlock fires, and the track that was entering it ends.</summary>
        public static ValidationResult Fail(string reason) =>
            new ValidationResult { Valid = false, Reason = reason };
    }

    // ─── Context Types ───────────────────────────────────────────────────────────

    /// <summary>What every block handler gets, whatever the block type.</summary>
    public interface IBaseBlockContext
    {
        /// <summary>The actor OnResolveCharacter picked for this block, or null.
        /// <para>A block lists a CAST in Actors — card ids, in an order LSDE deliberately refuses
        /// to give a meaning to. The engine hands the whole list to OnResolveCharacter and keeps
        /// whatever comes back; it does not elect a first one, the way v1 did.</para></summary>
        Card? Character { get; }

        /// <summary>Every card the block cites, resolved through the export's Cards table, in file order.</summary>
        IReadOnlyList<Card> Actors { get; }

        /// <summary>The emotion of the BLOCK, resolved through Cards — the tone of the line, not of
        /// a speaker. In v1 each character carried its own, which meant writing the same feeling
        /// twice for two actors saying one sentence.</summary>
        Card? Emotion { get; }

        /// <summary>How strongly, when the writer set an emotion. Passed through untouched.</summary>
        double? Intensity { get; }

        /// <summary>Stop the global (Tier 1) handler from running after this scene handler.</summary>
        void PreventGlobalHandler();
    }

    /// <summary>What a DIALOG handler gets.</summary>
    public interface IDialogContext : IBaseBlockContext
    {
        /// <summary>With PortPerCharacter, name the actor whose port the flow should take.
        /// <para>Takes a CARD ID (var1) — the same id Block.Actors lists and the same one the port
        /// is named after. A card the block does not cite falls back to Out.</para></summary>
        void ResolveCharacterPort(string cardId);
    }

    /// <summary>What a CHOICE handler gets.</summary>
    public interface IChoiceContext : IBaseBlockContext
    {
        /// <summary>EVERY option of the block, tagged. Not a shortened list.
        /// <para>With OnResolveCondition installed each carries Visible = true/false; without one it
        /// is null — unknown, not hidden. Show the offered ones with
        /// <c>options.Where(o =&gt; o.Visible != false)</c>, or keep the rest to grey them out.</para></summary>
        IReadOnlyList<RuntimeChoiceItem> Options { get; }

        /// <summary>Pick an option by its id (C1). That id is also the port the flow leaves by.</summary>
        void SelectChoice(string optionId);
    }

    /// <summary>What a CONDITION handler gets.</summary>
    public interface IConditionContext : IBaseBlockContext
    {
        /// <summary>Override the exit port. Takes a PORT NAME: "out", "default", or a case port (K1).
        /// <para>v1 took bool | int | List&lt;int&gt; — three shapes for one method, the third being
        /// the dispatcher. Both are gone: a condition picks one path.</para></summary>
        void Resolve(string port);

        /// <summary>The block's cases, each with its port and its pre-evaluated Result.</summary>
        IReadOnlyList<RuntimeConditionCase> Cases { get; }
    }

    /// <summary>What a ROUTER handler gets.
    /// <para>The same pre-evaluated Cases as a condition, and <b>no Resolve</b>: a router's exits
    /// are a tally, not a choice. Every true case has already launched its port and the
    /// continuation is already picked — "then" when they all held, "catch" otherwise — by the time
    /// a handler could speak. There is nothing left to override, which is also why no handler is
    /// required for the type: the engine dispatches nothing and advances on its own. A game that
    /// wants to watch one router still can, through OnBlock(id).</para></summary>
    public interface IRouterContext : IBaseBlockContext
    {
        /// <summary>The block's cases, each with its port and its pre-evaluated Result. ALL of them ran.</summary>
        IReadOnlyList<RuntimeConditionCase> Cases { get; }
    }

    /// <summary>What an ACTION handler gets.</summary>
    public interface IActionContext : IBaseBlockContext
    {
        /// <summary>The calls the block asks the game to run, in order, with their arguments BY NAME.</summary>
        IReadOnlyList<ActionCall> Calls { get; }

        /// <summary>The calls went through. The flow leaves by "then".</summary>
        void Resolve();

        /// <summary>A call failed. The flow leaves by "catch", or by "then" when no error branch was drawn.</summary>
        /// <remarks>The error is OPTIONAL and the engine does nothing with it: routing only needs
        /// to know that the call failed. Pass one if it reads better next to your own logging —
        /// nothing here reads it, forwards it or logs it.</remarks>
        void Reject(object? error = null);
    }

    /// <summary>Context passed to OnBeforeBlock handler.</summary>
    public class BeforeBlockContext
    {
        /// <summary>Pointer to the block's native execution properties, or null if none.</summary>
        public NativeProperties? NativeProperties { get; set; }
    }

    /// <summary>Context passed to scene lifecycle handlers. Extensible — reserved for future scene-level data.</summary>
    public class SceneContext { }

    // ─── Handler Args & Delegates ────────────────────────────────────────────────

    /// <summary>Arguments passed to any block handler.
    /// <para>The engine uses a two-tier handler system:
    /// Tier 2 (scene) is called first, Tier 1 (global) after — unless PreventGlobalHandler() is called.
    /// A block-specific override via OnBlock(blockId) takes highest priority.</para></summary>
    public class BlockHandlerArgs<TBlock, TContext>
        where TBlock : BlueprintBlock
        where TContext : IBaseBlockContext
    {
        /// <summary>The scene handle that owns this block.</summary>
        public ISceneHandle Scene { get; }

        /// <summary>The block being executed.</summary>
        public TBlock Block { get; }

        /// <summary>Type-specific context providing actions for this block.</summary>
        public TContext Context { get; }

        /// <summary>Advance the flow to the next block. Must be called exactly once.</summary>
        public Action Next { get; }

        /// <summary>Built by the engine before a handler is called. Games never construct one.</summary>
        public BlockHandlerArgs(ISceneHandle scene, TBlock block, TContext context, Action next)
        {
            Scene = scene;
            Block = block;
            Context = context;
            Next = next;
        }

        /// <summary>Enables deconstruction: var (scene, block, context, next) = args;</summary>
        public void Deconstruct(
            out ISceneHandle scene,
            out TBlock block,
            out TContext context,
            out Action next
        )
        {
            scene = Scene;
            block = Block;
            context = Context;
            next = Next;
        }
    }

    /// <summary>Context attached to a block inside <see cref="ValidateNextBlockArgs"/>.
    /// The character is resolved by OnResolveCharacter before the validation handler is invoked.</summary>
    public class ValidateNextBlockContext
    {
        /// <summary>Character resolved for this block, or null if none.</summary>
        public Card? Character { get; set; }
    }

    /// <summary>Arguments for OnValidateNextBlock handler.
    /// Called before each block is executed. Provides the resolved character for both
    /// the upcoming block (NextContext) and the previously executed block (FromContext).</summary>
    public class ValidateNextBlockArgs
    {
        /// <summary>The block about to be executed.</summary>
        public BlueprintBlock NextBlock { get; set; } = null!;

        /// <summary>The block that was just executed (null for the first block).</summary>
        public BlueprintBlock? FromBlock { get; set; }

        /// <summary>Context for the upcoming block (character, etc.).</summary>
        public ValidateNextBlockContext NextContext { get; set; } = new ValidateNextBlockContext();

        /// <summary>Context for the previous block, or null if this is the first block.</summary>
        public ValidateNextBlockContext? FromContext { get; set; }

        /// <summary>The port that was followed to reach NextBlock (reserved for future use).</summary>
        public string? Port { get; set; }
    }

    /// <summary>Arguments for OnInvalidateBlock handler.</summary>
    public class InvalidateBlockArgs
    {
        /// <summary>The scene handle owning the invalidated block.</summary>
        public ISceneHandle Scene { get; set; } = null!;

        /// <summary>Reason for validation failure.</summary>
        public string Reason { get; set; } = "";
    }

    /// <summary>Arguments for OnBeforeBlock handler.</summary>
    public class BeforeBlockArgs
    {
        /// <summary>The block about to be executed.</summary>
        public BlueprintBlock Block { get; set; } = null!;

        /// <summary>The scene handle owning this block.</summary>
        public ISceneHandle Scene { get; set; } = null!;

        /// <summary>Context with native properties.</summary>
        public BeforeBlockContext Context { get; set; } = new BeforeBlockContext();

        /// <summary>Call Resolve() to continue execution. Must be called exactly once.</summary>
        public Action Resolve { get; set; } = null!;
    }

    /// <summary>Arguments for scene lifecycle handlers.</summary>
    public class SceneLifecycleArgs
    {
        /// <summary>The scene handle for the entering/exiting scene.</summary>
        public ISceneHandle Scene { get; set; } = null!;

        /// <summary>Scene-level context (extensible).</summary>
        public SceneContext Context { get; set; } = new SceneContext();
    }

    /// <summary>Block handler delegate. May return a cleanup function called when leaving the block.</summary>
    public delegate Action? BlockHandler<TBlock, TContext>(BlockHandlerArgs<TBlock, TContext> args)
        where TBlock : BlueprintBlock
        where TContext : IBaseBlockContext;

    /// <summary>Handler for block validation. Return Ok() to continue, Fail() to invalidate.</summary>
    public delegate ValidationResult ValidateNextBlockHandler(ValidateNextBlockArgs args);

    /// <summary>Handler called when a block fails validation.</summary>
    public delegate void InvalidateBlockHandler(InvalidateBlockArgs args);

    /// <summary>Handler called before every block. Must call Resolve() to continue.</summary>
    public delegate void BeforeBlockHandler(BeforeBlockArgs args);

    /// <summary>Handler for scene enter/exit events.</summary>
    public delegate void SceneLifecycleHandler(SceneLifecycleArgs args);

    // ─── SceneHandle Interface ──────────────────────────────────────────────────

    /// <summary>Public interface for controlling a running scene.
    /// <para>Obtain an ISceneHandle by calling engine.Scene(sceneRef). Register scene-specific
    /// (Tier 2) handlers, then call Start() to begin traversal from the entry block.</para>
    /// <para>Lifecycle: Start() → OnSceneEnter → blocks dispatched → scene ends → OnSceneExit.
    /// Scene-level handlers are called BEFORE global handlers. Both execute unless PreventGlobalHandler() is called.</para></summary>
    public interface ISceneHandle
    {
        /// <summary>Start the scene flow from the entry block. Throws when a type handler the scene needs is missing.
        /// <para>OnCondition is optional once OnResolveCondition is installed, and a ROUTER block needs no handler at all.</para></summary>
        void Start();

        /// <summary>Cancel the scene flow. All async tracks are cancelled, cleanup runs, OnSceneExit fires.</summary>
        void Cancel();

        /// <summary>Override the global OnSceneEnter for this scene.</summary>
        void OnEnter(SceneLifecycleHandler handler);

        /// <summary>Override the global OnSceneExit for this scene.</summary>
        void OnExit(SceneLifecycleHandler handler);

        /// <summary>Override a specific block by id. Takes highest priority over type handlers.</summary>
        void OnBlock(string blockId, BlockHandler<BlueprintBlock, IBaseBlockContext> handler);

        /// <summary>Override a specific DIALOG block by id (type-safe).</summary>
        void OnDialogId(string blockId, BlockHandler<BlueprintBlock, IDialogContext> handler);
        /// <summary>Override a specific CHOICE block by id (type-safe).</summary>
        void OnChoiceId(string blockId, BlockHandler<BlueprintBlock, IChoiceContext> handler);
        /// <summary>Override a specific CONDITION block by id (type-safe).</summary>
        void OnConditionId(string blockId, BlockHandler<BlueprintBlock, IConditionContext> handler);
        /// <summary>Override a specific ACTION block by id (type-safe).</summary>
        void OnActionId(string blockId, BlockHandler<BlueprintBlock, IActionContext> handler);

        /// <summary>Override all DIALOG blocks for this scene (Tier 2).</summary>
        void OnDialog(BlockHandler<BlueprintBlock, IDialogContext> handler);

        /// <summary>Override all CHOICE blocks for this scene (Tier 2).</summary>
        void OnChoice(BlockHandler<BlueprintBlock, IChoiceContext> handler);

        /// <summary>Override all CONDITION blocks for this scene (Tier 2).</summary>
        void OnCondition(BlockHandler<BlueprintBlock, IConditionContext> handler);

        /// <summary>Override all ACTION blocks for this scene (Tier 2).</summary>
        void OnAction(BlockHandler<BlueprintBlock, IActionContext> handler);

        /// <summary>Get the block currently being executed, or null if scene is not running.</summary>
        BlueprintBlock? GetCurrentBlock();

        /// <summary>Ids of every block visited so far, in order.</summary>
        IReadOnlyCollection<string> GetVisitedBlocks();

        /// <summary>Check if the scene flow is currently active.</summary>
        bool IsRunning();

        /// <summary>Get the number of async tracks currently running in parallel.</summary>
        int GetActiveTracks();

        /// <summary>Get detailed info for all currently running async tracks.</summary>
        IReadOnlyList<TrackInfo> GetTrackInfos();

        /// <summary>Get the full choice history. Keys are block ids, values are the option ids picked there.</summary>
        IReadOnlyDictionary<string, IReadOnlyList<string>> GetChoiceHistory();

        /// <summary>Get the choice(s) selected at a specific block. Null when that block was never reached.</summary>
        IReadOnlyList<string>? GetChoice(string blockId);

        /// <summary>Answer one comparison. A test on the reserved "choice" dictionary is answered
        /// from this scene's own history; anything else goes to the game's resolver, and is false
        /// when none is installed.</summary>
        bool EvaluateCondition(ConditionTest test);

        /// <summary>Override character resolution for this scene. Defaults to engine-level resolver.</summary>
        void OnResolveCharacter(Func<List<Card>, Card?> resolver);
    }

    // ─── Dialogue Engine Interface ─────────────────────────────────────────────

    /// <summary>Public contract for the LSDE dialogue engine.
    /// <para>Top-level entry point managing blueprint loading, global handler registration, and scene creation.</para></summary>
    public interface IDialogueEngine
    {
        /// <summary>Validate blueprint data, build internal graph, return diagnostic report.</summary>
        DiagnosticReport Init(InitOptions options);

        /// <summary>Set the active locale for text resolution. Validates against blueprint.Locales. Syncs LsdeUtils.Locale.</summary>
        void SetLocale(string locale);

        /// <summary>Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
        /// The engine handles choice: conditions internally via choice history — this callback evaluates game-state conditions only.</summary>
        void OnResolveCondition(Func<ConditionTest, bool> evaluator);

        /// <summary>Which actor of a block is the one speaking. Called for every block that cites
        /// actors; the whole cast is passed, in file order. Defaults to the first — because a
        /// default has to pick something, not because the format says the first one speaks.</summary>
        void OnResolveCharacter(Func<List<Card>, Card?> resolver);

        /// <summary>Register a handler called before each block to validate it.</summary>
        void OnValidateNextBlock(ValidateNextBlockHandler handler);

        /// <summary>Register a handler called when a block fails validation.</summary>
        void OnInvalidateBlock(InvalidateBlockHandler handler);

        /// <summary>Register a handler called before every block. Must call Resolve() to continue.</summary>
        void OnBeforeBlock(BeforeBlockHandler handler);

        /// <summary>Register a global handler for DIALOG blocks. May return a cleanup function.</summary>
        void OnDialog(BlockHandler<BlueprintBlock, IDialogContext> handler);

        /// <summary>Register a global handler for CHOICE blocks. Every option is handed over, tagged with Visible when OnResolveCondition is installed.</summary>
        void OnChoice(BlockHandler<BlueprintBlock, IChoiceContext> handler);

        /// <summary>Register a global handler for CONDITION blocks. Optional once OnResolveCondition
        /// is installed: the engine already knows the exit port, so this becomes a log or override hook.</summary>
        void OnCondition(BlockHandler<BlueprintBlock, IConditionContext> handler);

        /// <summary>Register a global handler for ACTION blocks. The developer MUST handle execution.</summary>
        void OnAction(BlockHandler<BlueprintBlock, IActionContext> handler);

        /// <summary>Register a handler called when any scene starts.</summary>
        void OnSceneEnter(SceneLifecycleHandler handler);

        /// <summary>Register a handler called when any scene ends (natural or cancelled).</summary>
        void OnSceneExit(SceneLifecycleHandler handler);

        /// <summary>Open a scene by its PATH (reactor_breach) or by the id that survives a rename
        /// (sc_u0vqg2g8). Does NOT start the flow — call handle.Start().
        /// <para>Take the id wherever the reference is stored outside the payload: a Unity asset, a
        /// save file, a database row. The path changes the day someone renames the scene.</para></summary>
        ISceneHandle Scene(string sceneRef);

        /// <summary>Stop all active scenes.</summary>
        void Stop();

        /// <summary>True if at least one scene is active.</summary>
        bool IsRunning();

        /// <summary>Get all currently active scene handles.</summary>
        List<ISceneHandle> GetActiveScenes();

        /// <summary>Get the current block of every active scene.</summary>
        List<BlueprintBlock> GetCurrentBlocks();

        /// <summary>Every wire INSIDE a scene, flattened so each carries the block it leaves.
        /// <para>Graph inspection only. It has never had anything to do with going from one scene
        /// to another: a wire has never crossed a scene in any version of the format.</para></summary>
        List<BlueprintConnection> GetSceneConnections(string sceneRef);
    }

    // ─── Port Resolution Types ──────────────────────────────────────────────────

    /// <summary>What ResolvePort needs to pick the wires to follow.</summary>
    public class PortResolutionInput
    {
        /// <summary>The block being left. Its Type picks the routing rule.</summary>
        public BlueprintBlock Block { get; set; } = new BlueprintBlock();

        /// <summary>The wires it carries — Block.Next, straight off the block.</summary>
        public List<Link> Links { get; set; } = new List<Link>();

        /// <summary>CHOICE only: the option the player picked. Its id IS its port (C1…).</summary>
        public string? SelectedOptionId { get; set; }

        /// <summary>CONDITION only: the port its cases picked — "out", "default", or K1….</summary>
        public string? ConditionPort { get; set; }

        /// <summary>ROUTER only: every port it leaves by, in order — the K* of each true case, then
        /// "then" or "catch" LAST.
        /// <para>A list and not one port, because a router does not pick an exit: it launches one
        /// per true case and continues besides. The continuation comes last so that the traversal,
        /// which keeps the first non-async target as the main flow, keeps then/catch when the case
        /// routes are async — which is the arrangement LSDE recommends.</para></summary>
        public List<string>? RouterPorts { get; set; }

        /// <summary>ACTION only: true when a call failed, so "catch" is tried before "then".</summary>
        public bool? ActionRejected { get; set; }

        /// <summary>DIALOG with PortPerCharacter: the CARD ID of the speaking actor, never an index.</summary>
        public string? ActorPort { get; set; }
    }

    /// <summary>The wires to follow. The traversal decides which is the main track.</summary>
    public class PortResolutionResult
    {
        /// <summary>The wires leaving the resolved port, in the order the block declares them.</summary>
        public List<Link> Links { get; }

        /// <summary>Wrap the wires a port resolved to.</summary>
        public PortResolutionResult(List<Link> links)
        {
            Links = links;
        }

        /// <summary>No wire leaves that port: a dead end, which ends the track.</summary>
        public static readonly PortResolutionResult None = new PortResolutionResult(new List<Link>());
    }
}

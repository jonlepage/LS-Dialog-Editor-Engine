// LSDE Dialog Engine — Init validation + diagnostic report (C# port of validator.ts)
//
// The first thing this file does is refuse a payload it cannot read.
//
// It did not, before. The engine opened whatever it was handed and went straight to work, so a
// file written by a different exporter version produced no error at all — it produced a scene that
// stopped in the middle, silently, at the point where the flow needed a field that was not there.
// That is the worst failure a loader can have: the game ships, and the dialogue just ends early.
//
// So Format and Version are read before anything else, and a mismatch is fatal and named.

using System;
using System.Collections.Generic;
using System.Globalization;

namespace LsdeDialogEngine
{
    /// <summary>Turns a payload into the DiagnosticReport that Init() returns. Reads format and version first.</summary>
    public static class Validator
    {
        /// <summary>The only payload this engine reads. A file that says anything else is refused.</summary>
        private const string SupportedFormat = "lsde-blueprints";

        /// <summary>The format version this engine reads. Bumps only when the contract changes.</summary>
        private const int SupportedVersion = 1;

        /// <summary>What the header of the export declares, looked up by id — for the checks that
        /// read what the blocks USE.</summary>
        private sealed class Declared
        {
            internal readonly Dictionary<string, FunctionDefinition> Functions = new Dictionary<string, FunctionDefinition>();

            /// <summary>Dictionary id → its entry keys.</summary>
            internal readonly Dictionary<string, HashSet<string>> Dictionaries = new Dictionary<string, HashSet<string>>();

            internal Declared(BlueprintExport payload)
            {
                // A null id is skipped, not indexed. Newtonsoft and System.Text.Json both hand
                // "id": null over as null, a Dictionary refuses a null key — Init() threw
                // ArgumentNullException on it — and nothing can name what has no name.
                if (payload.Functions != null)
                {
                    foreach (var fn in payload.Functions)
                    {
                        if (fn.Id != null) Functions[fn.Id] = fn;
                    }
                }
                if (payload.Dictionaries != null)
                {
                    foreach (var dict in payload.Dictionaries)
                    {
                        if (dict.Id == null) continue;
                        Dictionaries[dict.Id] = new HashSet<string>(dict.Entries ?? new List<string>());
                    }
                }
            }
        }

        /// <summary>
        /// Fold the files of a per-scene export into one payload.
        /// <para>Each file carries the whole header, so the first supplies it and the rest only add
        /// scenes. Project and ExportedAt are checked first: they are identical across the files of
        /// one export and different across two, which is the only way to catch someone passing
        /// pieces of two exports. Merging those would produce a payload whose dictionaries do not
        /// match its scenes, and nothing downstream would notice.</para>
        /// <para>Returns null with an error when the files do not belong together.</para>
        /// </summary>
        public static BlueprintExport? MergePayloads(List<BlueprintExport> payloads, out DiagnosticEntry? error)
        {
            error = null;
            var first = payloads[0];

            for (int i = 1; i < payloads.Count; i++)
            {
                var next = payloads[i];
                if (next.Project != first.Project || next.ExportedAt != first.ExportedAt)
                {
                    error = new DiagnosticEntry
                    {
                        Code = "MISMATCHED_EXPORTS",
                        Message = $"These files are not from the same export: \"{first.Project}\" "
                                  + $"({first.ExportedAt}) and \"{next.Project}\" ({next.ExportedAt}). "
                                  + "Pass the files of one export at a time.",
                    };
                    return null;
                }
            }

            var merged = new BlueprintExport
            {
                Format = first.Format,
                Version = first.Version,
                Generator = first.Generator,
                ExportedAt = first.ExportedAt,
                Project = first.Project,
                Locales = first.Locales,
                ReferenceLocale = first.ReferenceLocale,
                Dictionaries = first.Dictionaries,
                Functions = first.Functions,
                Cards = first.Cards,
                Scenes = new List<BlueprintScene>(),
            };

            foreach (var payload in payloads)
            {
                if (payload.Scenes != null) merged.Scenes.AddRange(payload.Scenes);
            }

            return merged;
        }

        /// <summary>
        /// Validate a blueprint payload, and optionally cross-check it against what the game declares.
        /// <para>Structural checks: the format header, scene paths, block id uniqueness <b>within a
        /// scene</b>, the entry block, link targets, and the blocks a WaitForBlocks names. Always,
        /// too: what the blocks USE — the functions and arguments an action calls, the dictionaries
        /// and entries a condition tests — against what the export declares. With Check, also warns
        /// about functions, dictionaries and cards the game does not know.</para>
        /// <para>Errors mean the payload will not play correctly; warnings mean it will, but
        /// something looks wrong.</para>
        /// </summary>
        public static DiagnosticReport ValidateBlueprint(InitOptions options)
        {
            var errors = new List<DiagnosticEntry>();
            var warnings = new List<DiagnosticEntry>();
            var stats = new DiagnosticStats();

            DiagnosticReport Refuse() => new DiagnosticReport
            {
                Errors = errors, Warnings = warnings, Stats = stats,
            };

            // ─── The header, before anything else ────────────────────────

            var files = options.Files;
            BlueprintExport? payload;

            if (files != null)
            {
                if (files.Count == 0)
                {
                    errors.Add(new DiagnosticEntry { Code = "MISSING_DATA", Message = "Blueprint data is required." });
                    return Refuse();
                }

                // A per-scene export arrives as several self-contained files. Fold them before
                // validating, so no rule below has to know about split modes.
                payload = MergePayloads(files, out var mergeError);
                if (mergeError != null)
                {
                    errors.Add(mergeError);
                    return Refuse();
                }
            }
            else
            {
                payload = options.Data;
            }

            if (payload == null)
            {
                errors.Add(new DiagnosticEntry { Code = "MISSING_DATA", Message = "Blueprint data is required." });
                return Refuse();
            }

            if (payload.Format != SupportedFormat)
            {
                // No naming-convention check here, unlike TypeScript and GDScript: those two
                // are handed the raw payload and can spot an `exported_at` key. This runtime
                // validates a typed object the game already deserialized, so the original key
                // names are gone. The file is refused either way — WRONG_NAMING_CONVENTION is a
                // better message, not a different verdict.
                errors.Add(new DiagnosticEntry
                {
                    Code = "INVALID_FORMAT",
                    Message = $"Not an LSDE blueprint: expected format \"{SupportedFormat}\", "
                              + $"got {Describe(payload.Format)}.",
                });
                return Refuse();
            }

            if (payload.Version != SupportedVersion)
            {
                errors.Add(new DiagnosticEntry
                {
                    Code = "UNSUPPORTED_FORMAT_VERSION",
                    Message = $"This engine reads blueprint format version {SupportedVersion}, "
                              + $"the file is version {payload.Version}. "
                              + "Re-export from LSDE, or install the engine version that matches it.",
                });
                return Refuse();
            }

            // ─── Scenes ──────────────────────────────────────────────────

            if (payload.Scenes == null || payload.Scenes.Count == 0)
            {
                errors.Add(new DiagnosticEntry { Code = "NO_SCENES", Message = "Blueprint must contain at least one scene." });
                return Refuse();
            }

            var declared = new Declared(payload);
            var scenePaths = new HashSet<string>();
            // Stable id → the path of the first scene that carried it.
            var sceneIds = new Dictionary<string, string>();
            int totalBlocks = 0;
            int totalConnections = 0;

            foreach (var scene in payload.Scenes)
            {
                if (!scenePaths.Add(scene.Scene))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "DUPLICATE_SCENE",
                        Message = $"Scene \"{scene.Scene}\" appears more than once. "
                                  + "When loading a per-scene export, pass each file exactly once.",
                        SceneId = scene.Id,
                        ScenePath = scene.Scene,
                    });
                }
                else if (!string.IsNullOrEmpty(scene.Id) && sceneIds.TryGetValue(scene.Id, out var firstPath))
                {
                    // Two paths, one stable id: a scene file copied and renamed by hand. It used to load,
                    // and a lookup by that id opened whichever of the two came last, without a word. The
                    // same scene passed twice repeats its path as well, and is reported once, just above.
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "DUPLICATE_SCENE",
                        Message = $"Scenes \"{firstPath}\" and \"{scene.Scene}\" share the stable id \"{scene.Id}\", "
                                  + "so a lookup by that id cannot tell them apart.",
                        SceneId = scene.Id,
                        ScenePath = scene.Scene,
                    });
                }
                if (!string.IsNullOrEmpty(scene.Id) && !sceneIds.ContainsKey(scene.Id)) sceneIds[scene.Id] = scene.Scene;

                ValidateScene(scene, declared, errors, warnings);
                var blocks = scene.Blocks ?? new List<BlueprintBlock>();
                totalBlocks += blocks.Count;
                foreach (var block in blocks)
                {
                    totalConnections += block.Next?.Count ?? 0;
                }
            }

            if (options.Check != null)
            {
                CrossValidate(payload, options.Check, warnings);
            }

            stats.SceneCount = payload.Scenes.Count;
            stats.BlockCount = totalBlocks;
            stats.ConnectionCount = totalConnections;

            return new DiagnosticReport { Errors = errors, Warnings = warnings, Stats = stats };
        }

        private static void ValidateScene(
            BlueprintScene scene,
            Declared declared,
            List<DiagnosticEntry> errors,
            List<DiagnosticEntry> warnings)
        {
            if (string.IsNullOrEmpty(scene.Scene))
            {
                // Named by its id: without a path, that is the one name left to find the scene by.
                errors.Add(new DiagnosticEntry { Code = "MISSING_SCENE_PATH", Message = "Scene is missing its path.", SceneId = scene.Id });
            }

            // A payload can carry a scene with no blocks at all - a truncated file, or a scene the
            // writer has not filled in yet. Normalised rather than reported: "absent" and "empty"
            // cannot be told apart here, since Blocks has an initializer, and a scene with no
            // blocks already reports NO_START_BLOCK. It cannot play, which is the thing worth
            // saying, and all four runtimes say it the same way.
            var blocks = scene.Blocks ?? new List<BlueprintBlock>();

            // A block id is unique inside its scene and nowhere else: the counter restarts at 1 in
            // every scene, so DIALOG-001 in two scenes is not a collision, it is the normal case.
            var blockIds = new HashSet<string>();
            var blocksById = new Dictionary<string, BlueprintBlock>();

            foreach (var block in blocks)
            {
                // Read once into a local: testing block.Id for null below made the compiler flag the
                // Add on the next pass of the loop (CS8604), though nothing there had changed.
                var id = block.Id;
                if (!blockIds.Add(id))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "DUPLICATE_BLOCK_ID",
                        Message = $"Duplicate block id \"{id}\" within scene \"{scene.Scene}\".",
                        SceneId = scene.Id,
                        ScenePath = scene.Scene,
                        BlockId = id,
                    });
                }
                // A Dictionary refuses a null key, and a block with no id cannot be the target of a
                // choice test anyway.
                if (id != null) blocksById[id] = block;
            }

            // The scene names its own entry, so there is no such thing as two start blocks.
            if (string.IsNullOrEmpty(scene.Start))
            {
                warnings.Add(new DiagnosticEntry
                {
                    Code = "NO_START_BLOCK",
                    Message = $"Scene \"{scene.Scene}\" has no start block and cannot play.",
                    SceneId = scene.Id,
                    ScenePath = scene.Scene,
                });
            }
            else if (!blockIds.Contains(scene.Start!))
            {
                errors.Add(new DiagnosticEntry
                {
                    Code = "INVALID_START_BLOCK",
                    Message = $"Scene \"{scene.Scene}\" starts on \"{scene.Start}\", "
                              + "which is not a block of this scene.",
                    SceneId = scene.Id,
                    ScenePath = scene.Scene,
                    BlockId = scene.Start,
                });
            }


            foreach (var block in blocks)
            {
                ValidateLinks(scene, block, blockIds, errors);
                ValidateWaits(scene, block, blockIds, warnings);
                ValidateUsage(scene, block, blocksById, declared, warnings);
            }
        }

        /// <summary>WaitForBlocks names blocks OF THIS SCENE that must have FINISHED before this one is dispatched.</summary>
        /// <remarks>A name that is not in the scene can never finish, so the block parks for good.
        /// It used to hold the scene open with no OnSceneExit; the engine now closes it as
        /// deadlocked — either way the dialogue stops there, and nothing on screen says why, which is
        /// why it is said here. A warning, not an error: the rest of the scene still plays.</remarks>
        private static void ValidateWaits(
            BlueprintScene scene,
            BlueprintBlock block,
            HashSet<string> blockIds,
            List<DiagnosticEntry> warnings)
        {
            var waits = LsdeUtils.GetNativeProperties(block).WaitForBlocks;
            if (waits == null) return;

            foreach (var id in waits)
            {
                if (string.IsNullOrEmpty(id) || blockIds.Contains(id)) continue;
                warnings.Add(new DiagnosticEntry
                {
                    Code = "UNKNOWN_WAIT_BLOCK",
                    Message = $"{DescribeBlock(block)} waits for \"{id}\", which is not a block of "
                              + $"scene \"{scene.Scene}\". It can never be visited, so this block never advances.",
                    SceneId = scene.Id,
                    ScenePath = scene.Scene,
                    BlockId = block.Id,
                });
            }
        }

        // ─── What the blocks use ─────────────────────────────────────────

        /// <summary>What a block USES must be what the export DECLARES.</summary>
        /// <remarks>
        /// <para>An export carries two kinds of facts: the tables its header declares, and what its
        /// blocks use. Check compares the first kind against the game; nothing read the second. So an
        /// action calling a function the export does not declare — a v1 id left behind in the
        /// project — loaded without a word, and failed in game, far from the cause.</para>
        /// <para>Always on, no Check needed: the export contradicts ITSELF, whatever the game knows.
        /// Warnings, not errors — the scene still plays; only the call or the test that names nothing
        /// goes wrong. The codes say UNDECLARED where the existing ones say UNKNOWN: those mean "the
        /// game does not know it".</para>
        /// <para>Two things are left alone on purpose. A declared parameter with no argument: the
        /// format does not say which parameters are optional. And the TYPE of a value: it would make
        /// the warning noisier than the defect it catches.</para>
        /// </remarks>
        private static void ValidateUsage(
            BlueprintScene scene,
            BlueprintBlock block,
            Dictionary<string, BlueprintBlock> blocksById,
            Declared declared,
            List<DiagnosticEntry> warnings)
        {
            if (block.Calls != null)
            {
                foreach (var call in block.Calls) ValidateCall(scene, block, call, declared, warnings);
            }
            foreach (var test in TestsOf(block))
            {
                ValidateTest(scene, block, test, blocksById, declared, warnings);
            }
        }

        /// <summary>Every condition test a block carries: the cases of a condition or a router, and
        /// the options of a choice.</summary>
        private static List<ConditionTest> TestsOf(BlueprintBlock block)
        {
            var tests = new List<ConditionTest>();
            if (block.Cases != null)
            {
                foreach (var conditionCase in block.Cases)
                {
                    if (conditionCase.When != null) tests.AddRange(conditionCase.When);
                }
            }
            if (block.Options != null)
            {
                foreach (var option in block.Options)
                {
                    if (option.When != null) tests.AddRange(option.When);
                }
            }
            return tests;
        }

        private static void ValidateCall(
            BlueprintScene scene,
            BlueprintBlock block,
            ActionCall call,
            Declared declared,
            List<DiagnosticEntry> warnings)
        {
            var where = $"{DescribeBlock(block)} in scene \"{scene.Scene}\"";

            // The contract allows it — "not picked yet" — but the game is then handed a call it
            // cannot run.
            if (string.IsNullOrEmpty(call.Fn))
            {
                warnings.Add(Usage("EMPTY_FUNCTION", $"{where} has a call with no function picked.", scene, block));
                return;
            }

            if (!declared.Functions.TryGetValue(call.Fn, out var fn))
            {
                warnings.Add(Usage("UNDECLARED_FUNCTION",
                    $"{where} calls \"{call.Fn}\", which the export does not declare in its functions.", scene, block));
                // Nothing more to say about its arguments: nobody knows what they should be.
                return;
            }

            var parameters = new Dictionary<string, FunctionParameter>();
            if (fn.Params != null)
            {
                // A parameter with no name declares nothing an argument could be matched to.
                foreach (var param in fn.Params)
                {
                    if (param.Name != null) parameters[param.Name] = param;
                }
            }
            if (call.Args == null) return;

            foreach (var arg in call.Args)
            {
                if (!parameters.TryGetValue(arg.Key, out var param))
                {
                    warnings.Add(Usage("UNDECLARED_ARGUMENT",
                        $"{where} calls \"{fn.Id}\" with argument \"{arg.Key}\", which \"{fn.Id}\" does not declare.", scene, block));
                    continue;
                }

                if (param.Type != ValueType.DictionaryKey) continue;

                var value = ValueText(arg.Value);
                HashSet<string>? entries = null;
                if (param.Dictionary != null) declared.Dictionaries.TryGetValue(param.Dictionary, out entries);

                if (entries == null)
                {
                    warnings.Add(Usage("UNDECLARED_DICTIONARY_KEY",
                        $"{where} passes \"{value}\" as \"{arg.Key}\" of \"{fn.Id}\", picked in dictionary "
                        + $"\"{param.Dictionary ?? ""}\", which the export does not declare.", scene, block));
                }
                else if (!entries.Contains(value))
                {
                    warnings.Add(Usage("UNDECLARED_DICTIONARY_KEY",
                        $"{where} passes \"{value}\" as \"{arg.Key}\" of \"{fn.Id}\", which is not an entry "
                        + $"of dictionary \"{param.Dictionary}\".", scene, block));
                }
            }
        }

        private static void ValidateTest(
            BlueprintScene scene,
            BlueprintBlock block,
            ConditionTest test,
            Dictionary<string, BlueprintBlock> blocksById,
            Declared declared,
            List<DiagnosticEntry> warnings)
        {
            var where = $"{DescribeBlock(block)} in scene \"{scene.Scene}\"";

            // The reserved "choice" dictionary is not declared anywhere: it reads the answers given IN
            // THIS SCENE, so its entry must be a CHOICE block of this scene and its value one of that
            // block's options.
            if (test.Dict == Ports.Choice)
            {
                // A null Entry names no block. Newtonsoft and System.Text.Json both hand "entry": null
                // over as null, and a Dictionary refuses a null key.
                if (test.Entry == null || !blocksById.TryGetValue(test.Entry, out var target) || target.Type != BlockType.Choice)
                {
                    warnings.Add(Usage("UNKNOWN_CHOICE_BLOCK",
                        $"{where} tests the answer given at \"{test.Entry}\", which is not a CHOICE block of this "
                        + "scene. The engine only remembers the answers given in the scene that is playing.", scene, block));
                    return;
                }

                var picked = ValueText(test.Value);
                bool offered = false;
                if (target.Options != null)
                {
                    foreach (var option in target.Options)
                    {
                        if (option.Id == picked) { offered = true; break; }
                    }
                }
                if (!offered)
                {
                    warnings.Add(Usage("UNKNOWN_CHOICE_OPTION",
                        $"{where} tests whether \"{picked}\" was picked at {test.Entry}, which has no such option.", scene, block));
                }
                return;
            }

            // A null Dict names no dictionary.
            if (test.Dict == null || !declared.Dictionaries.TryGetValue(test.Dict, out var entries))
            {
                warnings.Add(Usage("UNDECLARED_DICTIONARY",
                    $"{where} tests dictionary \"{test.Dict}\", which the export does not declare.", scene, block));
                return;
            }
            if (!entries.Contains(test.Entry))
            {
                warnings.Add(Usage("UNDECLARED_ENTRY",
                    $"{where} tests \"{test.Dict}.{test.Entry}\", an entry dictionary \"{test.Dict}\" does not declare.", scene, block));
            }
        }

        private static DiagnosticEntry Usage(string code, string message, BlueprintScene scene, BlueprintBlock block)
        {
            return new DiagnosticEntry
            {
                Code = code, Message = message, SceneId = scene.Id, ScenePath = scene.Scene, BlockId = block.Id,
            };
        }

        /// <summary>A value as the text a dictionary entry or an option id is written in.</summary>
        /// <remarks>Invariant culture: "3.5" must not become "3,5" on a French machine.</remarks>
        private static string ValueText(object? value)
        {
            switch (value)
            {
                case null: return "";
                case string text: return text;
                case bool flag: return flag ? "true" : "false";
                case IFormattable formattable: return formattable.ToString(null, CultureInfo.InvariantCulture);
                default: return value.ToString() ?? "";
            }
        }

        private static void ValidateLinks(
            BlueprintScene scene,
            BlueprintBlock block,
            HashSet<string> blockIds,
            List<DiagnosticEntry> errors)
        {
            if (block.Next == null || block.Next.Count == 0) return;

            // A link's target is relative to the same scene — a wire has never crossed one.
            //
            // Several wires on one port is NOT reported. It used to be, as MULTIPLE_NON_ASYNC_FORK:
            // "two non-async targets on one port, mark the secondary ones isAsync". The warning was
            // right about the engine of the day — every wire but the first was detached whatever
            // the designer had ticked — and it asked them to give up what they had drawn. The
            // traversal now walks those wires in turn, which is what the drawing said, so there is
            // nothing left to warn about.
            foreach (var link in block.Next)
            {
                if (!blockIds.Contains(link.To))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "BROKEN_LINK",
                        Message = $"{DescribeBlock(block)} links from port \"{link.Port}\" to \"{link.To}\", "
                                  + $"which is not a block of scene \"{scene.Scene}\".",
                        SceneId = scene.Id,
                        ScenePath = scene.Scene,
                        BlockId = block.Id,
                    });
                }
            }
        }

        private static void CrossValidate(
            BlueprintExport data,
            CheckOptions check,
            List<DiagnosticEntry> warnings)
        {
            if (check.Functions != null && data.Functions != null)
            {
                var known = new HashSet<string>(check.Functions);
                foreach (var fn in data.Functions)
                {
                    if (!known.Contains(fn.Id))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_FUNCTION",
                            Message = $"Blueprint declares function \"{fn.Id}\" which the game does not implement.",
                        });
                    }
                }
            }

            if (check.Dictionaries != null && data.Dictionaries != null)
            {
                foreach (var dict in data.Dictionaries)
                {
                    if (dict.Id == null || !check.Dictionaries.TryGetValue(dict.Id, out var knownEntries))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_DICTIONARY",
                            Message = $"Blueprint uses dictionary \"{dict.Id}\" which the game does not declare.",
                        });
                        continue;
                    }

                    var knownSet = new HashSet<string>(knownEntries);
                    foreach (var entry in dict.Entries ?? new List<string>())
                    {
                        if (!knownSet.Contains(entry))
                        {
                            warnings.Add(new DiagnosticEntry
                            {
                                Code = "UNKNOWN_DICTIONARY_ENTRY",
                                Message = $"Dictionary \"{dict.Id}\" declares entry \"{entry}\" which the game does not know.",
                            });
                        }
                    }
                }
            }

            // Cards — matched on the NAME the game gives them, not on the editor id.
            if (check.Cards != null && data.Cards != null)
            {
                var known = new HashSet<string>(check.Cards);
                foreach (var card in data.Cards)
                {
                    if (!known.Contains(card.Name))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_CARD",
                            Message = $"Blueprint declares card \"{card.Name}\" ({card.Role}) which the game does not know.",
                        });
                    }
                }
            }
        }

        /// <summary>
        /// How a block is named in a diagnostic.
        /// <para>DIALOG-007 is already readable on its own — that is what replaced the v1 uuid, and
        /// it is why blocks carry no mandatory name. When the writer left a note, it says far more
        /// than any label would, so it is appended. A Label wins over both when an export has one.</para>
        /// </summary>
        private static string DescribeBlock(BlueprintBlock block)
        {
            if (!string.IsNullOrEmpty(block.Label)) return $"Block {block.Id} (\"{block.Label}\")";
            if (!string.IsNullOrEmpty(block.Note)) return $"Block {block.Id} (\"{Truncate(block.Note!, 60)}\")";
            return $"Block {block.Id}";
        }

        private static string Truncate(string text, int max)
        {
            return text.Length <= max ? text : text.Substring(0, max - 1) + "…";
        }

        private static string Describe(string? value)
        {
            return string.IsNullOrEmpty(value) ? "nothing" : $"\"{value}\"";
        }
    }
}

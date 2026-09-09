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

using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>Turns a payload into the DiagnosticReport that Init() returns. Reads format and version first.</summary>
    public static class Validator
    {
        /// <summary>The only payload this engine reads. A file that says anything else is refused.</summary>
        private const string SupportedFormat = "lsde-blueprints";

        /// <summary>The format version this engine reads. Bumps only when the contract changes.</summary>
        private const int SupportedVersion = 1;

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
        /// scene</b>, the entry block, link targets, and the blocks a WaitForBlocks names. With
        /// Check, also warns about functions, dictionaries and cards the game does not know.</para>
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

            var scenePaths = new HashSet<string>();
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
                        SceneId = scene.Scene,
                    });
                }

                ValidateScene(scene, errors, warnings);
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
            List<DiagnosticEntry> errors,
            List<DiagnosticEntry> warnings)
        {
            if (string.IsNullOrEmpty(scene.Scene))
            {
                errors.Add(new DiagnosticEntry { Code = "MISSING_SCENE_PATH", Message = "Scene is missing its path." });
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

            foreach (var block in blocks)
            {
                if (!blockIds.Add(block.Id))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "DUPLICATE_BLOCK_ID",
                        Message = $"Duplicate block id \"{block.Id}\" within scene \"{scene.Scene}\".",
                        SceneId = scene.Scene,
                        BlockId = block.Id,
                    });
                }
            }

            // The scene names its own entry, so there is no such thing as two start blocks.
            if (string.IsNullOrEmpty(scene.Start))
            {
                warnings.Add(new DiagnosticEntry
                {
                    Code = "NO_START_BLOCK",
                    Message = $"Scene \"{scene.Scene}\" has no start block and cannot play.",
                    SceneId = scene.Scene,
                });
            }
            else if (!blockIds.Contains(scene.Start!))
            {
                errors.Add(new DiagnosticEntry
                {
                    Code = "INVALID_START_BLOCK",
                    Message = $"Scene \"{scene.Scene}\" starts on \"{scene.Start}\", "
                              + "which is not a block of this scene.",
                    SceneId = scene.Scene,
                    BlockId = scene.Start,
                });
            }


            foreach (var block in blocks)
            {
                ValidateLinks(scene, block, blockIds, errors);
                ValidateWaits(scene, block, blockIds, warnings);
            }
        }

        /// <summary>WaitForBlocks names blocks OF THIS SCENE that must have FINISHED before this one is dispatched.</summary>
        /// <remarks>A name that is not in the scene can never finish, so the block parks for
        /// good: on the main flow that is the whole dialogue stopping with no OnSceneExit, and on a
        /// parallel track it is a branch that silently never finishes. Neither shows up anywhere at
        /// runtime, which is why it is said here — a warning, not an error: the rest still plays.</remarks>
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
                    SceneId = scene.Scene,
                    BlockId = block.Id,
                });
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
                        SceneId = scene.Scene,
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
                    if (!check.Dictionaries.TryGetValue(dict.Id, out var knownEntries))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_DICTIONARY",
                            Message = $"Blueprint uses dictionary \"{dict.Id}\" which the game does not declare.",
                        });
                        continue;
                    }

                    var knownSet = new HashSet<string>(knownEntries);
                    foreach (var entry in dict.Entries)
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

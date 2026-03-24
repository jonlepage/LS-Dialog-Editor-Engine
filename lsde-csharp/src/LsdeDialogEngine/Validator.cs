// LSDE Dialog Engine — Init validation + diagnostic report (C# port of validator.ts)

using System.Collections.Generic;

namespace LsdeDialogEngine
{
    public static class Validator
    {
        /// <summary>
        /// Validate blueprint data integrity and optionally cross-validate against game capabilities.
        /// </summary>
        public static DiagnosticReport ValidateBlueprint(InitOptions options)
        {
            var errors = new List<DiagnosticEntry>();
            var warnings = new List<DiagnosticEntry>();
            var data = options.Data;
            var check = options.Check;

            // ─── Structural validation ───────────────────────────────────────────

            if (data == null)
            {
                errors.Add(new DiagnosticEntry { Code = "MISSING_DATA", Message = "Blueprint data is required." });
                return new DiagnosticReport
                {
                    Errors = errors,
                    Warnings = warnings,
                    Stats = new DiagnosticStats()
                };
            }

            if (string.IsNullOrEmpty(data.Version))
            {
                errors.Add(new DiagnosticEntry { Code = "MISSING_VERSION", Message = "Blueprint version is required." });
            }

            if (data.Scenes == null || data.Scenes.Count == 0)
            {
                errors.Add(new DiagnosticEntry { Code = "NO_SCENES", Message = "Blueprint must contain at least one scene." });
                return new DiagnosticReport
                {
                    Errors = errors,
                    Warnings = warnings,
                    Stats = new DiagnosticStats()
                };
            }

            // ─── Per-scene validation ────────────────────────────────────────────

            var globalBlockUuids = new HashSet<string>();
            int totalBlocks = 0;
            int totalConnections = 0;

            foreach (var scene in data.Scenes)
            {
                ValidateScene(scene, globalBlockUuids, errors, warnings);
                totalBlocks += scene.Blocks.Count;
                totalConnections += scene.Connections.Count;
            }

            // ─── Cross-validation (optional) ────────────────────────────────────

            if (check != null)
            {
                CrossValidate(data, check, warnings);
            }

            return new DiagnosticReport
            {
                Errors = errors,
                Warnings = warnings,
                Stats = new DiagnosticStats
                {
                    SceneCount = data.Scenes.Count,
                    BlockCount = totalBlocks,
                    ConnectionCount = totalConnections
                }
            };
        }

        private static void ValidateScene(
            BlueprintScene scene,
            HashSet<string> globalBlockUuids,
            List<DiagnosticEntry> errors,
            List<DiagnosticEntry> warnings)
        {
            if (string.IsNullOrEmpty(scene.Uuid))
            {
                errors.Add(new DiagnosticEntry { Code = "MISSING_SCENE_UUID", Message = "Scene is missing a UUID." });
            }
            if (string.IsNullOrEmpty(scene.Label))
            {
                errors.Add(new DiagnosticEntry
                {
                    Code = "MISSING_SCENE_LABEL",
                    Message = "Scene is missing a label.",
                    SceneId = scene.Uuid
                });
            }

            var sceneBlockUuids = new HashSet<string>();
            int startBlockCount = 0;

            foreach (var block in scene.Blocks)
            {
                // Duplicate UUID within scene
                if (sceneBlockUuids.Contains(block.Uuid))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "DUPLICATE_BLOCK_UUID",
                        Message = $"Duplicate block UUID \"{block.Uuid}\" within scene \"{scene.Label}\".",
                        SceneId = scene.Uuid,
                        BlockId = block.Uuid
                    });
                }
                sceneBlockUuids.Add(block.Uuid);

                // Duplicate UUID across scenes
                if (globalBlockUuids.Contains(block.Uuid))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "DUPLICATE_BLOCK_UUID_GLOBAL",
                        Message = $"Block UUID \"{block.Uuid}\" exists in multiple scenes.",
                        SceneId = scene.Uuid,
                        BlockId = block.Uuid
                    });
                }
                globalBlockUuids.Add(block.Uuid);

                if (block.IsStartBlock == true)
                {
                    startBlockCount++;
                }
            }

            // Multiple start blocks
            if (startBlockCount > 1)
            {
                errors.Add(new DiagnosticEntry
                {
                    Code = "MULTIPLE_START_BLOCKS",
                    Message = $"Scene \"{scene.Label}\" has {startBlockCount} start blocks (expected at most 1).",
                    SceneId = scene.Uuid
                });
            }

            // entryBlockId references a valid block
            if (scene.EntryBlockId != null && !sceneBlockUuids.Contains(scene.EntryBlockId))
            {
                errors.Add(new DiagnosticEntry
                {
                    Code = "INVALID_ENTRY_BLOCK",
                    Message = $"Scene \"{scene.Label}\" entryBlockId \"{scene.EntryBlockId}\" does not reference an existing block.",
                    SceneId = scene.Uuid,
                    BlockId = scene.EntryBlockId
                });
            }

            // Connection integrity
            foreach (var conn in scene.Connections)
            {
                if (!sceneBlockUuids.Contains(conn.FromId))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "BROKEN_CONNECTION_FROM",
                        Message = $"Connection \"{conn.Id}\" fromId \"{conn.FromId}\" references a non-existent block.",
                        SceneId = scene.Uuid
                    });
                }
                if (!sceneBlockUuids.Contains(conn.ToId))
                {
                    errors.Add(new DiagnosticEntry
                    {
                        Code = "BROKEN_CONNECTION_TO",
                        Message = $"Connection \"{conn.Id}\" toId \"{conn.ToId}\" references a non-existent block.",
                        SceneId = scene.Uuid
                    });
                }
            }

            // Fork validation: max 1 non-async target per output port group
            var blockMap = new Dictionary<string, BlueprintBlock>();
            foreach (var block in scene.Blocks)
            {
                blockMap[block.Uuid] = block;
            }

            var portGroups = new Dictionary<string, List<string>>(); // "blockId:portKey" → toId[]
            foreach (var conn in scene.Connections)
            {
                string key = conn.FromPortIndex.HasValue
                    ? $"{conn.FromId}:idx:{conn.FromPortIndex.Value}"
                    : $"{conn.FromId}:port:{conn.FromPort}";

                if (portGroups.TryGetValue(key, out var group))
                {
                    group.Add(conn.ToId);
                }
                else
                {
                    portGroups[key] = new List<string> { conn.ToId };
                }
            }

            foreach (var kv in portGroups)
            {
                var targets = kv.Value;
                if (targets.Count <= 1) continue;

                int nonAsyncCount = 0;
                foreach (var toId in targets)
                {
                    if (blockMap.TryGetValue(toId, out var target))
                    {
                        if (target.NativeProperties?.IsAsync != true)
                        {
                            nonAsyncCount++;
                        }
                    }
                }

                if (nonAsyncCount > 1)
                {
                    warnings.Add(new DiagnosticEntry
                    {
                        Code = "MULTIPLE_NON_ASYNC_FORK",
                        Message = $"A port has {targets.Count} outgoing connections with {nonAsyncCount} non-async targets. Mark secondary targets as isAsync.",
                        SceneId = scene.Uuid
                    });
                }
            }
        }

        private static void CrossValidate(
            BlueprintExport data,
            CheckOptions check,
            List<DiagnosticEntry> warnings)
        {
            // Signatures
            if (check.Signatures != null && data.Signatures != null)
            {
                var gameSignatures = new HashSet<string>(check.Signatures);
                foreach (var sig in data.Signatures)
                {
                    if (!gameSignatures.Contains(sig.Id))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_SIGNATURE",
                            Message = $"Blueprint uses signature \"{sig.Id}\" which is not declared in the game."
                        });
                    }
                }
            }

            // Dictionaries
            if (check.Dictionaries != null && data.Dictionaries != null)
            {
                foreach (var dict in data.Dictionaries)
                {
                    string label = dict.Label ?? dict.Uuid;
                    if (!check.Dictionaries.TryGetValue(label, out var gameKeys))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_DICTIONARY_GROUP",
                            Message = $"Blueprint uses dictionary group \"{label}\" which is not declared in the game."
                        });
                        continue;
                    }
                    var gameKeySet = new HashSet<string>(gameKeys);
                    foreach (var row in dict.Rows)
                    {
                        if (!gameKeySet.Contains(row.Key))
                        {
                            warnings.Add(new DiagnosticEntry
                            {
                                Code = "UNKNOWN_DICTIONARY_KEY",
                                Message = $"Dictionary group \"{label}\" uses key \"{row.Key}\" not declared in the game."
                            });
                        }
                    }
                }
            }

            // Characters
            if (check.Characters != null)
            {
                var gameCharacters = new HashSet<string>(check.Characters);
                var blueprintCharacters = new HashSet<string>();
                foreach (var scene in data.Scenes)
                {
                    foreach (var block in scene.Blocks)
                    {
                        if (block.Metadata?.Characters != null)
                        {
                            foreach (var ch in block.Metadata.Characters)
                            {
                                blueprintCharacters.Add(ch.Name);
                            }
                        }
                    }
                }
                foreach (var name in blueprintCharacters)
                {
                    if (!gameCharacters.Contains(name))
                    {
                        warnings.Add(new DiagnosticEntry
                        {
                            Code = "UNKNOWN_CHARACTER",
                            Message = $"Blueprint uses character \"{name}\" which is not declared in the game."
                        });
                    }
                }
            }
        }
    }
}

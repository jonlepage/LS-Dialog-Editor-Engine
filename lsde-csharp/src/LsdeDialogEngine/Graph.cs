// LSDE Dialog Engine — Graph indexing and lookups (C# port of graph.ts)

using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>
    /// Indexed representation of a single scene for O(1) block and connection lookups.
    /// Built once during Init(), used throughout traversal.
    /// </summary>
    public class SceneGraph
    {
        private readonly BlueprintScene _scene;
        private readonly Dictionary<string, BlueprintBlock> _blocksByUuid;
        private readonly Dictionary<string, List<BlueprintConnection>> _connectionsByFromId;

        public SceneGraph(BlueprintScene scene)
        {
            _scene = scene;
            _blocksByUuid = new Dictionary<string, BlueprintBlock>();
            _connectionsByFromId = new Dictionary<string, List<BlueprintConnection>>();

            foreach (var block in scene.Blocks)
            {
                _blocksByUuid[block.Uuid] = block;
            }

            foreach (var conn in scene.Connections)
            {
                if (_connectionsByFromId.TryGetValue(conn.FromId, out var existing))
                {
                    existing.Add(conn);
                }
                else
                {
                    _connectionsByFromId[conn.FromId] = new List<BlueprintConnection> { conn };
                }
            }
        }

        public BlueprintBlock? GetBlock(string uuid)
        {
            return _blocksByUuid.TryGetValue(uuid, out var block) ? block : null;
        }

        public List<BlueprintConnection> GetOutgoingConnections(string blockUuid)
        {
            return _connectionsByFromId.TryGetValue(blockUuid, out var conns)
                ? conns
                : new List<BlueprintConnection>();
        }

        /// <summary>Find the start block: isStartBlock flag first, then entryBlockId fallback.</summary>
        public BlueprintBlock? GetStartBlock()
        {
            foreach (var block in _scene.Blocks)
            {
                if (block.IsStartBlock == true) return block;
            }
            if (_scene.EntryBlockId != null)
            {
                return _blocksByUuid.TryGetValue(_scene.EntryBlockId, out var b) ? b : null;
            }
            return null;
        }

        public BlueprintScene GetScene() => _scene;

        public List<BlueprintBlock> GetAllBlocks() => _scene.Blocks;
    }

    /// <summary>
    /// Indexed representation of an entire blueprint export.
    /// Provides O(1) access to scenes, signatures, and dictionaries.
    /// </summary>
    public class BlueprintGraph
    {
        private readonly Dictionary<string, SceneGraph> _sceneGraphs;
        private readonly Dictionary<string, ActionSignature> _signaturesById;
        private readonly Dictionary<string, LsdeDictionary> _dictionariesByLabel;
        private readonly List<string> _locales;

        public BlueprintGraph(BlueprintExport data)
        {
            _sceneGraphs = new Dictionary<string, SceneGraph>();
            _signaturesById = new Dictionary<string, ActionSignature>();
            _dictionariesByLabel = new Dictionary<string, LsdeDictionary>();
            _locales = data.Locales ?? new List<string>();

            foreach (var scene in data.Scenes)
            {
                _sceneGraphs[scene.Uuid] = new SceneGraph(scene);
            }

            if (data.Signatures != null)
            {
                foreach (var sig in data.Signatures)
                {
                    _signaturesById[sig.Id] = sig;
                }
            }

            if (data.Dictionaries != null)
            {
                foreach (var dict in data.Dictionaries)
                {
                    if (dict.Label != null)
                    {
                        _dictionariesByLabel[dict.Label] = dict;
                    }
                }
            }
        }

        public SceneGraph? GetSceneGraph(string sceneUuid)
        {
            return _sceneGraphs.TryGetValue(sceneUuid, out var sg) ? sg : null;
        }

        public ActionSignature? GetSignature(string actionId)
        {
            return _signaturesById.TryGetValue(actionId, out var sig) ? sig : null;
        }

        public LsdeDictionary? GetDictionary(string groupLabel)
        {
            return _dictionariesByLabel.TryGetValue(groupLabel, out var dict) ? dict : null;
        }

        public List<string> GetAllSceneIds()
        {
            var ids = new List<string>();
            foreach (var key in _sceneGraphs.Keys)
            {
                ids.Add(key);
            }
            return ids;
        }

        public List<BlueprintConnection> GetSceneConnections(string sceneUuid)
        {
            if (_sceneGraphs.TryGetValue(sceneUuid, out var sg))
                return sg.GetScene().Connections;
            return new List<BlueprintConnection>();
        }

        public List<string> GetLocales() => _locales;
    }
}

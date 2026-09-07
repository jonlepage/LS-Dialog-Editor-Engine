// LSDE Dialog Engine — Graph indexing and lookups (C# port of graph.ts)
//
// Two things changed with the v2 format, and both live here.
//
// **Block ids repeat across scenes.** The counter restarts at 1 in every scene, so DIALOG-001
// legitimately exists in two of them at once. A block is identified by the pair (scene, id) and
// nothing else — which is why every lookup goes through a SceneGraph and there is no global block
// index anywhere in this file. The v1 engine had one, and it refused a perfectly good export with
// DUPLICATE_BLOCK_UUID_GLOBAL.
//
// **Wires are carried by the block they leave.** There is no connection table: a block lists its
// own outgoing links in Next, and a Link only says where it goes. So an outgoing lookup is a field
// read rather than a map hit, and anything that needs both ends of a wire gets it flattened into a
// BlueprintConnection.

using System.Collections.Generic;

namespace LsdeDialogEngine
{
    /// <summary>
    /// Indexed representation of a single scene for O(1) block lookups.
    /// Built once during Init(), used throughout traversal.
    /// </summary>
    public class SceneGraph
    {
        private readonly BlueprintScene _scene;
        private readonly Dictionary<string, BlueprintBlock> _blocksById;

        public SceneGraph(BlueprintScene scene)
        {
            _scene = scene;
            _blocksById = new Dictionary<string, BlueprintBlock>();

            foreach (var block in scene.Blocks)
            {
                _blocksById[block.Id] = block;
            }
        }

        /// <summary>A block by its id, which is unique WITHIN this scene only.</summary>
        public BlueprintBlock? GetBlock(string id)
        {
            return _blocksById.TryGetValue(id, out var block) ? block : null;
        }

        /// <summary>
        /// The wires leaving a block, in the order the file lists them.
        /// <para>Returned as-is: a Link knows its port and its target, and the caller already knows
        /// which block it asked about. Use GetConnections when the source id has to travel with the
        /// wire.</para>
        /// </summary>
        public List<Link> GetOutgoingLinks(string blockId)
        {
            var block = GetBlock(blockId);
            return block?.Next ?? new List<Link>();
        }

        /// <summary>
        /// Every wire of the scene, flattened so each one carries the block it leaves.
        /// <para>Graph inspection only — a debug tool that wants to see how a scene is wired without
        /// playing it. Traversal never needs this: it walks from a block, so it uses
        /// GetOutgoingLinks.</para>
        /// </summary>
        public List<BlueprintConnection> GetConnections()
        {
            var wires = new List<BlueprintConnection>();
            foreach (var block in _scene.Blocks)
            {
                if (block.Next == null) continue;
                foreach (var link in block.Next)
                {
                    wires.Add(new BlueprintConnection
                    {
                        From = block.Id,
                        Port = link.Port,
                        To = link.To,
                        ToPort = link.ToPort,
                    });
                }
            }
            return wires;
        }

        /// <summary>
        /// The block the scene starts on, named by Scene.Start.
        /// <para>There is no per-block start flag in v2 — the scene names its entry, so a scene
        /// cannot declare two of them. Null means the scene has no entry and cannot play.</para>
        /// </summary>
        public BlueprintBlock? GetStartBlock()
        {
            return string.IsNullOrEmpty(_scene.Start) ? null : GetBlock(_scene.Start!);
        }

        public BlueprintScene GetScene() => _scene;

        public List<BlueprintBlock> GetAllBlocks() => _scene.Blocks;
    }

    /// <summary>
    /// Indexed representation of an entire blueprint export.
    /// Provides O(1) access to scenes, functions, dictionaries and cards.
    /// </summary>
    public class BlueprintGraph
    {
        private readonly Dictionary<string, SceneGraph> _sceneGraphs = new Dictionary<string, SceneGraph>();
        private readonly Dictionary<string, string> _scenePathById = new Dictionary<string, string>();
        private readonly Dictionary<string, FunctionDefinition> _functionsById = new Dictionary<string, FunctionDefinition>();
        private readonly Dictionary<string, DictionaryDefinition> _dictionariesById = new Dictionary<string, DictionaryDefinition>();
        private readonly Dictionary<string, Card> _cardsById = new Dictionary<string, Card>();
        private readonly List<string> _locales;
        private readonly string _referenceLocale;

        public BlueprintGraph(BlueprintExport data)
        {
            _locales = data.Locales ?? new List<string>();
            _referenceLocale = data.ReferenceLocale ?? "";

            foreach (var scene in data.Scenes)
            {
                _sceneGraphs[scene.Scene] = new SceneGraph(scene);

                // A scene answers to its path AND to its rename-proof id. The path is what builds
                // the i18n keys and what a writer reads; the id is what an asset outside the
                // payload must store, because the path changes the day someone renames the scene.
                if (!string.IsNullOrEmpty(scene.Id))
                {
                    _scenePathById[scene.Id] = scene.Scene;
                }
            }

            if (data.Functions != null)
            {
                foreach (var fn in data.Functions) _functionsById[fn.Id] = fn;
            }

            if (data.Dictionaries != null)
            {
                foreach (var dict in data.Dictionaries) _dictionariesById[dict.Id] = dict;
            }

            if (data.Cards != null)
            {
                foreach (var card in data.Cards) _cardsById[card.Id] = card;
            }
        }

        /// <summary>A scene by its path (reactor_breach) or by its stable id (sc_u0vqg2g8).</summary>
        public SceneGraph? GetSceneGraph(string sceneRef)
        {
            if (_sceneGraphs.TryGetValue(sceneRef, out var direct)) return direct;
            if (_scenePathById.TryGetValue(sceneRef, out var path)
                && _sceneGraphs.TryGetValue(path, out var byId)) return byId;
            return null;
        }

        /// <summary>A declared engine function, as an action call's Fn names it.</summary>
        public FunctionDefinition? GetFunction(string functionId)
        {
            return _functionsById.TryGetValue(functionId, out var fn) ? fn : null;
        }

        /// <summary>A declared dictionary, as a condition test's Dict cites it.</summary>
        public DictionaryDefinition? GetDictionary(string dictionaryId)
        {
            return _dictionariesById.TryGetValue(dictionaryId, out var dict) ? dict : null;
        }

        /// <summary>A card by its editor id (var1), the other end of a block's Actors and Emotion.</summary>
        public Card? GetCard(string cardId)
        {
            return _cardsById.TryGetValue(cardId, out var card) ? card : null;
        }

        /// <summary>Every card holding a given role — Cards mixes characters, emotions, places and none.</summary>
        public List<Card> GetCardsByRole(string role)
        {
            var cards = new List<Card>();
            foreach (var card in _cardsById.Values)
            {
                if (card.Role == role) cards.Add(card);
            }
            return cards;
        }

        /// <summary>The path of every scene in the export — what engine.Scene() takes.</summary>
        public List<string> GetAllScenePaths()
        {
            return new List<string>(_sceneGraphs.Keys);
        }

        /// <summary>Every wire INSIDE a scene, flattened. Inspection only.</summary>
        public List<BlueprintConnection> GetSceneConnections(string sceneRef)
        {
            return GetSceneGraph(sceneRef)?.GetConnections() ?? new List<BlueprintConnection>();
        }

        public List<string> GetLocales() => _locales;

        /// <summary>The locale written first in the export. Empty when the project declares none.</summary>
        public string GetReferenceLocale() => _referenceLocale;
    }
}

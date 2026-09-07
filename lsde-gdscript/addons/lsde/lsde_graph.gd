## LSDE Dialog Engine — Graph indexing and lookups
##
## Two things changed with the v2 format, and both live here.
##
## [b]Block ids repeat across scenes.[/b] The counter restarts at 1 in every scene, so DIALOG-001
## legitimately exists in two of them at once. A block is identified by the pair (scene, id) and
## nothing else — which is why every lookup goes through a SceneGraph and there is no global block
## index anywhere in this file. The v1 engine had one, and it refused a perfectly good export.
##
## [b]Wires are carried by the block they leave.[/b] There is no connection table: a block lists
## its own outgoing links in [code]next[/code], and a link only says where it goes. So an outgoing
## lookup is a field read rather than a map hit, and anything that needs both ends of a wire gets
## it flattened into a connection Dictionary.
class_name LsdeGraph
extends RefCounted

## Indexed representation of a single scene for O(1) block lookups.
class SceneGraph extends RefCounted:
	var _scene: Dictionary
	var _blocks_by_id: Dictionary = {}

	func _init(scene: Dictionary) -> void:
		_scene = scene
		for block in scene.get("blocks", []):
			_blocks_by_id[block.get("id", "")] = block

	## A block by its id, which is unique WITHIN this scene only. null when absent.
	func get_block(id: String) -> Variant:
		return _blocks_by_id.get(id)

	## The wires leaving a block, in the order the file lists them.
	##
	## Returned as-is: a link knows its port and its target, and the caller already knows which
	## block it asked about. Use get_connections() when the source id has to travel with the wire.
	func get_outgoing_links(block_id: String) -> Array:
		var block: Variant = _blocks_by_id.get(block_id)
		if block == null:
			return []
		return block.get("next", [])

	## Every wire of the scene, flattened so each one carries the block it leaves.
	##
	## Graph inspection only — a debug tool that wants to see how a scene is wired without playing
	## it. Traversal never needs this: it walks from a block, so it uses get_outgoing_links().
	func get_connections() -> Array:
		var wires: Array = []
		for block in _scene.get("blocks", []):
			for link in block.get("next", []):
				wires.append({
					"from": block.get("id", ""),
					"port": link.get("port", ""),
					"to": link.get("to", ""),
					"toPort": link.get("toPort", LsdeTypes.PORT_IN),
				})
		return wires

	## The block the scene starts on, named by [code]scene.start[/code].
	##
	## There is no per-block start flag in v2 — the scene names its entry, so a scene cannot
	## declare two of them. null means the scene has no entry and cannot play.
	func get_start_block() -> Variant:
		var start: Variant = _scene.get("start")
		if start is String and start != "":
			return _blocks_by_id.get(start)
		return null

	## The underlying scene Dictionary.
	func get_scene() -> Dictionary:
		return _scene

	## Every block of the scene, in file order.
	func get_all_blocks() -> Array:
		return _scene.get("blocks", [])

var _scene_graphs: Dictionary = {}
var _scene_path_by_id: Dictionary = {}
var _functions_by_id: Dictionary = {}
var _dictionaries_by_id: Dictionary = {}
var _cards_by_id: Dictionary = {}
var _data: Dictionary

func _init(data: Dictionary) -> void:
	_data = data

	for scene in data.get("scenes", []):
		var path: String = scene.get("scene", "")
		_scene_graphs[path] = SceneGraph.new(scene)

		# A scene answers to its path AND to its rename-proof id. The path is what builds the i18n
		# keys and what a writer reads; the id is what an asset outside the payload must store,
		# because the path changes the day someone renames the scene.
		var stable_id: Variant = scene.get("id")
		if stable_id is String and stable_id != "":
			_scene_path_by_id[stable_id] = path

	for fn in data.get("functions", []):
		_functions_by_id[fn.get("id", "")] = fn

	for dict in data.get("dictionaries", []):
		_dictionaries_by_id[dict.get("id", "")] = dict

	for card in data.get("cards", []):
		_cards_by_id[card.get("id", "")] = card

## A scene by its path (reactor_breach) or by its stable id (sc_u0vqg2g8).
func get_scene_graph(scene_ref: String) -> Variant:
	if _scene_graphs.has(scene_ref):
		return _scene_graphs[scene_ref]
	var path: Variant = _scene_path_by_id.get(scene_ref)
	if path is String:
		return _scene_graphs.get(path)
	return null

## A declared engine function, as an action call's [code]fn[/code] names it.
func get_function(function_id: String) -> Variant:
	return _functions_by_id.get(function_id)

## A declared dictionary, as a condition test's [code]dict[/code] cites it.
func get_dictionary(dictionary_id: String) -> Variant:
	return _dictionaries_by_id.get(dictionary_id)

## A card by its editor id (var1), the other end of a block's actors and emotion.
func get_card(card_id: String) -> Variant:
	return _cards_by_id.get(card_id)

## Every card holding a given role — cards mixes characters, emotions, places and none.
func get_cards_by_role(role: String) -> Array:
	var cards: Array = []
	for card in _data.get("cards", []):
		if card.get("role", "") == role:
			cards.append(card)
	return cards

## The path of every scene in the export — what engine.scene() takes.
func get_all_scene_paths() -> Array:
	return _scene_graphs.keys()

## Every wire INSIDE a scene, flattened. Inspection only.
func get_scene_connections(scene_ref: String) -> Array:
	var sg: Variant = get_scene_graph(scene_ref)
	if sg == null:
		return []
	return sg.get_connections()

func get_locales() -> Array:
	return _data.get("locales", [])

## The locale written first in the export. Empty when the project declares none.
func get_reference_locale() -> String:
	return _data.get("referenceLocale", "")

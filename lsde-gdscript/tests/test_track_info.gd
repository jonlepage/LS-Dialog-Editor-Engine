## LSDE Dialog Engine — TrackInfo and the cancel cascade (port of the "TrackInfo" and "cancel
## cascade" suites of multitrack.test.ts)
##
## get_track_infos() and get_active_tracks() expose the PARALLEL tracks, for debug and rendering.
## The main flow, id 0, is not one of them. Track ids count up from 1 and never repeat within a
## scene; parentTrackId is -1 when the main flow opened the track.
##
## Child tracks SURVIVE the natural end of their parent: only an explicit cancel() cascades.
extends RefCounted

var _passed: int = 0
var _failed: int = 0
var _total: int = 0

# ─── Helpers ──────────────────────────────────────────────────────────────

func _assert_eq(actual: Variant, expected: Variant, label: String) -> void:
	_total += 1
	if typeof(actual) == typeof(expected) and actual == expected:
		_passed += 1
	else:
		_failed += 1
		print("  FAIL: %s — expected %s got %s" % [label, str(expected), str(actual)])

static func _dialog(id: String, next: Array = [], props: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {"id": id, "key": "__blueprints__.s1." + id, "type": LsdeTypes.BLOCK_DIALOG, "next": next}
	if not props.is_empty():
		b["props"] = props
	return b

static func _beside(id: String, next: Array = []) -> Dictionary:
	return _dialog(id, next, {"isAsync": true})

static func _link(to: String) -> Dictionary:
	return {"port": "out", "to": to, "toPort": "in"}

static func _one_scene(blocks: Array) -> Dictionary:
	return {
		"format": LsdeTypes.SUPPORTED_FORMAT,
		"version": LsdeTypes.SUPPORTED_VERSION,
		"generator": {"app": "LSDE", "version": "2.0.3"},
		"exportedAt": "2026-09-07T00:00:00.000Z",
		"project": "Test",
		"locales": ["en"],
		"referenceLocale": "en",
		"dictionaries": [], "functions": [], "cards": [],
		"scenes": [{
			"scene": "s1",
			"id": "sc_test0001",
			"start": blocks[0]["id"] if blocks.size() > 0 else null,
			"blocks": blocks,
		}],
	}

## FORK → MAIN and SIDE. `side` is the SIDE block, so a test can wire it further.
static func _fork_scene(side: Dictionary, more: Array = []) -> Dictionary:
	var blocks: Array = [_dialog("FORK", [_link("MAIN"), _link("SIDE")]), _dialog("MAIN"), side]
	blocks.append_array(more)
	return _one_scene(blocks)

## An engine whose dialog handler holds every block in `held` open — never calling next() — and
## advances the rest at once. Each dialog's cleanup records its id in `cleaned`.
func _engine(data: Dictionary, held: Array, cleaned: Array) -> LsdeDialogueEngine:
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	engine.on_choice(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_condition(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_action(func(args: Dictionary) -> Variant: args["next"].call(); return null)
	engine.on_dialog(func(args: Dictionary) -> Variant:
		var id: String = args["block"]["id"]
		if not held.has(id):
			args["next"].call()
		return func() -> void: cleaned.append(id))
	return engine

# ─── The cases ────────────────────────────────────────────────────────────

func _test_get_track_infos_returns_correct_data_for_running_tracks() -> void:
	var cleaned: Array = []
	var engine := _engine(_fork_scene(_beside("SIDE")), ["MAIN", "SIDE"], cleaned)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	var infos: Array = handle.get_track_infos()
	_assert_eq(infos.size(), 1, "one parallel track")
	if infos.size() != 1:
		return
	_assert_eq(infos[0]["id"], 1, "ids count up from 1")
	_assert_eq(infos[0]["parentTrackId"], -1, "opened by the main flow")
	_assert_eq(infos[0]["startBlockId"], "SIDE", "started on SIDE")
	_assert_eq(infos[0]["currentBlockId"], "SIDE", "still on SIDE")
	_assert_eq(infos[0]["running"], true, "running")

func _test_sub_track_parent_track_id_matches_parent_track_id() -> void:
	var cleaned: Array = []
	var engine := _engine(_fork_scene(_beside("SIDE", [_link("SUB")]), [_beside("SUB")]), ["MAIN", "SUB"], cleaned)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	# SIDE opened SUB and then ran out of graph, so SUB is the one still running — and it names
	# SIDE's id (1) as its parent, not the main flow.
	var infos: Array = handle.get_track_infos()
	_assert_eq(infos.size(), 1, "one parallel track left")
	if infos.size() != 1:
		return
	_assert_eq(infos[0]["id"], 2, "SUB is the second track")
	_assert_eq(infos[0]["parentTrackId"], 1, "SUB names SIDE as its parent")
	_assert_eq(infos[0]["startBlockId"], "SUB", "started on SUB")

func _test_an_ended_track_does_not_appear_in_get_track_infos() -> void:
	var cleaned: Array = []
	var engine := _engine(_fork_scene(_beside("SIDE")), ["MAIN"], cleaned)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	# SIDE answered at once and ended; MAIN is still holding the scene open.
	_assert_eq(handle.is_running(), true, "the scene is still open")
	_assert_eq(handle.get_track_infos().size(), 0, "no parallel track listed")
	_assert_eq(handle.get_active_tracks(), 0, "none counted")

func _test_explicit_cancel_cascades_but_a_natural_end_does_not() -> void:
	var cleaned: Array = []
	var engine := _engine(_fork_scene(_beside("SIDE", [_link("SUB")]), [_beside("SUB")]), ["MAIN", "SUB"], cleaned)

	var handle: LsdeSceneHandle = engine.scene("s1")
	handle.start()

	# SIDE ended naturally after opening SUB: SUB survives.
	_assert_eq(handle.get_active_tracks(), 1, "SUB survives its parent's natural end")
	_assert_eq(cleaned.has("SUB"), false, "SUB was not cleaned up")

	# An explicit cancel() tears everything down, SUB included.
	handle.cancel()
	_assert_eq(handle.get_active_tracks(), 0, "nothing left after cancel()")
	_assert_eq(cleaned.has("SUB"), true, "SUB cleaned up by the cascade")
	_assert_eq(cleaned.has("MAIN"), true, "MAIN cleaned up too")
	_assert_eq(handle.is_running(), false, "the scene is closed")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── TrackInfo Tests ──")
	_test_get_track_infos_returns_correct_data_for_running_tracks()
	_test_sub_track_parent_track_id_matches_parent_track_id()
	_test_an_ended_track_does_not_appear_in_get_track_infos()
	_test_explicit_cancel_cascades_but_a_natural_end_does_not()
	return {"passed": _passed, "failed": _failed, "total": _total}

## LSDE Dialog Engine — the ROUTER block (port of the ROUTER section of branch-queue.test.ts)
##
## A router launches every route whose case holds, then continues by "then" when all of them held
## or by "catch" when one did not. It has NO handler: by the time one could speak, every true case
## has launched and the exit is picked, so the engine dispatches nothing and advances on its own.
## "R" never appears in the played list, and that is the contract. A game that wants to watch one
## router still can, through on_block(id) — the last test here.
##
## The K* routes are walked like any other port: an isAsync target opens its own track, the others
## are this track's, in turn, and the continuation comes LAST — which is what lets then/catch stay
## the main flow when the case routes are async.
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

static func _block(id: String, type: String, extra: Dictionary = {}) -> Dictionary:
	var b: Dictionary = {"id": id, "key": "__blueprints__.s1." + id, "type": type}
	b.merge(extra)
	return b

static func _dialog(id: String, next: Array = []) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_DIALOG, {"next": next})

## A dialog whose target-side isAsync is what the wires pointing AT it will read.
static func _beside(id: String, next: Array = []) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_DIALOG, {"next": next, "props": {"isAsync": true}})

static func _test(entry: String) -> Dictionary:
	return {"dict": "party", "entry": entry, "op": LsdeTypes.OP_EQUALS, "value": true}

static func _case(port: String, when: Variant = null) -> Dictionary:
	var c: Dictionary = {"port": port}
	if when != null:
		c["when"] = when
	return c

## A ROUTER: the same cases as a condition, read the opposite way. Exits by then / catch.
static func _router(id: String, cases: Array, next: Array = []) -> Dictionary:
	return _block(id, LsdeTypes.BLOCK_ROUTER, {"cases": cases, "next": next})

static func _link(to: String, port: String = "out") -> Dictionary:
	return {"port": port, "to": to, "toPort": "in"}

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

## Play a scene to the end, advancing every block as soon as its handler is called. Nothing is
## deferred, so the order in `played` is the order the engine chose.
func _play(data: Dictionary, resolve: Variant = null, before: Variant = null) -> Dictionary:
	var played: Array = []
	var engine := LsdeDialogueEngine.new()
	var report: Dictionary = engine.init({"data": data})
	_assert_eq(report["errors"].size(), 0, "payload loads")
	engine.on_resolve_condition(func(test: Dictionary) -> bool:
		return true if resolve == null else resolve.call(test.get("entry", "")))

	var dispatch: Callable = func(args: Dictionary) -> Variant:
		played.append(args["block"]["id"])
		args["next"].call()
		return null
	engine.on_dialog(dispatch)
	engine.on_choice(dispatch)
	engine.on_action(dispatch)
	engine.on_condition(dispatch)

	var handle: LsdeSceneHandle = engine.scene("s1")
	if before != null:
		before.call(handle)
	handle.start()
	return {"played": played, "running": handle.is_running(), "visited": handle.get_visited_blocks()}

## A three-case router. The continuation ports are wired FIRST on purpose: the flow follows the
## order of the ports the router resolved, never the order of the file.
func _router_scene(routes_beside: bool) -> Dictionary:
	var r1: Dictionary = _beside("R1") if routes_beside else _dialog("R1")
	var r2: Dictionary = _beside("R2") if routes_beside else _dialog("R2")
	var r3: Dictionary = _beside("R3") if routes_beside else _dialog("R3")
	return _one_scene([
		_router("R", [_case("K1", [_test("a")]), _case("K2", [_test("b")]), _case("K3", [_test("c")])], [
			_link("THEN", LsdeTypes.PORT_THEN), _link("CATCH", LsdeTypes.PORT_CATCH),
			_link("R1", "K1"), _link("R2", "K2"), _link("R3", "K3"),
		]),
		r1, r2, r3,
		_dialog("THEN"), _dialog("CATCH"),
	])

# ─── The cases ────────────────────────────────────────────────────────────

func _test_every_case_true_targets_not_async() -> void:
	var r: Dictionary = _play(_router_scene(false))
	_assert_eq(r["played"], ["R1", "R2", "R3", "THEN"], "K1, K2, K3, then then")

func _test_every_case_true_targets_async() -> void:
	var r: Dictionary = _play(_router_scene(true))
	_assert_eq(r["played"], ["R1", "R2", "R3", "THEN"], "the routes run beside, then continues")

func _test_one_case_false() -> void:
	var r: Dictionary = _play(_router_scene(false), func(entry: String) -> bool: return entry != "b")
	_assert_eq(r["played"], ["R1", "R3", "CATCH"], "the true routes still run, and the exit is catch")

func _test_no_case_true() -> void:
	var r: Dictionary = _play(_router_scene(false), func(_entry: String) -> bool: return false)
	_assert_eq(r["played"], ["CATCH"], "catch alone, nothing queued")

func _test_no_case_declared() -> void:
	var r: Dictionary = _play(_one_scene([
		_router("R", [], [_link("THEN", LsdeTypes.PORT_THEN), _link("CATCH", LsdeTypes.PORT_CATCH)]),
		_dialog("THEN"), _dialog("CATCH"),
	]))
	_assert_eq(r["played"], ["THEN"], "then, like Promise.all of nothing")

func _test_the_continuation_port_has_no_wire() -> void:
	var r: Dictionary = _play(_one_scene([
		_router("R", [_case("K1", [_test("a")]), _case("K2", [_test("b")])], [_link("R1", "K1"), _link("R2", "K2")]),
		_dialog("R1"), _dialog("R2"),
	]))
	_assert_eq(r["played"], ["R1", "R2"], "the queue is still walked")
	_assert_eq(r["running"], false, "then the track ends")

func _test_a_case_route_with_its_own_branch() -> void:
	var r: Dictionary = _play(_one_scene([
		_router("R", [_case("K1", [_test("a")]), _case("K2", [_test("b")])],
			[_link("R1", "K1"), _link("R2", "K2"), _link("THEN", LsdeTypes.PORT_THEN)]),
		_dialog("R1", [_link("R1b")]),
		_dialog("R1b"),
		_dialog("R2"),
		_dialog("THEN"),
	]))
	_assert_eq(r["played"], ["R1", "R1b", "R2", "THEN"], "a route finishes its branch before the next case")

func _test_a_router_is_visited_though_never_dispatched() -> void:
	# The traversal marks a block reached before it looks for a handler, so the router is in the
	# visited list — and absent from `played`, which only the handlers fill.
	var r: Dictionary = _play(_router_scene(false))
	_assert_eq(r["visited"].has("R"), true, "the router is visited")
	_assert_eq(r["played"].has("R"), false, "the router is never dispatched")

func _test_a_router_is_observable_through_on_block() -> void:
	# RouterContext carries `cases` and nothing to answer with — no resolve(). What a test can check
	# is that the observation point gets the same pre-evaluated cases a condition would, ALL of
	# them, and that the flow still goes on.
	var seen: Array = [false]
	var results: Array = []
	var before: Callable = func(handle: LsdeSceneHandle) -> void:
		handle.on_block("R", func(args: Dictionary) -> Variant:
			var ctx: Variant = args["context"]
			seen[0] = ctx is LsdeBlockContext.RouterContext
			if seen[0]:
				_assert_eq(ctx.has_method("resolve"), false, "a router context has no resolve()")
				for c in ctx.cases:
					results.append(c["result"])
			args["next"].call()
			return null)

	var r: Dictionary = _play(_router_scene(false), func(entry: String) -> bool: return entry != "b", before)

	_assert_eq(seen[0], true, "on_block(id) hands over a RouterContext")
	_assert_eq(results, [true, false, true], "every case, pre-evaluated")
	_assert_eq(r["played"], ["R1", "R3", "CATCH"], "the flow still goes on")

# ─── Entry point ──────────────────────────────────────────────────────────

func run() -> Dictionary:
	print("\n── Router Tests ──")
	_test_every_case_true_targets_not_async()
	_test_every_case_true_targets_async()
	_test_one_case_false()
	_test_no_case_true()
	_test_no_case_declared()
	_test_the_continuation_port_has_no_wire()
	_test_a_case_route_with_its_own_branch()
	_test_a_router_is_visited_though_never_dispatched()
	_test_a_router_is_observable_through_on_block()
	return {"passed": _passed, "failed": _failed, "total": _total}

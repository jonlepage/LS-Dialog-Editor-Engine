# Regenerates the three cross-language conformance specs on the LSDE v2 format.
#
# These files are the shared contract every runtime must pass. They are written from here rather
# than by hand so the four runtimes cannot drift on the shape of a payload, and so a change to the
# format is one edit rather than three.

import json
import io

CARDS = [
    {"id": "var1", "name": "kael", "role": "characters"},
    {"id": "var2", "name": "nora", "role": "characters"},
    {"id": "var3", "name": "afraid", "role": "emotions"},
]

DICTIONARIES = [
    {"id": "switches", "valueType": "boolean", "entries": ["door_unlocked", "met_vesk"]},
    {"id": "variables", "valueType": "number", "entries": ["credits", "trust"]},
]

FUNCTIONS = [
    {"id": "play_music", "params": [{"name": "track", "type": "string"}]},
    {"id": "give_item", "params": [{"name": "item", "type": "string"}]},
]


def header(scenes):
    return {
        "format": "lsde-blueprints",
        "version": 1,
        "generator": {"app": "LSDE", "version": "2.0.3"},
        "exportedAt": "2026-09-07T00:00:00.000Z",
        "project": "Conformance",
        "locales": ["en", "fr"],
        "referenceLocale": "en",
        "dictionaries": DICTIONARIES,
        "functions": FUNCTIONS,
        "cards": CARDS,
        "scenes": scenes,
    }


def scene(path, blocks, start=None):
    s = {"scene": path, "id": "sc_" + path.replace("-", "_")[:8], "blocks": blocks}
    entry = start or (blocks[0]["id"] if blocks else None)
    if entry:
        s["start"] = entry
    return s


def block(bid, btype, **kw):
    b = {"id": bid, "key": "__blueprints__.s1." + bid, "type": btype}
    b.update({k: v for k, v in kw.items() if v is not None})
    return b


def wire(port, to):
    return {"port": port, "to": to, "toPort": "in"}


def dlg(bid, text=None, **kw):
    return block(bid, "dialog", text={"en": text, "fr": text} if text else None, **kw)


def opt(oid, text=None, when=None):
    o = {"id": oid, "key": "__blueprints__.s1.CHOICE-001." + oid}
    if text:
        o["text"] = {"en": text, "fr": text}
    if when:
        o["when"] = when
    return o


def cmp_(dict_, entry, value, op="equals", join=None):
    c = {"dict": dict_, "entry": entry, "op": op, "value": value}
    if join:
        c["join"] = join
    return c


# ══════════════════════════════════════════════════════════════════════════
# test-cases.json — playing a scene, input to expected output
# ══════════════════════════════════════════════════════════════════════════

flow_suites = [
    {
        "id": "linear-dialog",
        "description": "Three dialogs in a row, each leaving by out.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "First", next=[wire("out", "DIALOG-002")]),
            dlg("DIALOG-002", "Second", next=[wire("out", "DIALOG-003")]),
            dlg("DIALOG-003", "Third"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "walks-in-order",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "text": "First"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002", "text": "Second"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003", "text": "Third"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003"],
            "expectedCleanupCalls": 3,
        }],
    },
    {
        "id": "choice-branch",
        "description": "An option id IS its exit port. There is no out on a choice.",
        "blueprint": header([scene("s1", [
            block("CHOICE-001", "choice",
                  options=[opt("C1", "Left"), opt("C2", "Right")],
                  next=[wire("C1", "DIALOG-001"), wire("C2", "DIALOG-002")]),
            dlg("DIALOG-001", "Went left"),
            dlg("DIALOG-002", "Went right"),
        ])]),
        "sceneId": "s1",
        "cases": [
            {
                "id": "picks-first-option",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001", "visibleOptionCount": 2},
                     "action": {"type": "selectChoice", "optionId": "C1"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["CHOICE-001", "DIALOG-001"],
            },
            {
                "id": "picks-second-option",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                     "action": {"type": "selectChoice", "optionId": "C2"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["CHOICE-001", "DIALOG-002"],
            },
            {
                "id": "unwired-option-ends-the-flow",
                "description": "C3 exists on no wire: a dead end, which is the drawing, not an error.",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                     "action": {"type": "selectChoice", "optionId": "C3"}},
                ],
                "expectedVisited": ["CHOICE-001"],
            },
        ],
    },
    {
        "id": "condition-if-mode",
        "description": "No portPerCase: every case must hold. out when they do, default when not.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("switches", "door_unlocked", True)]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "Open"),
            dlg("DIALOG-002", "Locked"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": True}},
        "cases": [{
            "id": "takes-out-when-it-holds",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-001"],
        }],
    },
    {
        "id": "condition-if-mode-false",
        "description": "The false exit of an if-style condition is `default`. v1 called it `false`.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("switches", "door_unlocked", True)]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "Open"),
            dlg("DIALOG-002", "Locked"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": False}},
        "cases": [{
            "id": "takes-default-when-it-does-not",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-002"],
        }],
    },
    {
        "id": "condition-port-per-case",
        "description": "portPerCase: the FIRST case that holds takes its own port.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  props={"portPerCase": True},
                  cases=[
                      {"port": "K1", "when": [cmp_("switches", "door_unlocked", True)]},
                      {"port": "K2", "when": [cmp_("switches", "met_vesk", True)]},
                      {"port": "K3"},
                  ],
                  next=[wire("K1", "DIALOG-001"), wire("K2", "DIALOG-002"),
                        wire("K3", "DIALOG-003"), wire("default", "DIALOG-004")]),
            dlg("DIALOG-001", "One"), dlg("DIALOG-002", "Two"),
            dlg("DIALOG-003", "Three"), dlg("DIALOG-004", "None"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": False, "switches.met_vesk": True}},
        "cases": [{
            "id": "takes-the-first-case-that-holds",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-002"],
        }],
    },
    {
        "id": "condition-case-with-no-when",
        "description": "A case with no `when` is always true, and shadows every case below it.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  props={"portPerCase": True},
                  cases=[
                      {"port": "K1", "when": [cmp_("switches", "door_unlocked", True)]},
                      {"port": "K2"},
                      {"port": "K3", "when": [cmp_("switches", "met_vesk", True)]},
                  ],
                  next=[wire("K1", "DIALOG-001"), wire("K2", "DIALOG-002"), wire("K3", "DIALOG-003")]),
            dlg("DIALOG-001", "One"), dlg("DIALOG-002", "Two"), dlg("DIALOG-003", "Three"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": False, "switches.met_vesk": True}},
        "cases": [{
            "id": "the-catch-all-wins-over-a-later-match",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-002"],
        }],
    },
    {
        "id": "action-then-catch",
        "description": "An action leaves by then, or by catch when a call failed.",
        "blueprint": header([scene("s1", [
            block("ACTION-001", "action",
                  calls=[{"fn": "play_music", "args": {"track": "theme"}}],
                  next=[wire("then", "DIALOG-001"), wire("catch", "DIALOG-002")]),
            dlg("DIALOG-001", "Worked"),
            dlg("DIALOG-002", "Failed"),
        ])]),
        "sceneId": "s1",
        "cases": [
            {
                "id": "then-on-success",
                "steps": [
                    {"expect": {"type": "action", "blockId": "ACTION-001"}, "action": {"type": "resolveAction"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["ACTION-001", "DIALOG-001"],
            },
            {
                "id": "catch-on-failure",
                "steps": [
                    {"expect": {"type": "action", "blockId": "ACTION-001"},
                     "action": {"type": "rejectAction", "error": "boom"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["ACTION-001", "DIALOG-002"],
            },
        ],
    },
    {
        "id": "action-catch-fallback",
        "description": "A failure with no catch wired carries on through then.",
        "blueprint": header([scene("s1", [
            block("ACTION-001", "action",
                  calls=[{"fn": "give_item", "args": {"item": "keycard"}}],
                  next=[wire("then", "DIALOG-001")]),
            dlg("DIALOG-001", "Carried on"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "falls-back-to-then",
            "steps": [
                {"expect": {"type": "action", "blockId": "ACTION-001"},
                 "action": {"type": "rejectAction", "error": "boom"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ACTION-001", "DIALOG-001"],
        }],
    },
    {
        "id": "port-per-character",
        "description": "The actor port is the CARD ID, with out as the else exit.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Who says this?",
                actors=["var1", "var2"], props={"portPerCharacter": True},
                next=[wire("var1", "DIALOG-002"), wire("var2", "DIALOG-003"), wire("out", "DIALOG-004")]),
            dlg("DIALOG-002", "Kael did"),
            dlg("DIALOG-003", "Nora did"),
            dlg("DIALOG-004", "Someone else"),
        ])]),
        "sceneId": "s1",
        "cases": [
            {
                "id": "first-actor-port",
                "steps": [
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"},
                     "action": {"type": "resolveCharacterPort", "cardId": "var1"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["DIALOG-001", "DIALOG-002"],
            },
            {
                "id": "second-actor-port",
                "steps": [
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"},
                     "action": {"type": "resolveCharacterPort", "cardId": "var2"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["DIALOG-001", "DIALOG-003"],
            },
            {
                "id": "falls-back-to-out",
                "description": "A card the block does not cite has no port; out is the else exit.",
                "steps": [
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"},
                     "action": {"type": "resolveCharacterPort", "cardId": "var9"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-004"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["DIALOG-001", "DIALOG-004"],
            },
        ],
    },
    {
        "id": "option-visibility",
        "description": "Options are tagged, never removed. The game filters.",
        "blueprint": header([scene("s1", [
            block("CHOICE-001", "choice",
                  options=[
                      opt("C1", "Always"),
                      opt("C2", "Needs credits", when=[cmp_("variables", "credits", 50, "greaterOrEqual")]),
                  ],
                  next=[wire("C1", "DIALOG-001"), wire("C2", "DIALOG-001")]),
            dlg("DIALOG-001", "Done"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"variables.credits": False}},
        "cases": [{
            "id": "one-visible-one-hidden",
            "steps": [
                {"expect": {"type": "choice", "blockId": "CHOICE-001", "visibleOptionCount": 1},
                 "action": {"type": "selectChoice", "optionId": "C1"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["CHOICE-001", "DIALOG-001"],
        }],
    },
    {
        "id": "choice-memory",
        "description": "The reserved `choice` dictionary reads a past answer of THIS scene.",
        "blueprint": header([scene("s1", [
            block("CHOICE-001", "choice",
                  options=[opt("C1", "Yes"), opt("C2", "No")],
                  next=[wire("C1", "COND-001"), wire("C2", "COND-001")]),
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("choice", "CHOICE-001", "C1")]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "You said yes"),
            dlg("DIALOG-002", "You did not"),
        ])]),
        "sceneId": "s1",
        "cases": [
            {
                "id": "remembers-the-answer",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                     "action": {"type": "selectChoice", "optionId": "C1"}},
                    {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["CHOICE-001", "COND-001", "DIALOG-001"],
            },
            {
                "id": "knows-when-it-was-a-different-answer",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                     "action": {"type": "selectChoice", "optionId": "C2"}},
                    {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["CHOICE-001", "COND-001", "DIALOG-002"],
            },
        ],
    },
    {
        "id": "note-skip",
        "description": "A note is never dispatched; the walk steps over it.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Before", next=[wire("out", "NOTE-001")]),
            block("NOTE-001", "note", note="Designer only", next=[wire("out", "DIALOG-002")]),
            dlg("DIALOG-002", "After"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "steps-over-the-note",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002"],
        }],
    },
    {
        "id": "note-loop",
        "description": "A note wired back on itself ends the flow instead of overflowing the stack.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Before", next=[wire("out", "NOTE-001")]),
            block("NOTE-001", "note", next=[wire("out", "NOTE-002")]),
            block("NOTE-002", "note", next=[wire("out", "NOTE-001")]),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "ends-the-scene",
            "steps": [{"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}}],
            "expectedVisited": ["DIALOG-001"],
        }],
    },
    {
        "id": "loop-exit",
        "description": "A choice wired back to itself, left on the second pass.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Hub", next=[wire("out", "CHOICE-001")]),
            block("CHOICE-001", "choice",
                  options=[opt("C1", "Again"), opt("C2", "Leave")],
                  next=[wire("C1", "DIALOG-001"), wire("C2", "DIALOG-002")]),
            dlg("DIALOG-002", "Left"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "loops-once",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                 "action": {"type": "selectChoice", "optionId": "C1"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                 "action": {"type": "selectChoice", "optionId": "C2"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "CHOICE-001", "DIALOG-002"],
            "orderIndependent": True,
        }],
    },
    {
        "id": "multi-track-async",
        "description": "The first non-async target is the main flow; the rest run in parallel.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Fork", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "Main"),
            dlg("DIALOG-003", "Background", props={"isAsync": True}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "both-tracks-run",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003"],
            "orderIndependent": True,
        }],
    },
    {
        "id": "condition-chain",
        "description": "Tests chain left to right with NO precedence.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [
                      cmp_("switches", "door_unlocked", True),
                      cmp_("switches", "met_vesk", True, "equals", "and"),
                  ]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "Both"), dlg("DIALOG-002", "Not both"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": True, "switches.met_vesk": True}},
        "cases": [{
            "id": "and-of-two-true",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-001"],
        }],
    },
    {
        "id": "condition-chain-or",
        "description": "One true on an OR chain is enough.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [
                      cmp_("switches", "door_unlocked", True),
                      cmp_("switches", "met_vesk", True, "equals", "or"),
                  ]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "Either"), dlg("DIALOG-002", "Neither"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": False, "switches.met_vesk": True}},
        "cases": [{
            "id": "or-of-false-and-true",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-001"],
        }],
    },
    {
        "id": "condition-chain-false",
        "description": "An AND chain with one false is false.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [
                      cmp_("switches", "door_unlocked", True),
                      cmp_("switches", "met_vesk", True, "equals", "and"),
                  ]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "Both"), dlg("DIALOG-002", "Not both"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": True, "switches.met_vesk": False}},
        "cases": [{
            "id": "and-with-one-false",
            "steps": [
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "DIALOG-002"],
        }],
    },
    {
        "id": "block-ids-repeat-between-scenes",
        "description": "DIALOG-001 exists in both scenes. A block is (scene, id), nothing else.",
        "blueprint": header([
            scene("first", [dlg("DIALOG-001", "In the first scene")]),
            scene("second", [dlg("DIALOG-001", "In the second scene")]),
        ]),
        "sceneId": "second",
        "cases": [{
            "id": "resolves-within-its-own-scene",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "text": "In the second scene"},
                 "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001"],
        }],
    },
    {
        "id": "scene-by-stable-id",
        "description": "A scene answers to its path AND to the id that survives a rename.",
        "blueprint": header([scene("s1", [dlg("DIALOG-001", "Only line")])]),
        "sceneId": "sc_s1",
        "cases": [{
            "id": "opens-by-stable-id",
            "steps": [{"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}}],
            "expectedVisited": ["DIALOG-001"],
        }],
    },
]

# ══════════════════════════════════════════════════════════════════════════
# test-init-validation.json — what init() accepts and refuses
# ══════════════════════════════════════════════════════════════════════════

def two_linked():
    return [dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002")]), dlg("DIALOG-002", "B")]


validation_suites = [
    {
        "id": "valid-init",
        "description": "A sound payload loads with no error and no warning.",
        "blueprint": header([scene("s1", two_linked())]),
        "cases": [{
            "id": "clean",
            "expectedErrors": [],
            "expectedWarnings": [],
            "expectedStats": {"sceneCount": 1, "blockCount": 2, "connectionCount": 1},
        }],
    },
    {
        "id": "invalid-format",
        "description": "A file that is not an LSDE blueprint is refused outright, before anything else.",
        "blueprint": {"hello": "world"},
        "cases": [{"id": "refused", "expectedErrors": ["INVALID_FORMAT"]}],
    },
    {
        "id": "v1-payload",
        "description": "A LSDE 1.6 export is refused by name rather than half-played.",
        "blueprint": {
            "version": "1.0.0", "exportDate": "2025-01-01", "locales": ["en"],
            "scenes": [{"uuid": "s1", "label": "S1", "blocks": [], "connections": []}],
        },
        "cases": [{"id": "refused", "expectedErrors": ["INVALID_FORMAT"]}],
    },
    {
        "id": "unsupported-version",
        "description": "A future format version is refused, and the message names the one it reads.",
        "blueprint": dict(header([scene("s1", two_linked())]), version=2),
        "cases": [{"id": "refused", "expectedErrors": ["UNSUPPORTED_FORMAT_VERSION"]}],
    },
    {
        "id": "missing-scenes",
        "description": "A well-formed header carrying no scene.",
        "blueprint": header([]),
        "cases": [{"id": "refused", "expectedErrors": ["NO_SCENES"]}],
    },
    {
        "id": "duplicate-block-id",
        "description": "The same id twice INSIDE one scene. Across scenes it is normal.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A"), dlg("DIALOG-001", "A again"),
        ])]),
        "cases": [{"id": "refused", "expectedErrors": ["DUPLICATE_BLOCK_ID"]}],
    },
    {
        "id": "ids-repeat-across-scenes",
        "description": "The counter restarts per scene, so this is the normal case, not a defect.",
        "blueprint": header([
            scene("first", [dlg("DIALOG-001", "A")]),
            scene("second", [dlg("DIALOG-001", "B")]),
        ]),
        "cases": [{
            "id": "accepted",
            "expectedErrors": [],
            "expectedStats": {"sceneCount": 2, "blockCount": 2, "connectionCount": 0},
        }],
    },
    {
        "id": "duplicate-scene",
        "description": "The same scene passed twice, as when a per-scene file is loaded twice.",
        "blueprint": header([scene("s1", [dlg("DIALOG-001", "A")]),
                             scene("s1", [dlg("DIALOG-001", "A")])]),
        "cases": [{"id": "refused", "expectedErrors": ["DUPLICATE_SCENE"]}],
    },
    {
        "id": "broken-link",
        "description": "A wire pointing at a block that is not in the scene.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-999")]),
        ])]),
        "cases": [{"id": "refused", "expectedErrors": ["BROKEN_LINK"]}],
    },
    {
        "id": "invalid-start-block",
        "description": "The scene names an entry it does not hold.",
        "blueprint": header([scene("s1", [dlg("DIALOG-001", "A")], start="NOWHERE-001")]),
        "cases": [{"id": "refused", "expectedErrors": ["INVALID_START_BLOCK"]}],
    },
    {
        "id": "no-start-block",
        "description": "A scene with no entry loads; it just cannot play. Not a reason to refuse the file.",
        "blueprint": header([{"scene": "s1", "id": "sc_s1", "blocks": [dlg("DIALOG-001", "A")]}]),
        "cases": [{"id": "warned", "expectedErrors": [], "expectedWarnings": ["NO_START_BLOCK"]}],
    },
    {
        "id": "two-non-async-targets-is-not-a-fault",
        "description": "One port, two non-async targets: they are walked in turn. Nothing to report.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Fork", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "A"), dlg("DIALOG-003", "B"),
        ])]),
        "cases": [{"id": "clean", "expectedErrors": [], "expectedWarnings": []}],
    },
    {
        "id": "async-fork-is-fine",
        "description": "The same fork with the extra target marked isAsync raises nothing either.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Fork", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "A"),
            dlg("DIALOG-003", "B", props={"isAsync": True}),
        ])]),
        "cases": [{"id": "clean", "expectedErrors": [], "expectedWarnings": []}],
    },
    {
        "id": "stats",
        "description": "Wires are counted off the blocks that carry them.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002")]),
            dlg("DIALOG-002", "B", next=[wire("out", "DIALOG-003")]),
            dlg("DIALOG-003", "C"),
        ])]),
        "cases": [{
            "id": "counts",
            "expectedStats": {"sceneCount": 1, "blockCount": 3, "connectionCount": 2},
        }],
    },
]

# ══════════════════════════════════════════════════════════════════════════
# test-port-routing.json — the algorithm that must match byte for byte
# ══════════════════════════════════════════════════════════════════════════

routing_suites = [
    {
        "id": "dialog-out",
        "description": "A dialog leaves by out.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002")]),
            dlg("DIALOG-002", "B"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "out",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002"],
        }],
    },
    {
        "id": "dialog-dead-end",
        "description": "No wire on out ends the flow, and that is a legitimate ending.",
        "blueprint": header([scene("s1", [dlg("DIALOG-001", "The end")])]),
        "sceneId": "s1",
        "cases": [{
            "id": "dead-end",
            "steps": [{"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}}],
            "expectedVisited": ["DIALOG-001"],
        }],
    },
    {
        "id": "choice-has-no-out",
        "description": "An out wire on a choice is never taken. The port is the option id.",
        "blueprint": header([scene("s1", [
            block("CHOICE-001", "choice",
                  options=[opt("C1", "Only")],
                  next=[wire("out", "DIALOG-002"), wire("C1", "DIALOG-001")]),
            dlg("DIALOG-001", "Right"),
            dlg("DIALOG-002", "Must not be taken"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "takes-the-option-port",
            "steps": [
                {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                 "action": {"type": "selectChoice", "optionId": "C1"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["CHOICE-001", "DIALOG-001"],
        }],
    },
    {
        "id": "choice-empty-option-id-picks-nothing",
        "description": "An empty option id is not a pick: the flow ends, whatever ports exist.",
        # The four runtimes read "nothing was picked" differently the moment the id is an empty
        # string: TypeScript treats it as no pick, and the three ports used to look for a port
        # literally named "". Nothing LSDE exports carries such a wire, but a game writing
        # selectChoice(picked?.id ?? "") is ordinary, and port resolution is the one file that has
        # to answer identically everywhere. So the rule is pinned here rather than left to chance.
        "blueprint": header([scene("s1", [
            block("CHOICE-001", "choice",
                  options=[opt("C1", "Only")],
                  next=[wire("", "DIALOG-002"), wire("C1", "DIALOG-001")]),
            dlg("DIALOG-001", "Not reached either"),
            dlg("DIALOG-002", "Must not be taken"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "ends-instead-of-taking-the-empty-port",
            "steps": [
                {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                 "action": {"type": "selectChoice", "optionId": ""}},
            ],
            "expectedVisited": ["CHOICE-001"],
        }],
    },
    {
        "id": "condition-unwired-case-port",
        "description": "default means no case matched, NOT that the chosen exit has no wire.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  props={"portPerCase": True},
                  cases=[{"port": "K1", "when": [cmp_("switches", "door_unlocked", True)]}],
                  next=[wire("default", "DIALOG-002")]),
            dlg("DIALOG-002", "Must not be taken"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": True}},
        "cases": [{
            "id": "ends-instead-of-falling-back",
            "steps": [{"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}}],
            "expectedVisited": ["COND-001"],
        }],
    },
    {
        "id": "action-has-no-out",
        "description": "An action leaves by then, never by out.",
        "blueprint": header([scene("s1", [
            block("ACTION-001", "action", calls=[],
                  next=[wire("out", "DIALOG-002"), wire("then", "DIALOG-001")]),
            dlg("DIALOG-001", "Right"),
            dlg("DIALOG-002", "Must not be taken"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "takes-then",
            "steps": [
                {"expect": {"type": "action", "blockId": "ACTION-001"}, "action": {"type": "resolveAction"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ACTION-001", "DIALOG-001"],
        }],
    },
    {
        "id": "v1-ports-resolve-to-nothing",
        "description": "A payload still wired on `true`/`false` routes nowhere. Names, not positions.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("switches", "door_unlocked", True)]}],
                  next=[wire("true", "DIALOG-001"), wire("false", "DIALOG-002")]),
            dlg("DIALOG-001", "Old true"), dlg("DIALOG-002", "Old false"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": True}},
        "cases": [{
            "id": "goes-nowhere",
            "steps": [{"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}}],
            "expectedVisited": ["COND-001"],
        }],
    },
]


# ── waitForBlocks ────────────────────────────────────────────────────────────
#
# The second of the two natives that are not inert, and it had no shared spec at all - which is how
# it went unnoticed that only parallel tracks read it. A designer who set it on a block of the main
# flow got nothing, silently, with the checkbox ticked in the editor. It is a property of the
# BLOCK: "the block waits for these before it advances", in the format's own words.
#
# It waits on blocks that have FINISHED, not on blocks that have been reached. Reached was the
# original rule and it made the property nearly inert in the shape designers actually draw: a fork
# into two blocks, then a join on both, lifts in the very tick it is registered because the two were
# dispatched a fraction of a millisecond earlier. A step with NO action is how these suites hold a
# block open - the handler runs, the block is dispatched, and next() is never called - which is the
# only way a shared spec can tell the two rules apart.

flow_suites += [
    {
        "id": "wait-for-blocks-main-track",
        "description": "waitForBlocks parks the MAIN flow too, not only a parallel track.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002")]),
            block("DIALOG-002", "dialog", text={"en": "waits"},
                  props={"waitForBlocks": ["DIALOG-404"]},
                  next=[wire("out", "DIALOG-003")]),
            dlg("DIALOG-003", "never reached"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "parks-before-dispatching",
            "description": "DIALOG-404 is not in the scene, so DIALOG-002 is never even dispatched.",
            # The wait holds the block BEFORE the handler is called: the game never learns
            # DIALOG-002 exists, so nothing of it reaches the screen. That is the engine's
            # decision, not a rendering choice - waitForBlocks is a native, and the designer who
            # ticks it in LSDE is owed the behaviour.
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001"],
            # The scene is CLOSED, as deadlocked. This suite used to pin it running, "parked, and
            # it resumes if the block it waits for is ever visited" - which cannot happen: the flow
            # parked is the only track, and nothing else will ever finish DIALOG-404. A deadlock
            # was only noticed when a track ENDED, and here the last one PARKS, so the scene stayed
            # open for good and a game awaiting its end waited forever.
            "expectedExitReason": "deadlocked",
            "expectedWaitingFor": ["DIALOG-404"],
        }],
    },
    {
        "id": "wait-for-blocks-already-satisfied",
        "description": "A wait on a block already visited lets the flow through at once.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002")]),
            block("DIALOG-002", "dialog", text={"en": "waits for the one behind it"},
                  props={"waitForBlocks": ["DIALOG-001"]},
                  next=[wire("out", "DIALOG-003")]),
            dlg("DIALOG-003", "reached"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "walks-through",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003"],
        }],
    },
    {
        "id": "wait-for-blocks-waits-for-completion",
        "description": "A join waits for the awaited block to FINISH, not to be dispatched.",
        "blueprint": header([scene("s1", [
            block("DIALOG-001", "dialog", text={"en": "forks and continues"},
                  next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            block("DIALOG-002", "dialog", text={"en": "held open"},
                  props={"isAsync": True}),
            block("DIALOG-003", "dialog", text={"en": "joins"},
                  props={"waitForBlocks": ["DIALOG-002"]},
                  next=[wire("out", "DIALOG-004")]),
            dlg("DIALOG-004", "after the join"),
        ])]),
        "sceneId": "s1",
        "cases": [
            {
                "id": "held-open-keeps-the-join-parked",
                "description": "DIALOG-002 is dispatched but never advances, so DIALOG-003 waits.",
                # The discriminating case. DIALOG-002 has been reached - it is in expectedVisited -
                # and DIALOG-003 is still not dispatched. Under the old rule DIALOG-003 would be in
                # that list too, having spoken over a block that had not said a word yet.
                "steps": [
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"},
                     "action": {"type": "next"}},
                    # No action: the block stays open, exactly like a bubble waiting for a click.
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}},
                ],
                "expectedVisited": ["DIALOG-001", "DIALOG-002"],
                "expectedRunning": True,
            },
            {
                "id": "finishing-it-releases-the-join",
                "description": "The same graph, with DIALOG-002 allowed to advance.",
                "steps": [
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"},
                     "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"},
                     "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-003"},
                     "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-004"},
                     "action": {"type": "next"}},
                ],
                "expectedVisited": [
                    "DIALOG-001", "DIALOG-002", "DIALOG-003", "DIALOG-004",
                ],
            },
        ],
    },
    {
        "id": "wait-for-blocks-every-id-must-finish",
        "description": "Two awaited blocks: the join lifts on the LAST one to finish.",
        "blueprint": header([scene("s1", [
            block("DIALOG-001", "dialog", text={"en": "forks twice"},
                  next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003"),
                        wire("out", "DIALOG-004")]),
            block("DIALOG-002", "dialog", text={"en": "finishes at once"},
                  props={"isAsync": True}),
            block("DIALOG-003", "dialog", text={"en": "held open"},
                  props={"isAsync": True}),
            block("DIALOG-004", "dialog", text={"en": "joins both"},
                  props={"waitForBlocks": ["DIALOG-002", "DIALOG-003"]}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "one-finished-is-not-enough",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"},
                 "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"},
                 "action": {"type": "next"}},
                # Held: DIALOG-004 must stay parked even though DIALOG-002 is done.
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003"],
            "expectedRunning": True,
        }],
    },
    {
        "id": "wait-for-blocks-async-track",
        "description": "The same rule on a parallel track: an unreachable wait parks the branch.",
        "blueprint": header([scene("s1", [
            block("DIALOG-001", "dialog", text={"en": "forks"},
                  next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "main"),
            block("DIALOG-003", "dialog", text={"en": "parallel, waits"},
                  props={"isAsync": True, "waitForBlocks": ["DIALOG-404"]},
                  next=[wire("out", "DIALOG-004")]),
            dlg("DIALOG-004", "never reached"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "the-branch-parks-the-main-flow-does-not",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002"],
            "orderIndependent": True,
        }],
    },
    {
        "id": "port-with-only-async-targets",
        "description": "A port whose every target is isAsync: the branches play, and the main flow "
                       "ending is not the scene ending.",
        # The first non-async target continues the track and the rest fork. With no non-async
        # target at all, the main flow has spawned every branch and has nothing left to walk - so
        # it ends immediately. That used to close the SCENE, cancelling the branches born one line
        # earlier: a real LSDE scene had three prayers on a delay behind such a port and not one of
        # them was ever dispatched.
        #
        # DIALOG-003 is handed no action, so it stays parked on the game's next(). It is the game's
        # turn, so the scene is still running - that is what `expectedRunning` pins here, and it is
        # the one half of this rule a synchronous spec can express.
        "blueprint": header([scene("s1", [
            block("DIALOG-001", "dialog", text={"en": "forks, both async"},
                  next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            block("DIALOG-002", "dialog", text={"en": "branch that answers"},
                  props={"isAsync": True}),
            block("DIALOG-003", "dialog", text={"en": "branch still holding its next()"},
                  props={"isAsync": True}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "every-branch-is-dispatched-and-the-scene-outlives-the-main-flow",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003"],
            "expectedRunning": True,
            "orderIndependent": True,
        }],
    },
]


validation_suites += [
    {
        "id": "scene-without-blocks",
        "description": "A scene carrying no block list loads: it just cannot play, like an empty one.",
        # It used to throw a TypeError straight out of init() in TypeScript - out of the one
        # function whose job is to refuse a payload and say why. It is normalised now, and the
        # thing worth saying is already said: the scene has no entry, so it cannot play.
        #
        # Not reported as its own code on purpose: "absent" and "empty" cannot be told apart in
        # every runtime - a C# List has an initializer, a C++ std::vector always exists - and a
        # diagnostic only three of the four could raise is a divergence, not a check.
        "blueprint": header([{"scene": "s1", "id": "sc_s1"}]),
        "cases": [{
            "id": "loads-but-cannot-play",
            "expectedErrors": [],
            "expectedWarnings": ["NO_START_BLOCK"],
            "expectedStats": {"sceneCount": 1, "blockCount": 0, "connectionCount": 0},
        }],
    },
    {
        "id": "unknown-wait-block",
        "description": "waitForBlocks naming a block outside the scene: it can never be visited.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002")]),
            block("DIALOG-002", "dialog", text={"en": "waits"},
                  props={"waitForBlocks": ["DIALOG-404"]}),
        ])]),
        "cases": [{"id": "warned", "expectedErrors": [], "expectedWarnings": ["UNKNOWN_WAIT_BLOCK"]}],
    },
]

# One port, several wires: the target's isAsync says whether it runs BESIDE this track or IN TURN
# on it. Every wire but the first used to be detached whichever way the box was ticked, so on a
# secondary wire the property was inert. MIGRATION-V2.md holds the decision.
flow_suites += [
    {
        "id": "wire-queue-walked-in-turn",
        "description": "Two non-async targets on one port: the second is walked after the first, not beside it.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Fork", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "Second"),
            dlg("DIALOG-003", "Third"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "one-after-the-other",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "text": "Fork"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002", "text": "Second"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003", "text": "Third"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003"],
            "expectedCleanupCalls": 3,
        }],
    },
    {
        "id": "wire-queue-depth-first",
        "description": "A branch and everything under it finish before its sibling starts.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-004")]),
            dlg("DIALOG-002", "B", next=[wire("out", "DIALOG-003")]),
            dlg("DIALOG-003", "C"),
            dlg("DIALOG-004", "Z"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "b-and-its-branch-then-z",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "text": "A"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002", "text": "B"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003", "text": "C"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-004", "text": "Z"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002", "DIALOG-003", "DIALOG-004"],
            "expectedCleanupCalls": 4,
        }],
    },
    {
        "id": "wire-queue-mixed",
        "description": "An isAsync target runs beside; the non-async ones stay this track's, in order.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "A", next=[
                wire("out", "DIALOG-002"), wire("out", "DIALOG-003"), wire("out", "DIALOG-004"),
            ]),
            dlg("DIALOG-002", "B"),
            dlg("DIALOG-003", "Beside", props={"isAsync": True}),
            dlg("DIALOG-004", "C"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "beside-first-then-the-queue",
            # The parallel track is opened while the wires are being sorted, so it is dispatched
            # before the continuation; B and C then follow on this track, in file order.
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "text": "A"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003", "text": "Beside"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002", "text": "B"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-004", "text": "C"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-003", "DIALOG-002", "DIALOG-004"],
            "expectedCleanupCalls": 4,
        }],
    },
]


# ── ROUTER and inPortPerCharacter ────────────────────────────────────────────
#
# The sixth block type and the entry port that names the speaker. Both were implemented in the
# reference runtime first, and nothing here exercised them - which is how the three ports shipped
# without either, and how a blueprint carrying a ROUTER played in TypeScript and stopped dead in
# Unity, Unreal and Godot. These suites are the transcription of `branch-queue.test.ts` (the
# ROUTER section) and `in-port-per-character.test.ts`, so a port cannot claim the feature without
# playing it.
#
# A ROUTER has NO handler: every true case launches its port and the tally picks `then` or `catch`
# before a handler could speak, so the engine dispatches nothing and advances on its own. It still
# counts as VISITED - the traversal marks a block reached before it looks for a handler - which is
# why it opens every `expectedVisited` below.


def rtr(bid, cases, **kw):
    return block(bid, "router", cases=cases, **kw)


ROUTER_CASES = [
    {"port": "K1", "when": [cmp_("switches", "door_unlocked", True)]},
    {"port": "K2", "when": [cmp_("switches", "met_vesk", True)]},
    {"port": "K3", "when": [cmp_("variables", "credits", 50, "greaterOrEqual")]},
]


def router_scene(async_routes):
    """A three-case router whose K* routes are, or are not, isAsync. The continuation ports are
    written FIRST in `next` on purpose: the order the flow follows is the order of the ports the
    router resolved - K1, K2, K3, then the continuation - never the order of the file."""
    route = {"isAsync": True} if async_routes else None
    return scene("s1", [
        rtr("ROUTER-001", ROUTER_CASES, next=[
            wire("then", "DIALOG-004"), wire("catch", "DIALOG-005"),
            wire("K1", "DIALOG-001"), wire("K2", "DIALOG-002"), wire("K3", "DIALOG-003"),
        ]),
        dlg("DIALOG-001", "Route one", props=route),
        dlg("DIALOG-002", "Route two", props=route),
        dlg("DIALOG-003", "Route three", props=route),
        dlg("DIALOG-004", "All of them held"),
        dlg("DIALOG-005", "One did not"),
    ])


flow_suites += [
    {
        "id": "router-all-true-beside",
        "description": "Every case true, routes isAsync: each runs on its own track, then continues at once.",
        "blueprint": header([router_scene(async_routes=True)]),
        "sceneId": "s1",
        "cases": [{
            "id": "three-tracks-then-then",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-004"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001", "DIALOG-002", "DIALOG-003", "DIALOG-004"],
            "expectedCleanupCalls": 4,
            "orderIndependent": True,
        }],
    },
    {
        "id": "router-one-false",
        "description": "One case false: the true routes still run, and the exit is catch.",
        "blueprint": header([router_scene(async_routes=False)]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.met_vesk": False}},
        "cases": [{
            "id": "k1-k3-then-catch",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-005"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001", "DIALOG-003", "DIALOG-005"],
            "expectedCleanupCalls": 3,
        }],
    },
    {
        "id": "router-none-true",
        "description": "No case true: catch alone, nothing launched.",
        "blueprint": header([router_scene(async_routes=False)]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {
            "switches.door_unlocked": False, "switches.met_vesk": False, "variables.credits": False,
        }},
        "cases": [{
            "id": "catch-alone",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-005"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-005"],
            "expectedCleanupCalls": 1,
        }],
    },
    {
        "id": "router-no-cases",
        "description": "A router with no case at all leaves by then, the way Promise.all([]) resolves.",
        "blueprint": header([scene("s1", [
            rtr("ROUTER-001", [], next=[wire("then", "DIALOG-001"), wire("catch", "DIALOG-002")]),
            dlg("DIALOG-001", "Nothing to check"),
            dlg("DIALOG-002", "Must not be taken"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "the-empty-tally-is-then",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001"],
        }],
    },
    {
        "id": "router-continuation-unwired",
        "description": "Neither then nor catch is wired: the routes are still walked, then the track ends.",
        "blueprint": header([scene("s1", [
            rtr("ROUTER-001", ROUTER_CASES[:2], next=[wire("K1", "DIALOG-001"), wire("K2", "DIALOG-002")]),
            dlg("DIALOG-001", "Route one"),
            dlg("DIALOG-002", "Route two"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "routes-then-the-end",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001", "DIALOG-002"],
            "expectedRunning": False,
        }],
    },
    {
        "id": "router-case-branch-depth-first",
        "description": "A route with its own chain finishes it before the next case starts.",
        "blueprint": header([scene("s1", [
            rtr("ROUTER-001", ROUTER_CASES[:2], next=[
                wire("K1", "DIALOG-001"), wire("K2", "DIALOG-002"), wire("then", "DIALOG-004"),
            ]),
            dlg("DIALOG-001", "Route one", next=[wire("out", "DIALOG-006")]),
            dlg("DIALOG-006", "Route one, continued"),
            dlg("DIALOG-002", "Route two"),
            dlg("DIALOG-004", "All of them held"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "k1-and-its-chain-then-k2-then-then",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-006"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-004"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001", "DIALOG-006", "DIALOG-002", "DIALOG-004"],
            "expectedCleanupCalls": 4,
        }],
    },
    {
        "id": "in-port-per-character",
        "description": "The wire names the speaker: one block, two entry ports, one actor offered per pass.",
        # `toPort` is a CARD ID here, not `in`. The block is dispatched once per wire, and on each
        # pass onResolveCharacter is handed that one actor only - `context.character` is the actor
        # the designer wired, whatever the whole cast would have produced. The default resolver
        # picks the first of the list it is given, which is exactly what makes the two passes
        # differ. A single `expectedVisited` entry: the visited set does not count passes.
        "blueprint": header([scene("s1", [
            rtr("ROUTER-001", ROUTER_CASES[:2], next=[
                {"port": "K1", "to": "DIALOG-001", "toPort": "var1"},
                {"port": "K2", "to": "DIALOG-001", "toPort": "var2"},
            ]),
            dlg("DIALOG-001", "Me too", actors=["var1", "var2"],
                props={"isAsync": True, "inPortPerCharacter": True}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "each-pass-speaks-as-its-wire-says",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "characterId": "var1"},
                 "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-001", "characterId": "var2"},
                 "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001"],
            "expectedCleanupCalls": 2,
        }],
    },
    {
        "id": "in-port-per-character-through-in",
        "description": "Entering through in names nobody: the whole cast is offered, as everywhere else.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Before", next=[wire("out", "DIALOG-002")]),
            dlg("DIALOG-002", "Me too", actors=["var1", "var2"], props={"inPortPerCharacter": True}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "the-default-resolver-takes-the-first-of-the-cast",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002", "characterId": "var1"},
                 "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "DIALOG-002"],
        }],
    },
]

routing_suites += [
    {
        "id": "router-all-true-in-turn",
        "description": "Every case true, routes not isAsync: K1, K2, K3 in turn, then the continuation - "
                       "the order of the resolved ports, never the order of the file.",
        "blueprint": header([router_scene(async_routes=False)]),
        "sceneId": "s1",
        "cases": [{
            "id": "k1-k2-k3-then-then",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-004"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001", "DIALOG-002", "DIALOG-003", "DIALOG-004"],
            "expectedCleanupCalls": 4,
        }],
    },
    {
        "id": "router-unwired-case-port",
        "description": "A true case with no wire contributes nothing, and is not an error.",
        "blueprint": header([scene("s1", [
            rtr("ROUTER-001", ROUTER_CASES[:2], next=[wire("K1", "DIALOG-001"), wire("then", "DIALOG-004")]),
            dlg("DIALOG-001", "Route one"),
            dlg("DIALOG-004", "All of them held"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "k1-then-then",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-004"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["ROUTER-001", "DIALOG-001", "DIALOG-004"],
        }],
    },
]

validation_suites += [
    {
        "id": "router-loads-clean",
        "description": "A router, and wires whose toPort is a card id, load with no error and no warning.",
        "blueprint": header([scene("s1", [
            rtr("ROUTER-001", ROUTER_CASES[:2], next=[
                {"port": "K1", "to": "DIALOG-001", "toPort": "var1"},
                {"port": "K2", "to": "DIALOG-001", "toPort": "var2"},
            ]),
            dlg("DIALOG-001", "Me too", actors=["var1", "var2"],
                props={"isAsync": True, "inPortPerCharacter": True}),
        ])]),
        "cases": [{
            "id": "clean",
            "expectedErrors": [],
            "expectedWarnings": [],
            "expectedStats": {"sceneCount": 1, "blockCount": 2, "connectionCount": 2},
        }],
    },
]

# ── Behaviours the reference tested alone ────────────────────────────────────
#
# Three rules every runtime implements and only the TypeScript unit suites pinned. The
# `resolveCondition` action existed in all four runners and no suite used it.

flow_suites += [
    {
        "id": "condition-handler-override",
        "description": "The handler may override the port the cases picked, with a PORT NAME.",
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  props={"portPerCase": True},
                  cases=[
                      {"port": "K1", "when": [cmp_("switches", "door_unlocked", True)]},
                      {"port": "K2", "when": [cmp_("switches", "met_vesk", True)]},
                  ],
                  next=[wire("K1", "DIALOG-001"), wire("K2", "DIALOG-002"), wire("default", "DIALOG-003")]),
            dlg("DIALOG-001", "One"), dlg("DIALOG-002", "Two"), dlg("DIALOG-003", "None"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"conditions": {"switches.door_unlocked": True, "switches.met_vesk": False}},
        "cases": [
            {
                "id": "overrides-a-match-with-default",
                "steps": [
                    {"expect": {"type": "condition", "blockId": "COND-001"},
                     "action": {"type": "resolveCondition", "port": "default"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["COND-001", "DIALOG-003"],
            },
            {
                "id": "overrides-with-a-case-that-did-not-hold",
                "steps": [
                    {"expect": {"type": "condition", "blockId": "COND-001"},
                     "action": {"type": "resolveCondition", "port": "K2"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["COND-001", "DIALOG-002"],
            },
        ],
    },
    {
        "id": "choice-memory-not-equals",
        "description": "notEquals on the reserved choice dictionary: true for a different answer.",
        "blueprint": header([scene("s1", [
            block("CHOICE-001", "choice",
                  options=[opt("C1", "Yes"), opt("C2", "No")],
                  next=[wire("C1", "COND-001"), wire("C2", "COND-001")]),
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("choice", "CHOICE-001", "C1", "notEquals")]}],
                  next=[wire("out", "DIALOG-001"), wire("default", "DIALOG-002")]),
            dlg("DIALOG-001", "You did not say yes"),
            dlg("DIALOG-002", "You said yes"),
        ])]),
        "sceneId": "s1",
        "cases": [
            {
                "id": "a-different-answer-holds",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                     "action": {"type": "selectChoice", "optionId": "C2"}},
                    {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["CHOICE-001", "COND-001", "DIALOG-001"],
            },
            {
                "id": "the-same-answer-does-not",
                "steps": [
                    {"expect": {"type": "choice", "blockId": "CHOICE-001"},
                     "action": {"type": "selectChoice", "optionId": "C1"}},
                    {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                    {"expect": {"type": "dialog", "blockId": "DIALOG-002"}, "action": {"type": "next"}},
                ],
                "expectedVisited": ["CHOICE-001", "COND-001", "DIALOG-002"],
            },
        ],
    },
    {
        "id": "choice-memory-never-reached",
        "description": "A CHOICE never reached answers false to equals and TRUE to notEquals.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Straight to the tests", next=[wire("out", "COND-001")]),
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("choice", "CHOICE-001", "C1")]}],
                  next=[wire("out", "DIALOG-002"), wire("default", "COND-002")]),
            block("COND-002", "condition",
                  cases=[{"port": "out", "when": [cmp_("choice", "CHOICE-001", "C1", "notEquals")]}],
                  next=[wire("out", "DIALOG-003"), wire("default", "DIALOG-004")]),
            block("CHOICE-001", "choice", options=[opt("C1", "Never offered")]),
            dlg("DIALOG-002", "Must not be taken"),
            dlg("DIALOG-003", "Never asked, so not C1"),
            dlg("DIALOG-004", "Must not be taken either"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "equals-is-false-not-equals-is-true",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "condition", "blockId": "COND-001"}, "action": {"type": "next"}},
                {"expect": {"type": "condition", "blockId": "COND-002"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001", "COND-001", "COND-002", "DIALOG-003"],
        }],
    },
    {
        "id": "note-as-start-block",
        "description": "A scene whose entry is a NOTE starts on the first real block behind it.",
        "blueprint": header([scene("s1", [
            block("NOTE-001", "note", note="Read me first", next=[wire("out", "DIALOG-001")]),
            dlg("DIALOG-001", "The real first line"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "steps-over-the-entry-note",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001"],
        }],
    },
    {
        "id": "note-only-scene",
        "description": "A scene made of notes alone plays nothing and ends at once.",
        "blueprint": header([scene("s1", [
            block("NOTE-001", "note", note="Only notes", next=[wire("out", "NOTE-002")]),
            block("NOTE-002", "note", note="Still nothing"),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "ends-without-dispatching",
            "steps": [],
            "expectedVisited": [],
            "expectedCleanupCalls": 0,
        }],
    },
]

# ── A per-scene export, loaded as several files ──────────────────────────────
#
# `blueprintFiles` replaces `blueprint`: the runner hands the list to init() the way its runtime
# spells it - `data: []` in TypeScript, `Files` in C#, `files` in C++ and GDScript. Each file
# carries the whole header, and the engine folds them after checking they come from one export.


def one_file(path):
    return header([scene(path, [dlg("DIALOG-001", "In " + path)])])


validation_suites += [
    {
        "id": "per-scene-files-merged",
        "description": "Two files of one export stack their scenes behind one header.",
        "blueprintFiles": [one_file("first"), one_file("second")],
        "cases": [{
            "id": "counts-both-scenes",
            "expectedErrors": [],
            "expectedWarnings": [],
            "expectedStats": {"sceneCount": 2, "blockCount": 2, "connectionCount": 0},
        }],
    },
    {
        "id": "per-scene-files-mismatched",
        "description": "Pieces of two different exports are refused by name.",
        "blueprintFiles": [one_file("first"), dict(one_file("second"), exportedAt="2026-09-08T00:00:00.000Z")],
        "cases": [{"id": "refused", "expectedErrors": ["MISMATCHED_EXPORTS"]}],
    },
    {
        "id": "per-scene-files-twice",
        "description": "The same file passed twice is the same scene twice.",
        "blueprintFiles": [one_file("first"), one_file("first")],
        "cases": [{"id": "refused", "expectedErrors": ["DUPLICATE_SCENE"]}],
    },
    {
        "id": "per-scene-files-empty",
        "description": "An empty list is no data at all. C++ cannot express this case (a payload "
                       "struct always exists) and its runner skips it, saying so.",
        "blueprintFiles": [],
        "cases": [{"id": "refused", "expectedErrors": ["MISSING_DATA"]}],
    },
]


# ══════════════════════════════════════════════════════════════════════════
# A scene is never left open with nothing able to move it (2026-09-12)
# ══════════════════════════════════════════════════════════════════════════
#
# Found during a Unity integration, every one reproduced before a line changed. A fault on a
# parallel track, or in any callback but the type handler, left the scene open; a deadlock was only
# noticed when a track ENDED, never when the last one PARKED; every synchronous next() added frames
# to the stack; and onSceneExit could not tell a finished scene from a broken one.
# MIGRATION-V2.md, "Revue d'intégration Unity", holds the decisions.
#
# New fields: `expectedExitReason`, `expectedWaitingFor`, `expectedThrow`, the `throw` action,
# `stateBridge.trueTimes` (true that many times, then false) and `requiresExceptions` - GDScript has
# no exceptions, and its runner skips those suites, saying so.

flow_suites += [
    {
        "id": "scene-end-reason-completed",
        "description": "onSceneExit is told why the scene ended: here, it ran out of graph.",
        "blueprint": header([scene("s1", [dlg("DIALOG-001", "The only line")])]),
        "sceneId": "s1",
        "cases": [{
            "id": "completed",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001"],
            "expectedExitReason": "completed",
        }],
    },
    {
        "id": "deadlock-when-the-last-track-parks",
        "description": "Two tracks waiting for each other close the scene, whichever parks last.",
        # DIALOG-002 opens beside and parks on DIALOG-003; the main flow then reaches DIALOG-003,
        # which parks on DIALOG-002. Nothing is left to finish either. The main flow parks LAST,
        # which is the case that used to hold the scene open for good.
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "forks", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            block("DIALOG-002", "dialog", text={"en": "waits for the main flow", "fr": "waits for the main flow"},
                  props={"isAsync": True, "waitForBlocks": ["DIALOG-003"]}),
            block("DIALOG-003", "dialog", text={"en": "waits for the branch", "fr": "waits for the branch"},
                  props={"waitForBlocks": ["DIALOG-002"]}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "closes-as-deadlocked",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["DIALOG-001"],
            "expectedExitReason": "deadlocked",
            # Each once, in the order the waits were registered: the branch parked first.
            "expectedWaitingFor": ["DIALOG-003", "DIALOG-002"],
        }],
    },
    {
        "id": "synchronous-loop-keeps-a-flat-stack",
        "description": "10000 condition-action passes advanced without waiting do not overflow the stack.",
        # Every pass used to add frames: processBlock called executeBlockHandler, which called
        # advanceToNextBlock, which called processBlock. The TypeScript walk died on a RangeError
        # after 694 passes; C# on a StackOverflowException, which no catch stops and which kills
        # the Unity process. Each step now hands the next back to a loop.
        "blueprint": header([scene("s1", [
            block("COND-001", "condition",
                  cases=[{"port": "out", "when": [cmp_("switches", "door_unlocked", True)]}],
                  next=[wire("out", "ACTION-001"), wire("default", "DIALOG-001")]),
            block("ACTION-001", "action",
                  calls=[{"fn": "give_item", "args": {"item": "keycard"}}],
                  next=[wire("then", "COND-001")]),
            dlg("DIALOG-001", "Out of the loop"),
        ])]),
        "sceneId": "s1",
        "stateBridge": {"trueTimes": {"switches.door_unlocked": 10000}},
        "cases": [{
            "id": "ten-thousand-passes",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
            ],
            "expectedVisited": ["COND-001", "ACTION-001", "DIALOG-001"],
            "expectedExitReason": "completed",
        }],
    },
    {
        "id": "fault-on-a-parallel-track-closes-the-scene",
        "description": "A handler that throws on an isAsync track closes the WHOLE scene, then surfaces.",
        "requiresExceptions": True,
        # DIALOG-003 opens beside the main flow and throws. The scene is closed first - DIALOG-001's
        # cleanup runs, the main flow never reaches DIALOG-002 - and only then does the exception
        # come out of start(). It used to escape through a main flow that had not finished leaving
        # DIALOG-001, which stayed running with nothing able to move it.
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "forks", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "never reached"),
            block("DIALOG-003", "dialog", text={"en": "throws", "fr": "throws"}, props={"isAsync": True}),
        ])]),
        "sceneId": "s1",
        "cases": [{
            "id": "closed-then-thrown",
            "steps": [
                {"expect": {"type": "dialog", "blockId": "DIALOG-001"}, "action": {"type": "next"}},
                {"expect": {"type": "dialog", "blockId": "DIALOG-003"}, "action": {"type": "throw"}},
            ],
            "expectedThrow": True,
            "expectedVisited": ["DIALOG-001", "DIALOG-003"],
            "expectedCleanupCalls": 1,
            "expectedExitReason": "faulted",
        }],
    },
]


def write(path, description, suites):
    doc = {
        "version": "2.0",
        "format": "lsde-blueprints",
        "formatVersion": 1,
        "description": description,
        "suites": suites,
    }
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(path, '->', len(suites), 'suites,',
          sum(len(s['cases']) for s in suites), 'cases')


write('tests/test-cases.json',
      'Playing a scene: input to expected output. Every runtime must produce the same walk.',
      flow_suites)
write('tests/test-init-validation.json',
      'What init() accepts and what it refuses, with the diagnostic code it reports.',
      validation_suites)
write('tests/test-port-routing.json',
      'Port resolution. This is the algorithm that must behave identically in all four runtimes.',
      routing_suites)

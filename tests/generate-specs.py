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
        "id": "multiple-non-async-fork",
        "description": "One port, two non-async targets: the second never becomes the main track.",
        "blueprint": header([scene("s1", [
            dlg("DIALOG-001", "Fork", next=[wire("out", "DIALOG-002"), wire("out", "DIALOG-003")]),
            dlg("DIALOG-002", "A"), dlg("DIALOG-003", "B"),
        ])]),
        "cases": [{"id": "warned", "expectedErrors": [], "expectedWarnings": ["MULTIPLE_NON_ASYNC_FORK"]}],
    },
    {
        "id": "async-fork-is-fine",
        "description": "The same fork with the extra target marked isAsync raises nothing.",
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
            # The scene is PARKED, not finished: no onSceneExit, and it resumes if the block it
            # waits for is ever visited. Every other suite ends, so the field defaults to false.
            "expectedRunning": True,
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

// LSDE Dialog Engine — Playground (C++ port of playground.ts)
//
// Loads a real LSDE v2 export and plays a scene. Read it as the shortest complete integration:
// init, a locale, the two resolvers, the four handlers. Everything the engine asks of a game is in
// here, and nothing else is needed.

#include <iostream>
#include <fstream>
#include <string>
#include <unordered_map>
#include <vector>

#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <lsde/json_loader.h>
#include <lsde/utils.h>

using namespace lsde;

namespace {

// ─── The game's state ────────────────────────────────────────────────────────
//
// A real game reads its own save here. What matters is the SHAPE of the answer: the engine hands
// over a test and expects true or false. It never reads a dictionary itself, never implements an
// operator, never knows what "credits" holds.

const std::unordered_map<std::string, std::unordered_map<std::string, PropertyValue>>& gameState() {
    static const std::unordered_map<std::string, std::unordered_map<std::string, PropertyValue>> state = {
        {"switches", {
            {"door_unlocked", true}, {"oracle_awake", false}, {"reactor_stable", false},
            {"met_vesk", true}, {"alarm_armed", true},
        }},
        {"variables", {
            {"chapter", 3.0}, {"credits", 80.0}, {"trust_kael", 2.0}, {"alarm_level", 3.0},
        }},
        {"items", {{"plasma_cell", 1.0}, {"keycard", 0.0}, {"ration", 2.0}}},
        {"flags", {
            {"faction", std::string("salvage")},
            {"last_port", std::string("reactor_deck")},
            {"player_callsign", std::string("Vane")},
        }},
    };
    return state;
}

double asNumber(const PropertyValue& value) {
    if (const double* number = std::get_if<double>(&value)) return *number;
    if (const bool* flag = std::get_if<bool>(&value)) return *flag ? 1.0 : 0.0;
    return 0.0;
}

std::string asText(const PropertyValue& value) {
    if (const std::string* text = std::get_if<std::string>(&value)) return *text;
    if (const bool* flag = std::get_if<bool>(&value)) return *flag ? "true" : "false";
    if (const double* number = std::get_if<double>(&value)) return std::to_string(*number);
    return "";
}

bool resolveCondition(const ConditionTest& test) {
    auto dict = gameState().find(test.dict);
    if (dict == gameState().end()) return false;
    auto entry = dict->second.find(test.entry);
    if (entry == dict->second.end()) return false;

    const PropertyValue& actual = entry->second;
    const PropertyValue& expected = test.value;

    if (test.op == ConditionOperator::Equals) return asText(actual) == asText(expected);
    if (test.op == ConditionOperator::NotEquals) return asText(actual) != asText(expected);
    if (test.op == ConditionOperator::LessThan) return asNumber(actual) < asNumber(expected);
    if (test.op == ConditionOperator::LessOrEqual) return asNumber(actual) <= asNumber(expected);
    if (test.op == ConditionOperator::GreaterThan) return asNumber(actual) > asNumber(expected);
    if (test.op == ConditionOperator::GreaterOrEqual) return asNumber(actual) >= asNumber(expected);
    return false;
}

std::string findBlueprint(int argc, char* argv[]) {
    if (argc > 1) return argv[1];

    std::string dir = ".";
    for (int i = 0; i < 10; ++i) {
        std::string candidate = dir + "/mock/blueprints/Engine-Conformance-Scene.blueprints.json";
        std::ifstream probe(candidate);
        if (probe.is_open()) return candidate;
        dir += "/..";
    }
    return "";
}

} // namespace

int main(int argc, char* argv[]) {
    std::string path = findBlueprint(argc, argv);
    if (path.empty()) {
        std::cout << "Usage: lsde_playground <blueprints.json>\n";
        return 1;
    }

    BlueprintExport blueprint = LsdeJson::parseFile(path);

    // ─── Init ────────────────────────────────────────────────────────────

    DialogueEngine engine;
    auto report = engine.init({blueprint});

    std::cout << "\n[init] " << report.errors.size() << " errors, "
              << report.warnings.size() << " warnings\n";
    for (const auto& e : report.errors) std::cout << "   ERROR " << e.code << ": " << e.message << "\n";
    for (const auto& w : report.warnings) std::cout << "   WARN  " << w.code << ": " << w.message << "\n";
    std::cout << "[stats] scenes=" << report.stats.sceneCount
              << " blocks=" << report.stats.blockCount
              << " wires=" << report.stats.connectionCount << "\n";

    if (!report.errors.empty()) return 1;

    engine.setLocale("fr");

    // Which actor of the block is the one speaking. `actors` is a CAST, and LSDE deliberately
    // refuses to say whether its order means "who speaks" or "who is present" — so the game
    // decides. Returning nullptr is legitimate: nobody available can carry this line.
    engine.onResolveCharacter([](const std::vector<Card>& actors) -> const Card* {
        return actors.empty() ? nullptr : &actors[0];
    });

    // The single game-state evaluator. It answers option visibility AND condition cases. Tests on
    // the reserved "choice" dictionary never reach it — the engine answers those from its history.
    engine.onResolveCondition(resolveCondition);

    // ─── The four handlers ───────────────────────────────────────────────

    engine.onDialog([](ISceneHandle*, const BlueprintBlock* block, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        // The engine hands the RAW string over and never looks inside it.
        auto line = LsdeUtils::GetLocalizedText(block->text);

        std::string who;
        for (const auto& actor : ctx->actors()) {
            if (!who.empty()) who += " + ";
            who += actor.name;
        }
        if (who.empty()) who = "-";

        std::cout << "\n[dialog] " << block->id << "  [" << who << "]";
        if (ctx->emotion() != nullptr) std::cout << " (" << ctx->emotion()->name << ")";
        std::cout << "\n   " << line.value_or("<no text in this export>") << "\n";

        next();
        return {};
    });

    engine.onChoice([](ISceneHandle*, const BlueprintBlock* block, IChoiceContext* ctx, std::function<void()> next) -> CleanupFn {
        std::cout << "\n[choice] " << block->id << "\n";

        // Every option comes tagged. Filtering is the game's call — greying a locked answer out is
        // a perfectly good use of the ones that are not visible.
        const RuntimeChoiceItem* picked = nullptr;
        for (const auto& option : ctx->options()) {
            bool offered = option.visible.value_or(true);
            auto text = LsdeUtils::GetLocalizedText(option.text);
            std::cout << "   " << (offered ? " " : "x") << " " << option.id
                      << "  " << text.value_or("") << "\n";
            if (offered && picked == nullptr) picked = &option;
        }

        if (picked == nullptr) {
            std::cout << "   (nothing to pick — the flow stops here)\n";
            next();
            return {};
        }

        std::cout << "   -> picking " << picked->id << "\n";
        ctx->selectChoice(picked->id);
        next();
        return {};
    });

    engine.onCondition([](ISceneHandle*, const BlueprintBlock* block, IConditionContext* ctx, std::function<void()> next) -> CleanupFn {
        // Optional: with a resolver installed the engine already picked the port. This is where a
        // game logs what matched, or overrides it with ctx->resolve("K2").
        std::cout << "\n[cond] " << block->id << "  cases:";
        std::string matched;
        for (const auto& c : ctx->cases()) {
            std::cout << " " << c.port << "=" << (c.result.value_or(false) ? "true" : "false");
            if (c.result.value_or(false)) {
                if (!matched.empty()) matched += ", ";
                matched += c.port;
            }
        }
        std::cout << "\n   matched: " << (matched.empty() ? "none -> default" : matched) << "\n";

        next();
        return {};
    });

    engine.onAction([](ISceneHandle*, const BlueprintBlock* block, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
        std::cout << "\n[action] " << block->id << "\n";
        for (const auto& call : ctx->calls()) {
            // `fn` is empty when the writer has not picked a function yet. A draft, not an error.
            std::cout << "   " << (call.fn.empty() ? "<no function picked>" : call.fn) << "(";
            bool first = true;
            for (const auto& arg : call.args) {
                if (!first) std::cout << ", ";
                std::cout << arg.first << "=" << asText(arg.second);
                first = false;
            }
            std::cout << ")\n";
        }

        ctx->resolve();
        next();
        return {};
    });

    // ─── Lifecycle ───────────────────────────────────────────────────────

    engine.onSceneEnter([](const SceneLifecycleArgs&) { std::cout << "\n[scene] entered\n"; });
    engine.onSceneExit([](const SceneLifecycleArgs&) { std::cout << "\n[scene] exited\n"; });

    // ─── Play ────────────────────────────────────────────────────────────
    //
    // A scene opens by its path OR by the id that survives a rename. Store the id anywhere outside
    // the payload — an asset, a save file — because the path changes when someone renames it.

    if (blueprint.scenes.empty()) {
        std::cout << "This export has no scene.\n";
        return 1;
    }

    const std::string& scenePath = blueprint.scenes[0].scene;
    auto handle = engine.scene(scenePath);
    handle->start();

    std::cout << "\n[end] visited " << handle->getVisitedBlocks().size() << " blocks, "
              << engine.getSceneConnections(scenePath).size() << " wires in the scene\n";

    return 0;
}

// LSDE Dialog Engine — Init validation + diagnostic report

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Validate a blueprint payload, and optionally cross-check it against what the game declares.
///
/// Structural checks: the format header, scene paths, block id uniqueness **within a scene**, the
/// entry block, link targets, and the blocks a `waitForBlocks` names. With `check`, also warns
/// about functions, dictionaries and cards the game does not know.
///
/// Errors mean the payload will not play correctly; warnings mean it will, but something looks
/// wrong. The header is read FIRST and a mismatch is fatal: a file the engine cannot read must be
/// refused by name, not half-played until a scene stops in the middle with nothing logged.
DiagnosticReport validateBlueprint(const InitOptions& options);

/// Fold the files of a per-scene export into one payload.
///
/// Each file carries the whole header, so the first supplies it and the rest only add scenes.
/// `project` and `exportedAt` are checked first: they are identical across the files of one export
/// and different across two, which is the only way to catch someone passing pieces of two exports.
/// Merging those would produce a payload whose dictionaries do not match its scenes, and nothing
/// downstream would notice.
///
/// Returns nullopt with `error` filled when the files do not belong together.
std::optional<BlueprintExport> mergePayloads(
    const std::vector<BlueprintExport>& payloads,
    std::optional<DiagnosticEntry>& error);

} // namespace lsde

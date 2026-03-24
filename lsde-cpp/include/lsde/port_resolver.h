// LSDE Dialog Engine — Port resolution (critical algorithm)
// Must be identical across all runtimes.

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Determine which outgoing connections to follow based on block type and context.
/// Returns ALL matching connections — the caller decides which are main vs async.
PortResolutionResult resolvePort(const PortResolutionInput& input);

} // namespace lsde

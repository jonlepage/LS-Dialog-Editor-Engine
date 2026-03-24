// LSDE Dialog Engine — Init validation + diagnostic report

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Validate blueprint data integrity and optionally cross-validate.
DiagnosticReport validateBlueprint(const InitOptions& options);

} // namespace lsde

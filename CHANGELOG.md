# Changelog

## v0.3.0 (2026-04-01)

### Features
- Add switch/dispatcher evaluation modes for condition blocks with 2D condition groups
- Implement unified condition resolver (`onResolveCondition`) for choice visibility and condition pre-evaluation
- Make `onCondition` handler optional when `onResolveCondition` is installed
- Add `RuntimeConditionGroup` with `portIndex` and `result` for pre-evaluated condition groups
- Add `enableDispatcher` native property for async multi-branch condition routing
- Add `evaluateConditionGroups()` utility across all runtimes (TS, C#, C++, GDScript)
- Port resolver supports `bool | int | int[]` condition results across all runtimes
- Add JSON loaders for LSDE blueprints using Newtonsoft.Json and System.Text.Json

### Fixes
- Fix character cache bug: async tracks consumed main track's pre-resolved character (all runtimes)

### Other
- Migrate documentation from `setChoiceFilter` to `onResolveCondition` across all locales (EN, FR, JA, ZH)
- Add integration and unit tests for onResolveCondition and condition evaluator
- Align playgrounds across TS, C#, C++ with identical output
- Deprecate `setChoiceFilter` (kept as alias for backward compatibility)



## v0.2.0 (2026-03-30)

### Features
- Add type-safe block overrides for dialog, choice, condition, and action handlers
- Add no-cleanup handler overloads for DIALOG, CHOICE, CONDITION, and ACTION
- Add playground for testing engine API with real blueprints
- Enhance block validation with character context
- Add waitForBlocks handling in AsyncTrack and improve block execution flow
- Enhance async track handling with waitForBlocks and track info API
- Update LsdeUtils imports to use new '@lsde/dialog-engine' path in documentation
- Externalize install instructions into shared documentation file
- Enhance integration and handler documentation for C++, C#, GDScript and TypeScript engines
- Add logo and HeroCode component with code snippets for multiple languages
- Update documentation for block lifecycle and choice visibility

### Fixes
- Fix SceneHandle path reference in block types documentation

### Other
- Update documentation for lifecycle, async tracks, and choice visibility
- Refactor integration documentation for LSDE engine
- Refactor block handlers to use unified action execution and condition evaluation methods across TypeScript, C#, C++, and GDScript
- Refactor documentation and code structure for Blueprint system
- Add Japanese and Chinese documentation for async tracks and lifecycle
- Update blueprint schema and types to include new properties for block execution control



## v0.1.1 (2026-03-27)

### Features
- Add publish script and update package management for npm and NuGet
- Add comprehensive Chinese documentation for LSDE Dialog Engine
- Add script to generate plain text LLM guide and API reference
- Enhance choice visibility handling and metadata structure
- Enhance localization support and refactor state bridge integration
- Enhance choice context and history tracking
- Add GitHub Actions workflow for documentation deployment
- Add link to full documentation in README
- Update runtime descriptions in README files with automation and native integration details
- Implement validation and diagnostic report for LSDE Dialog Engine
- Implement C# port of LSDE Dialog Engine utilities and validation
- Add 'NOTE' block type and enhance interface documentation
- Restructure documentation and enhance content
- Implement async track handling and validation for multiple non-async targets
- Add playground for testing IntelliSense and API usage

### Fixes
- Update banner image URLs to use raw GitHub links and correct French translations
- Add exports and engines fields to package.json, include LICENSE
- Update source links in runtime documentation
- Update contact information in license and README
- Translate all VitePress pages to English, fix GitHub link, add sharp corners CSS
- Set VitePress base path for GitHub Pages

### Other
- Refactor code structure for improved readability and maintainability
- Enhance documentation and integration for LSDE engine
- Refactor LSDE Dialog Engine: enhance scene handling, remove StateBridge, improve utility functions
- Refactor dialogue engine to enhance condition evaluation and handler registration
- Refactor block context handling to resolve characters through StateBridge
- Add README and banner image for LSDE Dialog Engine TypeScript implementation
- Add LSDE Dialog Engine core classes and playground example
- Add comprehensive tests for DialogueEngine functionality
- Update character port handling to use index instead of name
- Repository initialization with project structure

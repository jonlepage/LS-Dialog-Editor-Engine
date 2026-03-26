# Cross-Language Test Cases

This directory contains language-agnostic test specifications that every runtime must pass.

## Files

- `test-cases.json` — Main test suites: input → expected output
- `test-init-validation.json` — Validation and diagnostic tests
- `test-port-routing.json` — Port resolution tests for all block types

## How to use

Each runtime implements a generic test runner that:

1. Reads the JSON test files
2. Loads the referenced blueprint from `blueprints/`
3. Creates a `DialogueEngine` with a StateBridge configured from the test case
4. Registers recording handlers that capture visited blocks
5. Starts the scene
6. For each step: verifies `expect`, executes `action`
7. At the end: verifies `expectedVisited` and `expectedCleanupCalls`

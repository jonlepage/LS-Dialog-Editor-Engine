# LSDE Dialog Engine C# — Task Runner
# Usage: make <target>

.PHONY: build test runtime clean

## Build the entire solution
build:
	dotnet build

## Run all 42 cross-language tests
test:
	dotnet test --verbosity normal

## Run the mini-runtime with a blueprint file
## Usage: make runtime BP=../path/to/blueprint.json
runtime:
	dotnet run --project samples~/MiniRuntime -- $(BP)

## Clean build artifacts
clean:
	dotnet clean

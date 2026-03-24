cmake_minimum_required(VERSION 3.14)
project(lsde-dialog-engine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ─── Engine library — ZERO external dependencies ─────────────────────────────

add_library(lsde STATIC
    src/validator.cpp
    src/condition_evaluator.cpp
    src/port_resolver.cpp
    src/graph.cpp
    src/handler_registry.cpp
    src/block_context.cpp
    src/scene_handle.cpp
    src/engine.cpp
)

target_include_directories(lsde PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

# ─── Options ──────────────────────────────────────────────────────────────────

option(LSDE_BUILD_TESTS "Build cross-language tests" ON)
option(LSDE_BUILD_PLAYGROUND "Build playground sample" ON)

if(LSDE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

if(LSDE_BUILD_PLAYGROUND)
    add_subdirectory(samples/playground)
endif()

include(FetchContent)

# GoogleTest
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)

# nlohmann/json — tests only, NOT engine core
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)

# Avoid installing gtest system-wide
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
# Force gtest to use shared CRT on MSVC (avoid RuntimeLibrary mismatch)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(googletest json)

# Test data path (shared JSON specs)
set(TEST_DATA_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../tests")

add_executable(lsde_tests
    test_main.cpp
    json_deserializer.cpp
    cross_language_runner.cpp
)

target_link_libraries(lsde_tests PRIVATE
    lsde
    GTest::gtest
    nlohmann_json::nlohmann_json
)

target_compile_definitions(lsde_tests PRIVATE
    TEST_DATA_DIR="${TEST_DATA_DIR}"
)

include(GoogleTest)
gtest_discover_tests(lsde_tests)

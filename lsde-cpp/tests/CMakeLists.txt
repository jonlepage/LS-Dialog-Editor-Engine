include(FetchContent)

# GoogleTest
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)

# Avoid installing gtest system-wide
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
# Force gtest to use shared CRT on MSVC (avoid RuntimeLibrary mismatch)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(googletest)

# Test data path (shared JSON specs)
set(TEST_DATA_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../tests")

add_executable(lsde_tests
    test_main.cpp
    json_deserializer.cpp
    cross_language_runner.cpp
    json_loader_test.cpp
    condition_integration_test.cpp
)

target_link_libraries(lsde_tests PRIVATE
    lsde_json
    GTest::gtest
)

target_compile_definitions(lsde_tests PRIVATE
    TEST_DATA_DIR="${TEST_DATA_DIR}"
)

include(GoogleTest)
gtest_discover_tests(lsde_tests)

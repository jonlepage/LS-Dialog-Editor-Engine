include(FetchContent)

FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

add_executable(lsde_playground main.cpp)
target_link_libraries(lsde_playground PRIVATE lsde nlohmann_json::nlohmann_json)

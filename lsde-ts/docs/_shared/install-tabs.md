::: code-group
```bash [TypeScript]
npm install @lsde/dialog-engine
```
```bash [C#]
dotnet add package LsdeDialogEngine
```
```bash [C++ (CMake)]
# Add as a git submodule
git submodule add https://github.com/jonlepage/LS-Dialog-Editor-Engine.git deps/lsde

# CMakeLists.txt
add_subdirectory(deps/lsde/lsde-cpp)
target_link_libraries(your_target PRIVATE lsde)
```
```bash [Unreal Engine]
# Copy the headers and source into your project
# e.g. Source/YourModule/ThirdParty/lsde/

cp -r lsde-cpp/include/lsde  YourProject/Source/YourModule/ThirdParty/lsde/include
cp -r lsde-cpp/src/*          YourProject/Source/YourModule/ThirdParty/lsde/src

# In your module's .Build.cs, add:
# PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "ThirdParty/lsde/include"));
# Add the .cpp files from ThirdParty/lsde/src/ to your module
```
```bash [GDScript]
# Clone the repository
git clone https://github.com/jonlepage/LS-Dialog-Editor-Engine.git

# Copy the addon into the Godot project
mkdir -p addons
cp -r LS-Dialog-Editor-Engine/lsde-gdscript/addons/lsde addons/lsde
rm -rf LS-Dialog-Editor-Engine
```
:::

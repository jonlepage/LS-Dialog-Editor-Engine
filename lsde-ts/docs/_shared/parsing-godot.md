::: code-group
```gdscript [JSON (native)]
var file = FileAccess.open("res://blueprint.json", FileAccess.READ)
var data = JSON.parse_string(file.get_as_text())
file.close()

engine.init({"data": data})
# No polymorphism issues — GDScript uses dynamic Dictionaries.
```
```gdscript [XML — XMLParser (native)]
var parser = XMLParser.new()
parser.open("res://blueprint.xml")
# Walk parser events → build Dictionary matching BlueprintExport structure.
# See Godot docs: XMLParser class reference.
```
:::

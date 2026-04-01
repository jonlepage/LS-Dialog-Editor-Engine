::: info Companion packages
If you use `LsdeDialogEngine.Newtonsoft` or `LsdeDialogEngine.SystemTextJson`, these converters are already included — just call `LsdeJson.Parse(json)`. The code below is for manual integration only.
:::

### CSharp — Newtonsoft.Json (Unity)

```csharp
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using LsdeDialogEngine;

class BlueprintBlockNewtonsoftConverter : JsonConverter<BlueprintBlock>
{
    public override BlueprintBlock ReadJson(JsonReader reader, Type objectType,
        BlueprintBlock existingValue, bool hasExistingValue, JsonSerializer serializer)
    {
        var obj = JObject.Load(reader);
        var type = obj["type"]?.ToString();
        BlueprintBlock block = type switch
        {
            "DIALOG"    => new DialogBlock(),
            "CHOICE"    => new ChoiceBlock(),
            "CONDITION" => new ConditionBlock(),
            "ACTION"    => new ActionBlock(),
            "NOTE"      => new NoteBlock(),
            _           => throw new JsonException($"Unknown block type: {type}")
        };
        serializer.Populate(obj.CreateReader(), block);
        return block;
    }

    public override void WriteJson(JsonWriter writer, BlueprintBlock value, JsonSerializer serializer)
        => serializer.Serialize(writer, value, value.GetType());
}
```

### CSharp — System.Text.Json (.NET 5+)

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

class BlueprintBlockConverter : JsonConverter<BlueprintBlock>
{
    public override BlueprintBlock Read(ref Utf8JsonReader reader, Type typeToConvert,
        JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        var root = doc.RootElement;
        var type = root.GetProperty("type").GetString();
        var json = root.GetRawText();
        return type switch
        {
            "DIALOG"    => JsonSerializer.Deserialize<DialogBlock>(json, options)!,
            "CHOICE"    => JsonSerializer.Deserialize<ChoiceBlock>(json, options)!,
            "CONDITION" => JsonSerializer.Deserialize<ConditionBlock>(json, options)!,
            "ACTION"    => JsonSerializer.Deserialize<ActionBlock>(json, options)!,
            "NOTE"      => JsonSerializer.Deserialize<NoteBlock>(json, options)!,
            _           => throw new JsonException($"Unknown block type: {type}")
        };
    }

    public override void Write(Utf8JsonWriter writer, BlueprintBlock value,
        JsonSerializerOptions options)
        => JsonSerializer.Serialize(writer, value, value.GetType(), options);
}

class BlockPropertyValueConverter : JsonConverter<object>
{
    public override object Read(ref Utf8JsonReader reader, Type typeToConvert,
        JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.String => reader.GetString(),
            JsonTokenType.Number => reader.TryGetInt64(out var l) ? (object)(double)l : reader.GetDouble(),
            JsonTokenType.True   => true,
            JsonTokenType.False  => false,
            JsonTokenType.Null   => null,
            _                    => throw new JsonException($"Unexpected token {reader.TokenType}")
        };
    }

    public override void Write(Utf8JsonWriter writer, object value, JsonSerializerOptions options)
        => JsonSerializer.Serialize(writer, value, options);
}
```

### CPP — nlohmann/json

```cpp
#include <nlohmann/json.hpp>
#include <lsde/types.h>

void from_json(const nlohmann::json& j, std::unique_ptr<lsde::BlueprintBlock>& block) {
    auto type = j.at("type").get<std::string>();
    if      (type == "DIALOG")    block = std::make_unique<lsde::DialogBlock>();
    else if (type == "CHOICE")    block = std::make_unique<lsde::ChoiceBlock>();
    else if (type == "CONDITION") block = std::make_unique<lsde::ConditionBlock>();
    else if (type == "ACTION")    block = std::make_unique<lsde::ActionBlock>();
    else if (type == "NOTE")      block = std::make_unique<lsde::NoteBlock>();
    else throw std::runtime_error("Unknown block type: " + type);
    j.get_to(*block);
}
```

using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

namespace LsdeDialogEngine.Json
{
    /// <summary>
    /// JSON loader for LSDE blueprints using System.Text.Json.
    /// Handles polymorphic deserialization of BlueprintBlock subtypes.
    /// </summary>
    public static class LsdeJson
    {
        /// <summary>Pre-configured options with polymorphic converters and camelCase naming.</summary>
        public static JsonSerializerOptions Options { get; } = CreateOptions();

        /// <summary>Parse a JSON string into a BlueprintExport.</summary>
        public static BlueprintExport Parse(string json)
            => JsonSerializer.Deserialize<BlueprintExport>(json, Options)
               ?? throw new JsonException("Failed to deserialize BlueprintExport");

        private static JsonSerializerOptions CreateOptions()
        {
            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            };
            options.Converters.Add(new JsonStringEnumConverter());
            options.Converters.Add(new BlueprintBlockConverter());
            options.Converters.Add(new BlockPropertyValueConverter());
            return options;
        }
    }

    internal class BlueprintBlockConverter : JsonConverter<BlueprintBlock>
    {
        public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(BlueprintBlock);

        public override BlueprintBlock Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeProp))
                throw new JsonException("BlueprintBlock missing 'type' field");
            var typeStr = typeProp.GetString();
            var json = root.GetRawText();
            return typeStr switch
            {
                "DIALOG" => JsonSerializer.Deserialize<DialogBlock>(json, options)!,
                "CHOICE" => JsonSerializer.Deserialize<ChoiceBlock>(json, options)!,
                "CONDITION" => JsonSerializer.Deserialize<ConditionBlock>(json, options)!,
                "ACTION" => JsonSerializer.Deserialize<ActionBlock>(json, options)!,
                "NOTE" => JsonSerializer.Deserialize<NoteBlock>(json, options)!,
                _ => throw new JsonException($"Unknown block type: {typeStr}"),
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            BlueprintBlock value,
            JsonSerializerOptions options)
            => JsonSerializer.Serialize(writer, value, value.GetType(), options);
    }

    internal class BlockPropertyValueConverter : JsonConverter<object>
    {
        public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(object);

        public override object? Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options)
        {
            return reader.TokenType switch
            {
                JsonTokenType.String => reader.GetString(),
                JsonTokenType.Number => reader.TryGetInt64(out var l)
                    ? (object)(double)l
                    : reader.GetDouble(),
                JsonTokenType.True => true,
                JsonTokenType.False => false,
                JsonTokenType.Null => null,
                _ => throw new JsonException($"Unexpected token {reader.TokenType}"),
            };
        }

        public override void Write(
            Utf8JsonWriter writer,
            object value,
            JsonSerializerOptions options)
            => JsonSerializer.Serialize(writer, value, options);
    }
}

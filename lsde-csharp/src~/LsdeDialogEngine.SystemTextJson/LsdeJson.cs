using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using LsdeDialogEngine;

namespace LsdeDialogEngine.Json
{
    /// <summary>
    /// JSON loader for LSDE blueprints using System.Text.Json.
    /// <para>The polymorphic block converter is gone: v2 has ONE Block whose optional fields depend
    /// on its Type, so there is nothing left to dispatch on while reading. That is also why the
    /// engine reads camelCase JSON only — the naming policy below already does the conversion, and
    /// renaming keys inside the payload would corrupt the three bags whose KEYS are the game's own
    /// data: Text, Props and Args.</para>
    /// </summary>
    public static class LsdeJson
    {
        /// <summary>Pre-configured options with camelCase naming and loose value reading.</summary>
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
            options.Converters.Add(new LooseValueConverter());
            options.Converters.Add(new TolerantVersionConverter());
            return options;
        }
    }

    /// <summary>
    /// Reads the untyped values of the payload's three open bags — Props, Args and a condition's
    /// Value — as plain bool, double or string.
    /// <para>Without it System.Text.Json hands back a JsonElement, and every game reading
    /// props["typewriterSpeed"] would have to unwrap it. Their KEYS and their types belong to the
    /// project, so the engine reads them and passes them on without interpreting either.</para>
    /// </summary>
    public class LooseValueConverter : JsonConverter<object>
    {
        /// <summary>Claims the untyped slots only, never a typed field.</summary>
        public override bool CanConvert(Type typeToConvert) => typeToConvert == typeof(object);

        /// <summary>Reads one untyped value as bool, double, string, or a list of strings
        /// for waitForBlocks — the one native that carries a list.</summary>
        public override object? Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.String:
                    return reader.GetString();
                case JsonTokenType.Number:
                    return reader.TryGetInt64(out var whole) ? (double)whole : reader.GetDouble();
                case JsonTokenType.True:
                    return true;
                case JsonTokenType.False:
                    return false;
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.StartArray:
                {
                    // waitForBlocks is the one native holding a LIST rather than a scalar.
                    var items = new System.Collections.Generic.List<string>();
                    while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
                    {
                        if (reader.TokenType == JsonTokenType.String)
                        {
                            var item = reader.GetString();
                            if (item != null) items.Add(item);
                        }
                    }
                    return items;
                }
                default:
                    throw new JsonException($"Unexpected token {reader.TokenType}");
            }
        }

        /// <summary>Writes the value back with its own runtime type.</summary>
        public override void Write(
            Utf8JsonWriter writer,
            object value,
            JsonSerializerOptions options)
            => JsonSerializer.Serialize(writer, value, value.GetType(), options);
    }

    /// <summary>
    /// Reads the format version as a number, tolerating the string a v1 payload wrote there.
    /// <para>v1 had <c>"version": "1.0.0"</c>. Without this, a game handed an old export gets a
    /// deserializer exception about token types — while the engine has a diagnostic that names the
    /// problem and says what to do. Refusing a payload is the loader's job, not the parser's, so
    /// the parse has to survive long enough for the validator to speak.</para>
    /// </summary>
    public class TolerantVersionConverter : JsonConverter<int>
    {
        /// <summary>Reads the version as a number, accepting the string a v1 payload wrote
        /// there so the validator gets to report the problem instead of the parser.</summary>
        public override int Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Number) return reader.GetInt32();

            if (reader.TokenType == JsonTokenType.String)
            {
                // "1.0.0" → 1, so UNSUPPORTED_FORMAT_VERSION can name it. A v1 file has no
                // `format` at all, so INVALID_FORMAT fires first anyway.
                var raw = reader.GetString() ?? "";
                var head = raw.Split('.')[0];
                return int.TryParse(head, out var parsed) ? parsed : 0;
            }

            return 0;
        }

        /// <summary>Writes the version back as a plain number.</summary>
        public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options)
            => writer.WriteNumberValue(value);
    }
}

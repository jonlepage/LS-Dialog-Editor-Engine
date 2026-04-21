using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using LsdeDialogEngine;

namespace LsdeDialogEngine.Newtonsoft
{
    /// <summary>
    /// JSON loader for LSDE blueprints using Newtonsoft.Json.
    /// Handles polymorphic deserialization of BlueprintBlock subtypes.
    /// Recommended for Unity projects (com.unity.nuget.newtonsoft-json).
    /// </summary>
    public static class LsdeJson
    {
        /// <summary>Pre-configured settings with polymorphic converters and camelCase naming.</summary>
        public static JsonSerializerSettings Settings { get; } = CreateSettings();

        /// <summary>Parse a JSON string into a BlueprintExport.</summary>
        public static BlueprintExport Parse(string json)
            => JsonConvert.DeserializeObject<BlueprintExport>(json, Settings)
               ?? throw new JsonException("Failed to deserialize BlueprintExport");

        private static JsonSerializerSettings CreateSettings()
        {
            return new JsonSerializerSettings
            {
                ContractResolver = new CamelCasePropertyNamesContractResolver(),
                Converters = { new BlueprintBlockNewtonsoftConverter() },
            };
        }
    }

    internal class BlueprintBlockNewtonsoftConverter : JsonConverter<BlueprintBlock>
    {
        public override BlueprintBlock ReadJson(
            JsonReader reader,
            Type objectType,
            BlueprintBlock? existingValue,
            bool hasExistingValue,
            JsonSerializer serializer)
        {
            var obj = JObject.Load(reader);
            var type = obj["type"]?.ToString();
            BlueprintBlock block = type switch
            {
                "DIALOG" => new DialogBlock(),
                "CHOICE" => new ChoiceBlock(),
                "CONDITION" => new ConditionBlock(),
                "ACTION" => new ActionBlock(),
                "NOTE" => new NoteBlock(),
                _ => throw new JsonException($"Unknown block type: {type}")
            };
            serializer.Populate(obj.CreateReader(), block);
            return block;
        }

        public override void WriteJson(
            JsonWriter writer,
            BlueprintBlock? value,
            JsonSerializer serializer)
        {
            if (value != null)
                serializer.Serialize(writer, value, value.GetType());
        }
    }
}

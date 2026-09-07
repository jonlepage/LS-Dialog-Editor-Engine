using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using LsdeDialogEngine;

namespace LsdeDialogEngine.Newtonsoft
{
    /// <summary>
    /// JSON loader for LSDE blueprints using Newtonsoft.Json.
    /// Recommended for Unity projects (com.unity.nuget.newtonsoft-json).
    /// <para>The polymorphic block converter is gone: v2 has ONE Block whose optional fields depend
    /// on its Type, so there is nothing left to dispatch on while reading. That is also why the
    /// engine reads camelCase JSON only — the naming policy below already does the conversion, and
    /// renaming keys inside the payload would corrupt the three bags whose KEYS are the game's own
    /// data: Text, Props and Args.</para>
    /// </summary>
    public static class LsdeJson
    {
        /// <summary>Pre-configured settings with camelCase naming.</summary>
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
            };
        }
    }
}

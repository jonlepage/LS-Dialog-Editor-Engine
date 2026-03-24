// LSDE Dialog Engine — Shared helpers (C# port of utils.ts)

namespace LsdeDialogEngine
{
    public static class Utils
    {
        public static bool IsDialogBlock(BlueprintBlock block) => block is DialogBlock;
        public static bool IsChoiceBlock(BlueprintBlock block) => block is ChoiceBlock;
        public static bool IsConditionBlock(BlueprintBlock block) => block is ConditionBlock;
        public static bool IsActionBlock(BlueprintBlock block) => block is ActionBlock;
        public static bool IsNoteBlock(BlueprintBlock block) => block is NoteBlock;

        public static BlockCharacter? GetFirstCharacter(BlueprintBlock block)
        {
            var characters = block.Metadata?.Characters;
            if (characters != null && characters.Count > 0)
                return characters[0];
            return null;
        }
    }
}

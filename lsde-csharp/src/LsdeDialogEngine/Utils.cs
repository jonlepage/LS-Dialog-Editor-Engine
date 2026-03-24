// LSDE Dialog Engine — Shared helpers (C# port of utils.ts)

namespace LsdeDialogEngine
{
    public static class Utils
    {
        public static bool IsDialogBlock(BlueprintBlock block) => block.Type == BlockType.DIALOG;
        public static bool IsChoiceBlock(BlueprintBlock block) => block.Type == BlockType.CHOICE;
        public static bool IsConditionBlock(BlueprintBlock block) => block.Type == BlockType.CONDITION;
        public static bool IsActionBlock(BlueprintBlock block) => block.Type == BlockType.ACTION;
        public static bool IsNoteBlock(BlueprintBlock block) => block.Type == BlockType.NOTE;

        public static BlockCharacter? GetFirstCharacter(BlueprintBlock block)
        {
            var characters = block.Metadata?.Characters;
            if (characters != null && characters.Count > 0)
                return characters[0];
            return null;
        }
    }
}

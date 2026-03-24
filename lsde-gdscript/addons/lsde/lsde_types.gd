## LSDE Dialog Engine — Type constants and base classes
class_name LsdeTypes
extends RefCounted

enum BlockType { DIALOG, CHOICE, CONDITION, ACTION, NOTE }

## Convert string block type from JSON to enum
static func parse_block_type(type_str: String) -> int:
	match type_str:
		"DIALOG": return BlockType.DIALOG
		"CHOICE": return BlockType.CHOICE
		"CONDITION": return BlockType.CONDITION
		"ACTION": return BlockType.ACTION
		"NOTE": return BlockType.NOTE
	return BlockType.NOTE

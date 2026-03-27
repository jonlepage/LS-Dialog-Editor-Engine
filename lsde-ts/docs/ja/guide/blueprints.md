# Blueprint と Scene

## Blueprint の構造

`BlueprintExport` は LS-Dialog エディターから出力される JSON ファイルです。engine が必要とするすべてのデータを含んでいます。

```ts
interface BlueprintExport {
  version: string;
  exportDate: string;
  projectName?: string;
  primaryLanguage?: string;
  locales: string[];           // Available languages
  dictionaries?: Dictionary[]; // Named value groups
  signatures?: ActionSignature[]; // Reusable action signatures
  scenes: BlueprintScene[];    // Dialogue scenes
}
```

## Scene

各 scene は、エントリーポイントを持つ独立したサブグラフです：

```ts
interface BlueprintScene {
  uuid: string;
  label: string;
  note?: string;
  entryBlockId?: string;       // First block to execute
  date: string;
  blocks: BlueprintBlock[];    // All blocks in the scene
  connections: BlueprintConnection[]; // Graph edges
}
```

## Connection

connection は、block の出力 port を次の block の入力 port に接続します：

```ts
interface BlueprintConnection {
  id: string;
  fromId: string;              // Source block UUID
  toId: string;                // Target block UUID
  fromPort: string;            // Output port name
  toPort: string;              // Input port name
  fromPortIndex?: number;      // Port index (portPerCharacter)
}
```

## Dictionary

dictionary は、condition や action パラメーターで使用される名前付き値セットを定義します：

```ts
interface Dictionary {
  uuid: string;
  label?: string;
  valueType: 'string' | 'number' | 'boolean';
  rows: DictionaryRow[];
}
```

## Action Signature

signature は、パラメーター付きの再利用可能な action タイプを記述します：

```ts
interface ActionSignature {
  uuid: string;
  id: string;                  // Unique identifier (e.g. "set_flag")
  label?: string;
  params: SignatureParam[];
}
```

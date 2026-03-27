# Blueprint 与 Scene

## Blueprint 结构

`BlueprintExport` 是从 LS-Dialog 编辑器导出的 JSON 文件。它包含 engine 所需的全部数据。

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

每个 scene 是一个独立的子图，拥有一个入口点：

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

Connection 将一个 block 的输出 port 连接到下一个 block 的输入 port：

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

Dictionary 定义了 condition 和 action 参数所使用的命名值集合：

```ts
interface Dictionary {
  uuid: string;
  label?: string;
  valueType: 'string' | 'number' | 'boolean';
  rows: DictionaryRow[];
}
```

## Action Signature

Signature 描述了可复用的 action 类型及其参数：

```ts
interface ActionSignature {
  uuid: string;
  id: string;                  // Unique identifier (e.g. "set_flag")
  label?: string;
  params: SignatureParam[];
}
```

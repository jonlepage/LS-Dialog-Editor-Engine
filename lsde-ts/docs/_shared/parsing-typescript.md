::: code-group
```ts [JSON — import (bundler)]
// Bundlers (Vite, Webpack, esbuild) auto-parse .json imports.
import blueprintJson from './blueprint.json';
engine.init({ data: blueprintJson });
```
```ts [JSON — manual]
const json = fs.readFileSync('./blueprint.json', 'utf-8');
engine.init({ data: JSON.parse(json) });
// No polymorphism issues — JS objects are dynamically typed.
```
```ts [XML — fast-xml-parser]
// npm install fast-xml-parser
import { XMLParser } from 'fast-xml-parser';
const xml = fs.readFileSync('./blueprint.xml', 'utf-8');
const parser = new XMLParser({ ignoreAttributes: false });
const data = parser.parse(xml);
engine.init({ data });
```
```ts [YAML — yaml]
// npm install yaml
import { parse } from 'yaml';
const yml = fs.readFileSync('./blueprint.yaml', 'utf-8');
engine.init({ data: parse(yml) });
```
:::

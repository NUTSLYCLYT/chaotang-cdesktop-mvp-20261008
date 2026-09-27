import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { resolve } from 'node:path';

// Node's built-in TypeScript stripping does not implement the application's
// Vite `@/` alias. Bundle the adapter with the repository's existing esbuild
// dependency so contract tests run without a dev server or extra loader.
const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'acceptanceChaotangClient.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(
  compiled.outputFiles[0].text
).toString('base64')}`;

export const { createAcceptanceChaotangClient } = await import(moduleUrl);

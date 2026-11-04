/** POS-001: validate real workspace manifests, without requiring pnpm or network. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const expected = new Map([
  ['apps/desktop', '@smartpos/desktop'],
  ['apps/api', '@smartpos/api'],
  ['packages/contracts', '@smartpos/contracts'],
  ['packages/domain', '@smartpos/domain'],
  ['packages/db', '@smartpos/db'],
  ['packages/config', '@smartpos/config'],
]);
const errors = [];
const file = (name) => join(root, name);
const rootPkg = JSON.parse(readFileSync(file('package.json'), 'utf8'));
const workspace = readFileSync(file('pnpm-workspace.yaml'), 'utf8');
const lock = readFileSync(file('pnpm-lock.yaml'), 'utf8');
if (rootPkg.packageManager !== 'pnpm@10.20.0') errors.push('Expected pnpm@10.20.0');
if (rootPkg.engines?.node !== '>=24 <25') errors.push('Expected pinned Node 24 engine');
if (rootPkg.devDependencies?.typescript !== '5.9.3') errors.push('Expected TypeScript 5.9.3');
if (!workspace.includes("'apps/*'") || !workspace.includes("'packages/*'")) errors.push('Workspace globs missing');
if (!lock.includes("lockfileVersion: '9.0'") || !lock.includes('typescript@5.9.3')) errors.push('Lockfile invalid');
for (const [dir, name] of expected) {
  const pkgFile = file(dir + '/package.json');
  const tsFile = file(dir + '/tsconfig.json');
  const srcFile = file(dir + '/src/index.ts');
  if (!existsSync(pkgFile) || !existsSync(tsFile) || !existsSync(srcFile)) {
    errors.push('Missing workspace files for ' + dir);
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const config = JSON.parse(readFileSync(tsFile, 'utf8'));
  if (pkg.name !== name || pkg.private !== true || !pkg.scripts?.typecheck) errors.push('Invalid manifest in ' + dir);
  if (config.extends !== '../../tsconfig.base.json' || config.compilerOptions?.noEmit !== true) errors.push('Invalid tsconfig in ' + dir);
  if (!lock.includes(dir + ': {}')) errors.push('Missing pnpm-lock importer: ' + dir);
}
if (errors.length) {
  console.error('POS-001 workspace validation failed:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('POS-001 workspace structure valid: ' + expected.size + ' packages, TypeScript and lockfile declared.');
}

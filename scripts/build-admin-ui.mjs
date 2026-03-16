import { mkdir, rm, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const sourceDir = join(rootDir, 'src', 'admin-ui');
const publicDir = join(rootDir, 'public');
const adminDir = join(publicDir, 'admin');

async function ensureCleanOutput() {
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(adminDir, { recursive: true });
}

async function copyShellFiles() {
  await copyFile(join(sourceDir, 'index.html'), join(adminDir, 'index.html'));
  await copyFile(join(sourceDir, 'styles.css'), join(publicDir, 'styles.css'));
}

async function bundleClient() {
  await build({
    entryPoints: [join(sourceDir, 'app.ts')],
    outfile: join(publicDir, 'app.js'),
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    platform: 'browser',
    sourcemap: true,
    charset: 'utf8',
    logLevel: 'info',
  });
}

async function main() {
  await ensureCleanOutput();
  await copyShellFiles();
  await bundleClient();
}

void main();

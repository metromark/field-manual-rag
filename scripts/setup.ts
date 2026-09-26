/**
 * First-run setup on a fresh clone:  npm ci && npm run setup
 * Checks the Node version, creates .env.local from .env.example, and
 * prints the remaining steps. Safe to re-run; never overwrites .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';

const MIN_NODE = 22;
const root = process.cwd();

const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE) {
  console.error(`Node ${MIN_NODE}+ required (found ${process.versions.node}). Run \`nvm use\` to pick up .nvmrc.`);
  process.exit(1);
}
console.log(`✓ Node ${process.versions.node}`);

const envLocal = path.join(root, '.env.local');
if (fs.existsSync(envLocal)) {
  console.log('✓ .env.local exists (left unchanged)');
} else {
  fs.copyFileSync(path.join(root, '.env.example'), envLocal);
  console.log('✓ Created .env.local from .env.example');
}

const missing = ['OPENAI_API_KEY', 'UPSTASH_VECTOR_REST_URL', 'UPSTASH_VECTOR_REST_TOKEN'].filter(
  (k) => !new RegExp(`^${k}=\\S+`, 'm').test(fs.readFileSync(envLocal, 'utf8')),
);

console.log('\nNext steps:');
if (missing.length) console.log(`  1. Fill in ${missing.join(', ')} in .env.local`);
console.log('  2. npm run seed -- --corpus fm21-76   # embed the corpus into Upstash');
console.log('  3. npm run dev                        # http://localhost:3000');

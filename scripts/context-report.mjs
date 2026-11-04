/** Read-only evidence collector. Does NOT sync GitHub or mark a task done. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
const root = process.cwd();
const status = readFileSync(join(root, 'project-management/DEVELOPMENT_STATUS.md'), 'utf8');
const handoff = readFileSync(join(root, 'project-management/SESSION_HANDOFF.md'), 'utf8');
const find = (key) => status.split('\n').find((l) => l.startsWith(`${key}:`))?.slice(key.length + 1).trim() ?? 'MISSING';
const git = (...args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
  catch { return 'NOT VERIFIED'; }
};
const rootGit = git('rev-parse','--show-toplevel') !== 'NOT VERIFIED' && resolve(git('rev-parse','--show-toplevel')) === resolve(root);
const head = rootGit ? git('rev-parse','HEAD') : 'NOT VERIFIED';
const branch = rootGit ? git('branch','--show-current') : 'NOT VERIFIED';
const working = rootGit ? git('status','--porcelain') : 'NOT VERIFIED';
const snapshot = find('verified_commit');
console.log('SmartPOS — read-only context report (local workspace only)');
console.log(`Timestamp UTC: ${new Date().toISOString()}`);
console.log(`Git branch: ${branch}`);
console.log(`Git HEAD: ${head}`);
console.log(`Uncommitted files: ${working === 'NOT VERIFIED' ? 'NOT VERIFIED' : working ? 'YES' : 'NO'}`);
console.log(`Document verified_commit: ${snapshot}`);
console.log(`Current milestone: ${find('current_milestone')}`);
console.log(`CI status in document: ${find('ci_status')}`);
console.log(`Last GitHub sync in document: ${find('last_github_synced_at')}`);
console.log(`Handoff present: ${handoff.trim() ? 'YES (not proof of recency)' : 'NO'}`);
console.log(`Snapshot compared with HEAD: ${head !== 'NOT VERIFIED' && /^[0-9a-f]{40}$/.test(snapshot) ? (snapshot === head ? 'MATCH' : 'DIFFERENT — VERIFY DOCUMENTS') : 'NOT VERIFIED'}`);
console.log('This script does not query GitHub, Neon or CI, and does not write to files.');

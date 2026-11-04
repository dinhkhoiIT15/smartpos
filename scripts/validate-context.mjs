/** M0 structural/document validator; no application tests or remote services. */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
const root = process.cwd();
const required = [
  'AGENTS.md','README.md','CONTRIBUTING.md','SECURITY.md',
  '.env.example','.gitignore','.editorconfig','.gitattributes','.prettierrc.json',
  'package.json','pnpm-workspace.yaml','.node-version','tsconfig.base.json',
  '.github/workflows/ci.yml','.github/workflows/validate-docs.yml',
  '.github/ISSUE_TEMPLATE/feature.yml','.github/ISSUE_TEMPLATE/bug.yml',
  '.github/pull_request_template.md',
  'docs/PROJECT_OVERVIEW.md','docs/PRODUCT_REQUIREMENTS.md','docs/BUSINESS_RULES.md',
  'docs/SYSTEM_ARCHITECTURE.md','docs/DATABASE_SCHEMA.md','docs/OFFLINE_SYNC_DESIGN.md',
  'docs/SECURITY.md','docs/API_DOCUMENTATION.md','docs/TEST_PLAN.md',
  'docs/DEVELOPMENT_SETUP.md','docs/ENVIRONMENT_MATRIX.md','docs/LOCAL_BACKUP_RECOVERY.md',
  'docs/REQUIREMENTS_TRACEABILITY.md','docs/GLOSSARY.md','docs/CODING_CONVENTIONS.md','docs/NEON_SETUP.md',
  'docs/adr/ADR-0001-architecture.md','docs/adr/ADR-0002-offline-commerce.md',
  'docs/adr/ADR-0003-scope-mvp.md','docs/adr/ADR_TEMPLATE.md',
  'project-management/ROADMAP.md','project-management/TODO.md',
  'project-management/DEVELOPMENT_STATUS.md','project-management/SESSION_HANDOFF.md',
  'project-management/CHANGELOG.md','project-management/BUG_TRACKER.md',
  'project-management/DECISIONS.md','project-management/BACKLOG.csv',
  'project-management/BACKLOG_GUIDE.md','project-management/GITHUB_SETUP.md',
  'project-management/M0_CHECKLIST.md','project-management/RISK_REGISTER.md',
  'project-management/CHANGE_REQUEST.md','project-management/REPOSITORY_INTAKE.md',
  'scripts/validate-context.mjs','scripts/context-report.mjs','tests/README.md',
];
const errors=[];
for(const file of required){
  const p=join(root,file);
  if(!existsSync(p)) errors.push(`Missing file: ${file}`);
  else if(!readFileSync(p,'utf8').trim()) errors.push(`Empty file: ${file}`);
}
if(!errors.length){
  const packageJson=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  if(!packageJson.private) errors.push('Root package.json must be private');
  if(!packageJson.scripts?.['docs:check']) errors.push('Missing docs:check script');
  const backlog=readFileSync(join(root,'project-management/BACKLOG.csv'),'utf8').replace(/^\uFEFF/,'');
  const ids=[...backlog.matchAll(/^POS-\d{3},/gm)].map(m=>m[0].slice(0,7));
  if(ids.length!==30) errors.push(`Expected 30 planned backlog issues, found ${ids.length}`);
  if(new Set(ids).size!==ids.length) errors.push('Duplicate backlog IDs');
  const status=readFileSync(join(root,'project-management/DEVELOPMENT_STATUS.md'),'utf8');
  if(!status.includes('verified_commit:')) errors.push('Status file lacks verified_commit');
  if(!status.includes('ci_status:')) errors.push('Status file lacks ci_status');
  const prd=readFileSync(join(root,'docs/PRODUCT_REQUIREMENTS.md'),'utf8');
  if(!prd.includes('LOCKED BASELINE')) errors.push('PRD lacks LOCKED BASELINE');
  const trace=readFileSync(join(root,'docs/REQUIREMENTS_TRACEABILITY.md'),'utf8');
  for(let n=1;n<=11;n++) if(!trace.includes(`FR-${String(n).padStart(2,'0')}`)) errors.push(`Traceability missing FR-${n}`);
  // Verify relative markdown links in authored documents only; ignore links to anchors/external URLs.
  for(const file of required.filter(f=>f.endsWith('.md'))){
    const doc=readFileSync(join(root,file),'utf8');
    for(const m of doc.matchAll(/\]\(([^)]+)\)/g)){
      const target=m[1].trim().split(' ')[0];
      if(!target || target.startsWith('#') || /^[a-z]+:\/\//i.test(target) || target.startsWith('mailto:')) continue;
      const raw=decodeURIComponent(target.split('#')[0]);
      if(!raw || isAbsolute(raw)) continue;
      const candidate=resolve(dirname(join(root,file)),raw);
      if(relative(root,candidate).startsWith('..') || !existsSync(candidate)) errors.push(`Broken local link in ${file}: ${target}`);
    }
  }
}
if(errors.length){console.error('M0 validation failed:\n- '+errors.join('\n- ')); process.exitCode=1;}
else console.log(`M0 documentation validation passed: ${required.length} required files; 30 planned backlog issues. NOT application tests.`);

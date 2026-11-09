import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('POS-026 local financial reporting remains MAIN-only and no live HTTP route',()=>{
 const main=read('../src/main/index.ts'),preload=read('../src/preload/index.ts');
 const bridge=read('../src/renderer/src/desktop-bridge.d.ts');
 const app=read('../src/renderer/src/app.tsx');
 const api=read('../../api/src/main.ts');
 for(const [name,source] of [['Electron MAIN',main],['preload',preload],
  ['bridge',bridge],['renderer',app]]) {
  assert.doesNotMatch(source,/readLocalSalesReport|SalesReportService|\/v1\/reports\/sales/,
   name+' must not load real reports before D-013');
 }
 assert.doesNotMatch(api,/salesReport:|SalesReportService|registerSalesReportRoutes/);
 assert.match(main,/mode: 'DEMO_ONLY'/);
 assert.match(app,/DemoSalesReport/);
});
test('POS-026 read projection never mutates local finance/outbox or touches network',()=>{
 const source=read('../src/main/local-db/sales-report.ts');
 assert.match(source,/loadCommittedLocalReceipt/);
 assert.match(source,/SERVER_ACKED_MIRROR/);
 assert.match(source,/LOCAL_NEEDS_REVIEW_UNCONFIRMED/);
 assert.match(source,/combinedCloudLocalTotalAvailable:false/);
 assert.doesNotMatch(source,/\b(?:UPDATE|DELETE|INSERT|DROP|ALTER)\s+(?:local_sales|local_payments|local_sale_items|outbox_events)\b/i);
 assert.doesNotMatch(source,/\bfetch\s*\(|\baxios\b|DATABASE_URL|ipcMain|ipcRenderer|process\.env/);
 const demo=read('../src/renderer/src/sales-report-demo.tsx');
 assert.match(demo,/FIXED SYNTHETIC RECORDS ONLY/);
 assert.match(demo,/DEMO-001/);
 assert.match(demo,/SERVER_ACKED_MIRROR/);
 assert.doesNotMatch(demo,/\bfetch\s*\(|\baxios\b|window\.smartpos|ipcRenderer|DATABASE_URL/);
});

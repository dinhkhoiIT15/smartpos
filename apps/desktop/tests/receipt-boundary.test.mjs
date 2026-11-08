import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('POS-020 committed sale/receipt never exposed from Electron main/preload/demo renderer', () => {
  const main = read('../src/main/index.ts');
  const preload = read('../src/preload/index.ts');
  const renderer = read('../src/renderer/src/app.tsx');
  const bridge = read('../src/renderer/src/desktop-bridge.d.ts');
  for(const [name,contents] of [
    ['Electron main',main],['preload',preload],['renderer',renderer],['bridge',bridge],
  ]) {
    assert.doesNotMatch(contents,/loadCommittedLocalReceipt|buildPersistedInternalReceipt|commitLocalCashSale/,
      name+' must not expose protected sale evidence before D-013 signed grants');
  }
  assert.match(main,/mode: 'DEMO_ONLY'/);
  assert.match(renderer,/createDemoInternalReceipt/);
  assert.match(preload,/getAppInfo/);
});
test('sample receipt UI and print CSS both enforce non-tax watermark and no paid result',()=>{
  const ui = read('../src/renderer/src/internal-receipt.tsx');
  const css = read('../src/renderer/src/styles.css');
  assert.match(ui,/receipt\.kind !== 'DEMO'/);
  assert.match(ui,/receipt\.watermark !== DEMO_RECEIPT_WATERMARK/);
  assert.match(ui,/INTERNAL_RECEIPT_NOTICE/);
  assert.match(ui,/window\.print\(\)/);
  assert.match(ui,/KHÔNG CÓ MÃ ĐƠN|saleCode/);
  assert.match(css,/@media print/);
  assert.match(css,/\.receipt-watermark, \.receipt-end strong/);
  assert.match(css,/visibility: visible!important/);
});

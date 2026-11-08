import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersistedInternalReceipt,createDemoInternalReceipt,
  formatReceiptTimeInVietnam,DEMO_RECEIPT_WATERMARK,INTERNAL_RECEIPT_NOTICE,
  type ReceiptInput,
} from './receipt.js';
import {addCartVariant,type CartCatalogVariant} from './cart.js';

const phone: CartCatalogVariant = {
  variantId:'f82563fe-8545-495e-98d1-ebcbf747b166',
  sku:'PHONE-128',name:'Điện thoại 128GB',attributes:{storage:'128GB'},
  priceVnd:'8990000',availableQty:5,active:true,
};
const cover: CartCatalogVariant = {
  variantId:'3b565a61-1a19-4662-b488-ae6916fe75c9',
  sku:'CASE-01',name:'Ốp lưng',attributes:{color:'Đen'},
  priceVnd:'350000',availableQty:10,active:true,
};
const at='2026-11-08T02:10:00.000Z';
const saleId='a30a8273-45d8-4f97-9331-1d24592c419d';
const cashierId='96c16974-ff25-4a35-b635-8bc31f71a3ed';
function realReceipt():ReceiptInput{
  return {
    saleId,cashierId,clientCreatedAt:at,syncStatus:'PENDING_SYNC',
    items:[
      {sku:phone.sku,name:phone.name,attributes:phone.attributes,
        quantity:1,unitPriceVnd:'8990000',discountVnd:'0',lineTotalVnd:'8990000'},
      {sku:cover.sku,name:cover.name,attributes:cover.attributes,
        quantity:1,unitPriceVnd:'350000',discountVnd:'0',lineTotalVnd:'350000'},
    ],
    dueVnd:'9340000',tenderedVnd:'9500000',changeVnd:'160000',
  };
}
test('POS-020 demo receipt ALWAYS shows watermark, lacks sale ID and includes BR-002 totals',()=>{
  const cart=addCartVariant(addCartVariant([],phone),cover);
  const receipt=createDemoInternalReceipt(cart,'9500000',at);
  assert.equal(receipt.kind,'DEMO');
  assert.equal(receipt.watermark,DEMO_RECEIPT_WATERMARK);
  assert.equal(receipt.saleCode,'KHÔNG CÓ MÃ ĐƠN');
  assert.equal(receipt.cashierLabel,'THU NGÂN MẪU');
  assert.equal(receipt.syncLabel,'CHƯA LƯU • CHƯA THU TIỀN');
  assert.equal(receipt.notice,INTERNAL_RECEIPT_NOTICE);
  assert.equal(receipt.createdAtLocal,'08/11/2026 09:10:00 (VN)');
  assert.deepEqual(receipt.items.map(l=>l.sku),['PHONE-128','CASE-01']);
  assert.equal(receipt.subtotalVnd,'9340000');
  assert.equal(receipt.discountTotalVnd,'0');
  assert.equal(receipt.dueVnd,'9340000');
  assert.equal(receipt.tenderedVnd,'9500000');
  assert.equal(receipt.changeVnd,'160000');
  assert.equal(JSON.stringify(receipt).includes('9.340.000'),false);
  assert.equal('paid' in receipt,false);
  assert.equal('vat' in receipt,false);
});
test('persisted receipt distinguishes local pending, synced and review without claiming server ACK',()=>{
  const pending=buildPersistedInternalReceipt(realReceipt());
  assert.equal(pending.kind,'PERSISTED');
  assert.equal(pending.watermark,null);
  assert.equal(pending.saleCode,saleId);
  assert.equal(pending.cashierLabel,cashierId);
  assert.match(pending.syncLabel,/CHƯA ĐỒNG BỘ/);
  assert.match(buildPersistedInternalReceipt({...realReceipt(),syncStatus:'SYNCED'}).syncLabel,/THEO TRẠNG THÁI LOCAL/);
  assert.match(buildPersistedInternalReceipt({...realReceipt(),syncStatus:'NEEDS_REVIEW'}).syncLabel,/CẦN ĐỐI SOÁT/);
  assert.throws(()=>buildPersistedInternalReceipt({...realReceipt(),syncStatus:'HACK' as never}),/RECEIPT_SYNC_STATE/);
});
test('line discount correct; amount due excludes only aggregate line discounts',()=>{
  const r=realReceipt();
  const lines=r.items.map((line,i)=>i===0?{...line,discountVnd:'90000',lineTotalVnd:'8900000'}:line);
  const receipt=buildPersistedInternalReceipt({...r,items:lines,dueVnd:'9250000',changeVnd:'250000'});
  assert.equal(receipt.subtotalVnd,'9340000');
  assert.equal(receipt.discountTotalVnd,'90000');
  assert.equal(receipt.dueVnd,'9250000');
  assert.equal(receipt.changeVnd,'250000');
});
test('all value arithmetic stays exact above JS Number.MAX_SAFE_INTEGER',()=>{
  const huge='9007199254740993';
  const r=realReceipt();
  const receipt=buildPersistedInternalReceipt({
    ...r,items:[{...r.items[0]!,unitPriceVnd:huge,lineTotalVnd:huge}],
    dueVnd:huge,tenderedVnd:'9007199254740994',changeVnd:'1',
  });
  assert.equal(receipt.dueVnd,huge);
  assert.equal(receipt.subtotalVnd,huge);
  assert.equal(receipt.changeVnd,'1');
});
test('rejects missing, underpaid, inconsistent cash, overflow and noncanonical money',()=>{
  const base=realReceipt();
  const invalid=[
    {...base,dueVnd:'9000000'},
    {...base,changeVnd:'0'},
    {...base,tenderedVnd:'9000000'},
    {...base,tenderedVnd:'9.500.000'},
    {...base,tenderedVnd:'09500000'},
    {...base,tenderedVnd:'9223372036854775808'},
    {...base,items:[{...base.items[0]!,lineTotalVnd:'1'},base.items[1]!] },
    {...base,items:[{...base.items[0]!,quantity:2},base.items[1]!] },
    {...base,items:[{...base.items[0]!,unitPriceVnd:'9223372036854775807',
      lineTotalVnd:'9223372036854775807',quantity:2}]},
    {...base,items:[]},
    {...base,items:[base.items[0]!,base.items[0]!] },
  ];
  for (const item of invalid) assert.throws(()=>buildPersistedInternalReceipt(item),/RECEIPT_|VND amount/);
  const cart=addCartVariant([],phone);
  assert.throws(()=>createDemoInternalReceipt(cart,'1000',at),/RECEIPT_INSUFFICIENT_CASH/);
  assert.throws(()=>createDemoInternalReceipt([],'1000',at),/RECEIPT_ITEMS/);
});
test('rejects malformed item labels/attributes and invalid UUID/timestamps',()=>{
  const base=realReceipt();
  for(const changed of [
    {...base,saleId:'untrusted'},
    {...base,cashierId:'wrong-id'},
    {...base,clientCreatedAt:'2026-11-08T02:10:00Z'},
    {...base,clientCreatedAt:'2026-02-30T02:10:00.000Z'},
    {...base,items:[{...base.items[0]!,sku:'lower-sku'},base.items[1]!] },
    {...base,items:[{...base.items[0]!,name:' name'},base.items[1]!] },
    {...base,items:[{...base.items[0]!,attributes:{BAD:'1'}},base.items[1]!] },
    {...base,items:[{...base.items[0]!,attributes:{color:'\u0000'}},base.items[1]!] },
  ]) assert.throws(()=>buildPersistedInternalReceipt(changed),/RECEIPT_/);
});
test('Vietnam timezone is deterministic across UTC day boundary; no browser local timezone dependency',()=>{
  assert.equal(formatReceiptTimeInVietnam('2026-11-08T18:30:00.000Z'),
    '09/11/2026 01:30:00 (VN)');
  assert.equal(formatReceiptTimeInVietnam('2026-11-08T00:00:00.000Z'),
    '08/11/2026 07:00:00 (VN)');
});

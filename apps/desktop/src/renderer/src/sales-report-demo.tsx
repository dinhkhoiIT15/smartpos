import {useMemo,useState} from 'react';
import {formatVnd} from '@smartpos/domain/cart';

/** POS-026 FIXED SYNTHETIC RECORDS ONLY; no HTTP, SQLite, IPC or real data.
 * Exactly the same demo sale appears in cloud and local ACK mirror to make
 * dedup semantics visible; DO NOT claim a global total from these sources.
 */
type DemoKind='CLOUD_POSTED'|'SERVER_ACKED_MIRROR'|
 'LOCAL_PENDING'|'LOCAL_NEEDS_REVIEW_UNCONFIRMED';
type DemoSale=Readonly<{saleId:string;day:string;cashier:string;sku:string;
 amount:string;kind:DemoKind;origin:'Cloud giả lập'|'SQLite giả lập'}>;
const examples:readonly DemoSale[]=[
 {saleId:'DEMO-001',day:'2026-11-08',cashier:'Thu ngân A',
  sku:'PHONE-128',amount:'9340000',kind:'CLOUD_POSTED',origin:'Cloud giả lập'},
 {saleId:'DEMO-001',day:'2026-11-08',cashier:'Thu ngân A',
  sku:'PHONE-128',amount:'9340000',kind:'SERVER_ACKED_MIRROR',origin:'SQLite giả lập'},
 {saleId:'DEMO-002',day:'2026-11-08',cashier:'Thu ngân B',
  sku:'CASE-01',amount:'350000',kind:'LOCAL_PENDING',origin:'SQLite giả lập'},
 {saleId:'DEMO-003',day:'2026-11-09',cashier:'Thu ngân A',
  sku:'PHONE-128',amount:'8990000',kind:'LOCAL_NEEDS_REVIEW_UNCONFIRMED',
  origin:'SQLite giả lập'},
];
const names:Record<DemoKind,string>={
 CLOUD_POSTED:'Server đã ghi nhận (mẫu)',
 SERVER_ACKED_MIRROR:'Bản sao local đã ACK (không cộng lại)',
 LOCAL_PENDING:'Đang chờ đồng bộ (mẫu)',
 LOCAL_NEEDS_REVIEW_UNCONFIRMED:'Cần đối soát, chưa rõ server (mẫu)',
};
const kinds=Object.keys(names) as DemoKind[];
export function DemoSalesReport(){
 const [day,setDay]=useState('ALL');
 const [cashier,setCashier]=useState('ALL');
 const [sku,setSku]=useState('ALL');
 const [kind,setKind]=useState<'ALL'|DemoKind>('ALL');
 const records=useMemo(()=>examples.filter(s=>
  (day==='ALL'||s.day===day)&&(cashier==='ALL'||s.cashier===cashier)&&
  (sku==='ALL'||s.sku===sku)&&(kind==='ALL'||s.kind===kind)
 ),[day,cashier,sku,kind]);
 const totals=useMemo(()=>kinds.map(k=>({
  kind:k,rows:records.filter(x=>x.kind===k),
  grossVnd:records.filter(x=>x.kind===k)
   .reduce((sum,x)=>sum+BigInt(x.amount),0n).toString(),
 })),[records]);
 return <div className="page">
  <div className="eyebrow">MILESTONE M5 / POS-026 — DEMO</div>
  <h1>Lịch sử &amp; báo cáo bán hàng <span className="hello">✳</span></h1>
  <p className="subhead">Minh họa báo cáo theo ngày, nhân viên, SKU và tình trạng
   đồng bộ. Các nguồn phải được đối soát, không cộng trùng doanh thu.</p>
  <section className="warning" role="status">
   <span className="warning-icon">!</span>
   <div><strong>CHỈ DỮ LIỆU GIẢ LẬP — KHÔNG PHẢI DOANH THU CỬA HÀNG</strong>
    <p>Bốn dòng cố định trong React, trong đó DEMO-001 được thể hiện ở cả cloud
     và bản sao SQLite đã ACK. Không đọc PostgreSQL/SQLite, không kết nối API,
     không có chứng thực nhân viên, không lưu hoặc gửi dữ liệu. Đây không phải
     chứng từ thuế hay báo cáo chốt sổ.</p>
   </div>
  </section>
  <section className="report-filters" aria-label="Bộ lọc báo cáo mẫu">
   <label>Ngày (giờ VN)
    <select value={day} onChange={e=>setDay(e.target.value)}>
     <option value="ALL">Tất cả</option><option value="2026-11-08">08/11/2026</option>
     <option value="2026-11-09">09/11/2026</option>
    </select>
   </label>
   <label>Nhân viên
    <select value={cashier} onChange={e=>setCashier(e.target.value)}>
     <option value="ALL">Tất cả</option><option>Thu ngân A</option>
     <option>Thu ngân B</option>
    </select>
   </label>
   <label>SKU
    <select value={sku} onChange={e=>setSku(e.target.value)}>
     <option value="ALL">Tất cả</option><option>PHONE-128</option>
     <option>CASE-01</option>
    </select>
   </label>
   <label>Nguồn / tình trạng
    <select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>
     <option value="ALL">Tất cả — không cộng tổng</option>
     {kinds.map(value=><option key={value} value={value}>{names[value]}</option>)}
    </select>
   </label>
  </section>
  <section className="report-stats" aria-label="Phân nhóm số tiền mẫu">
   {totals.map(group=><article className="report-stat" key={group.kind}>
    <span>{names[group.kind]}</span>
    <strong>{formatVnd(group.grossVnd)}</strong>
    <small>{group.rows.length} dòng mẫu • {group.kind==='SERVER_ACKED_MIRROR'
     ? 'KHÔNG CỘNG LẠI VÀO CLOUD' :group.kind==='LOCAL_NEEDS_REVIEW_UNCONFIRMED'
     ? 'CHƯA XÁC NHẬN SERVER':'PHÂN NHÓM RIÊNG'}</small>
   </article>)}
  </section>
  <div className="report-info">Không có chỉ tiêu “tổng doanh thu cloud + offline”
   vì khoản chưa xác nhận có thể đã tồn tại trên server và local ACK là bản sao.</div>
  <section className="checkout-panel report-history" aria-label="Lịch sử bán hàng mẫu">
   <div className="checkout-heading">
    <div><h2>Giao dịch giả lập</h2><p>Lưu ý mã DEMO-001 xuất hiện ở hai nguồn,
     nhưng chỉ có một giao dịch trên server.</p></div>
    <span className="cart-count">{records.length} bản ghi mẫu</span>
   </div>
   <div className="report-table-wrap">
    <table className="report-table">
     <thead><tr><th>Mã đơn</th><th>Ngày VN</th><th>Thu ngân</th>
      <th>SKU</th><th>Trạng thái</th><th>Số tiền (VND)</th></tr></thead>
     <tbody>{records.map((s,i)=><tr key={s.kind+s.saleId+i}>
      <td><strong>{s.saleId}</strong><small>{s.origin}</small></td>
      <td>{s.day}</td><td>{s.cashier}</td><td>{s.sku}</td>
      <td>{names[s.kind]}</td><td className="report-money">{formatVnd(s.amount)}</td>
     </tr>)}</tbody>
    </table>
    {records.length===0&&<p className="empty-copy">Không có dòng mẫu khớp bộ lọc.</p>}
   </div>
  </section>
  <footer>POS-026 DEMO ONLY • Không xuất dữ liệu thật • Không có tổng liên nguồn</footer>
 </div>;
}

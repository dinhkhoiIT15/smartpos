import {useMemo, useState} from 'react';
import {formatVnd} from '@smartpos/domain/cart';

/**
 * POS-024 UI mock: fixed synthetic records only, no backend, no IPC, no writes.
 * The REAL server audit and role enforcement are opt-in internal test services.
 * Do not connect this view to a network route before D-013/POS-025.
 */
type DemoConflict = Readonly<{
  id: string; sale: string; kind: 'STOCK_SHORTAGE' | 'STALE_PRICE';
  sku: string; createdAt: string; description: string;
  beforeQty?: string; afterQty?: string;
  soldPriceVnd?: string; serverPriceVnd?: string;
}>;
const examples: readonly DemoConflict[] = [
  {id:'DEMO-CONFLICT-001',sale:'DEMO-SALE-001',kind:'STOCK_SHORTAGE',
    sku:'PHONE-128',createdAt:'2026-11-08T08:30:00.000Z',
    description:'Đơn đã thu tiền offline, tồn cloud thiếu khi đồng bộ.',
    beforeQty:'0',afterQty:'-1'},
  {id:'DEMO-CONFLICT-002',sale:'DEMO-SALE-002',kind:'STALE_PRICE',
    sku:'CASE-01',createdAt:'2026-11-08T08:35:00.000Z',
    description:'Giá bán đã thu khác với giá máy chủ. Giá gốc không được sửa.',
    soldPriceVnd:'350000',serverPriceVnd:'375000'},
];
type Note = Readonly<{note: string; reviewedAt: string}>;

export function DemoConflictReview() {
  const [resolved,setResolved] = useState<Record<string,Note>>({});
  const [filter,setFilter] = useState<'OPEN'|'RESOLVED'|'ALL'>('OPEN');
  const [selected,setSelected] = useState<string>(examples[0]!.id);
  const [note,setNote] = useState('');
  const [message,setMessage] = useState('');
  const visible = useMemo(()=>examples.filter(c=>filter==='ALL'||
    (resolved[c.id]?'RESOLVED':'OPEN')===filter),[filter,resolved]);
  const conflict = examples.find(c=>c.id===selected);
  function select(id:string):void {setSelected(id);setNote('');setMessage('');}
  function review():void {
    if (!conflict || resolved[conflict.id]) return;
    const clean=note.trim();
    if (clean.length<12 || clean.length>1000){
      setMessage('Ghi chú mẫu phải dài từ 12 đến 1000 ký tự.');
      return;
    }
    setResolved(old=>({...old,[conflict.id]:{note:clean,reviewedAt:new Date().toISOString()}}));
    setMessage('Chỉ cập nhật trạng thái trên màn hình DEMO. Không có audit hay thay đổi kho thật.');
  }
  return <div className="page">
    <div className="eyebrow">MILESTONE M4 / POS-024 — DEMO</div>
    <h1>Đối soát xung đột <span className="hello">✳</span></h1>
    <p className="subhead">Minh họa cách quản lý xem chênh lệch tồn kho hoặc giá và ghi nhận kết quả kiểm tra.</p>
    <section className="warning" role="status">
      <span className="warning-icon">!</span>
      <div><strong>DEMO — KHÔNG PHẢI HÀNG ĐỢI XUNG ĐỘT THẬT</strong>
        <p>Hai bản ghi bên dưới được viết cố định trong React. Không đăng nhập Manager,
          không đọc PostgreSQL, không gọi API/IPC, không lưu audit thật.
          Trạng thái mô phỏng sẽ mất khi tải lại trang. D-013/POS-025 còn chặn tích hợp.</p>
      </div>
    </section>
    <div className="conflict-tools">
      <label htmlFor="conflict-filter">Lọc tình trạng mẫu</label>
      <select id="conflict-filter" value={filter}
        onChange={e=>setFilter(e.target.value as typeof filter)}>
        <option value="OPEN">Chưa xử lý</option>
        <option value="RESOLVED">Đã ghi nhận</option>
        <option value="ALL">Tất cả</option>
      </select>
      <strong>{visible.length} xung đột mẫu</strong>
    </div>
    <div className="conflict-layout">
      <section className="checkout-panel" aria-label="Danh sách xung đột mẫu">
        <h2>Danh sách cần đối soát</h2>
        {visible.length===0&&<p className="empty-copy">Không có xung đột mẫu trong bộ lọc này.</p>}
        {visible.map(c=><button type="button" key={c.id}
          className={'conflict-entry '+(c.id===selected?'conflict-selected':'')}
          onClick={()=>select(c.id)}>
          <strong>{c.kind==='STOCK_SHORTAGE'?'Thiếu tồn kho':'Chênh lệch giá'}</strong>
          <span>{c.sku} · {c.sale}</span>
          <small>{resolved[c.id]?'Đã ghi nhận (demo)':'Chờ đối soát (demo)'}</small>
        </button>)}
      </section>
      <section className="checkout-panel" aria-label="Chi tiết xung đột mẫu">
        {!conflict?<p>Chọn một xung đột để xem thông tin.</p>:
          <><h2>Chi tiết đối soát mẫu</h2>
            <dl className="conflict-details">
              <div><dt>Loại</dt><dd>{conflict.kind}</dd></div>
              <div><dt>SKU</dt><dd>{conflict.sku}</dd></div>
              <div><dt>Mã đơn mẫu</dt><dd>{conflict.sale}</dd></div>
              <div><dt>Mã conflict mẫu</dt><dd>{conflict.id}</dd></div>
              {conflict.beforeQty!==undefined&&
                <div><dt>Tồn trước / sau đồng bộ</dt>
                  <dd>{conflict.beforeQty} / {conflict.afterQty}</dd></div>}
              {conflict.soldPriceVnd!==undefined&&
                <div><dt>Giá đã bán / giá server</dt>
                  <dd>{formatVnd(conflict.soldPriceVnd)} / {formatVnd(conflict.serverPriceVnd!)}</dd></div>}
            </dl>
            <p className="conflict-note">{conflict.description}</p>
            {resolved[conflict.id]?
              <div className="conflict-reviewed">
                <strong>Đã ghi nhận trên DEMO</strong>
                <p>{resolved[conflict.id]!.note}</p>
                <small>{new Date(resolved[conflict.id]!.reviewedAt).toLocaleString('vi-VN')}</small>
              </div>:
              <>
                <label className="field-label" htmlFor="conflict-note">Ghi chú rà soát (mô phỏng)</label>
                <textarea id="conflict-note" rows={4} maxLength={1000}
                  value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="Mô tả cách kiểm tra hoặc điều chỉnh tồn ở nghiệp vụ riêng…" />
                <button className="receipt-demo-action conflict-action" type="button"
                  onClick={review}>Đánh dấu đã rà soát — DEMO</button>
              </>}
            {message&&<p role="status" className="conflict-note">{message}</p>}
          </>}
      </section>
    </div>
    <footer>Không có dữ liệu khách hàng • Không điều chỉnh kho/giá thật • Không tạo audit thật</footer>
  </div>;
}

import { useMemo, useState } from 'react';
import {
  addCartVariant, formatVnd, previewCashCart, removeCartVariant, setCartQuantity,
  type CartCatalogVariant, type CartPreviewLine,
} from '@smartpos/domain/cart';
import type { SmartPosAppInfo } from './desktop-bridge';
import { createDemoInternalReceipt, type InternalReceipt } from '@smartpos/domain/receipt';
import { DemoReceiptPreview } from './internal-receipt';
import { DemoConflictReview } from './conflict-demo';

const demoCatalog: readonly CartCatalogVariant[] = [
  { variantId: 'f82563fe-8545-495e-98d1-ebcbf747b166', sku: 'PHONE-128',
    name: 'Điện thoại 128GB (mẫu)', attributes: { storage: '128GB' },
    priceVnd: '8990000', availableQty: 5, active: true },
  { variantId: '3b565a61-1a19-4662-b488-ae6916fe75c9', sku: 'CASE-01',
    name: 'Ốp lưng (mẫu)', attributes: { color: 'Đen' },
    priceVnd: '350000', availableQty: 20, active: true },
  { variantId: 'f62f3138-0638-4664-8616-c54757eccdb6', sku: 'CABLE-01',
    name: 'Cáp USB-C (hết tồn mẫu)', attributes: { color: 'Trắng' },
    priceVnd: '75000', availableQty: 0, active: true },
  { variantId: '9a847c64-441e-400e-b1c6-cd5cb03c0d6d', sku: 'OLD-SKU',
    name: 'Sản phẩm ngừng bán (mẫu)', attributes: {},
    priceVnd: '100000', availableQty: 3, active: false },
];

const modules = [
  { name: 'Danh mục sản phẩm', detail: 'SKU, màu sắc, dung lượng', code: 'POS-014' },
  { name: 'Bán hàng tại quầy', detail: 'Giỏ hàng và phiếu mẫu (demo)', code: 'POS-018' },
  { name: 'Kho hàng', detail: 'Theo dõi biến động tồn kho', code: 'POS-015' },
  { name: 'Đồng bộ offline', detail: 'SQLite → Neon qua API', code: 'POS-021' },
];

function CashCartDemo() {
  const [lines, setLines] = useState<CartPreviewLine[]>([]);
  const [skuQuery, setSkuQuery] = useState('');
  const [tendered, setTendered] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<InternalReceipt | null>(null);

  const filtered = useMemo(() => {
    const q = skuQuery.trim().toLocaleLowerCase('vi');
    return demoCatalog.filter((item) =>
      item.sku.toLocaleLowerCase('vi').includes(q) ||
      item.name.toLocaleLowerCase('vi').includes(q));
  }, [skuQuery]);
  const baseQuote = useMemo(() => previewCashCart(lines, ''), [lines]);
  const quote = useMemo(() => {
    try { return previewCashCart(lines, tendered); } catch { return null; }
  }, [lines, tendered]);

  function changeCart(action: () => CartPreviewLine[]): void {
    setError('');
    setReceipt(null);
    try {
      setLines(action());
      setTendered(''); // any cart edit invalidates the previous cash preview
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật giỏ hàng mẫu');
    }
  }

  function showDemoReceipt(): void {
    setError('');
    if (!quote || !quote.hasTender || !quote.sufficient || lines.length === 0) {
      setError('Chỉ xem phiếu mẫu khi giỏ hàng có sản phẩm và số tiền mẫu đủ.');
      return;
    }
    try {
      setReceipt(createDemoInternalReceipt(lines, tendered, new Date().toISOString()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tạo được phiếu mẫu');
    }
  }

  return (
    <div className="page">
      <div className="eyebrow">MILESTONE M3 / POS-018 + POS-020</div>
      <h1>Giỏ hàng &amp; tiền mặt <span className="hello">✳</span></h1>
      <p className="subhead">Thử thao tác giỏ hàng và tính tiền bằng VND nguyên, ngay cả khi không có mạng.</p>
      <section className="warning" role="status">
        <span className="warning-icon">!</span>
        <div>
          <strong>DEMO — CHƯA THỂ BÁN HÀNG</strong>
          <p>Tất cả SKU, giá và tồn dưới đây là dữ liệu mẫu cố định trong giao diện.
            Không đọc catalog thật, không ghi SQLite, không trừ tồn và không nhận thanh toán.
            POS-019 chỉ có lõi SQLite chưa nối giao diện; xác thực D-013 chưa triển khai. POS-020 cho xem và in phiếu MẪU, không chốt đơn thật.</p>
        </div>
      </section>

      <div className="checkout-grid">
        <section className="checkout-panel" aria-label="Danh sách sản phẩm mẫu">
          <div className="checkout-heading">
            <div><h2>Chọn sản phẩm mẫu</h2><p>Nhập SKU hoặc tên; chỉ sản phẩm còn hàng mới có thể thêm.</p></div>
            <span className="preview-label">CATALOG GIẢ LẬP</span>
          </div>
          <label className="field-label" htmlFor="sku-search">Tìm kiếm SKU / tên</label>
          <input id="sku-search" className="cart-input" type="search" maxLength={64}
            placeholder="Ví dụ: PHONE-128" value={skuQuery} onChange={(e) => setSkuQuery(e.target.value)} />
          <div className="demo-products">
            {filtered.length === 0 && <p className="empty-copy">Không tìm thấy SKU mẫu phù hợp.</p>}
            {filtered.map((item) => {
              const unavailable = !item.active || item.availableQty === 0;
              return (
                <article className="demo-product" key={item.variantId}>
                  <div>
                    <div className="product-sku">{item.sku}</div>
                    <strong>{item.name}</strong>
                    <p>{formatVnd(item.priceVnd)} · {item.active ? `Tồn mẫu: ${item.availableQty}` : 'Ngừng bán'}</p>
                  </div>
                  <button type="button" className="action-small" disabled={unavailable}
                    aria-label={`Thêm ${item.sku} vào giỏ hàng demo`}
                    onClick={() => changeCart(() => addCartVariant(lines, item))}>
                    {unavailable ? 'Không thể thêm' : '+ Thêm'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="checkout-panel" aria-label="Giỏ hàng và tính tiền mặt">
          <div className="checkout-heading">
            <div><h2>Giỏ hàng dự kiến</h2><p>Sửa số lượng, xóa dòng hoặc nhập tiền khách đưa.</p></div>
            <span className="cart-count">{baseQuote.itemCount} sản phẩm</span>
          </div>
          {lines.length === 0
            ? <p className="empty-cart">Giỏ hàng đang trống. Hãy thêm một SKU mẫu ở bên trái.</p>
            : <div className="cart-lines">
                {lines.map((item) => (
                  <article className="cart-line" key={item.variantId}>
                    <div className="cart-line-info">
                      <strong>{item.nameSnapshot}</strong>
                      <small>{item.skuSnapshot} · {formatVnd(item.unitPriceVnd)} / sản phẩm</small>
                      <strong className="line-money">
                        {formatVnd(String(BigInt(item.quantity) * BigInt(item.unitPriceVnd)))}
                      </strong>
                    </div>
                    <div className="cart-line-actions">
                      <div className="qty-control">
                        <button type="button" aria-label={`Giảm số lượng ${item.skuSnapshot}`}
                          disabled={item.quantity <= 1}
                          onClick={() => changeCart(() => setCartQuantity(lines, item.variantId, item.quantity - 1))}>−</button>
                        <input type="number" min="1" max={item.availableQty} step="1"
                          aria-label={`Số lượng ${item.skuSnapshot}`} value={item.quantity}
                          onChange={(e) => changeCart(() => setCartQuantity(lines, item.variantId, Number(e.target.value)))} />
                        <button type="button" aria-label={`Tăng số lượng ${item.skuSnapshot}`}
                          disabled={item.quantity >= item.availableQty}
                          onClick={() => changeCart(() => setCartQuantity(lines, item.variantId, item.quantity + 1))}>+</button>
                      </div>
                      <button type="button" className="remove-line"
                        onClick={() => changeCart(() => removeCartVariant(lines, item.variantId))}>Xóa</button>
                    </div>
                  </article>
                ))}
              </div>
          }
          {error && <p className="cart-error" role="alert">{error}</p>}
          <div className="cash-summary" aria-live="polite">
            <div><span>Tạm tính</span><strong>{formatVnd(baseQuote.subtotalVnd)}</strong></div>
            <div><span>Chiết khấu</span><strong>{formatVnd(baseQuote.discountTotalVnd)}</strong></div>
            <div className="summary-due"><span>Tổng phải thu</span><strong>{formatVnd(baseQuote.dueVnd)}</strong></div>
          </div>
          <label className="field-label" htmlFor="cash-received">Tiền khách đưa (VND)</label>
          <div className="tender-row">
            <input id="cash-received" className="cart-input" type="text" inputMode="numeric"
              autoComplete="off" maxLength={19} placeholder="Nhập số nguyên, ví dụ 9500000"
              value={tendered} onChange={(e) => { setTendered(e.target.value); setReceipt(null); }} />
            <button type="button" disabled={lines.length === 0}
              onClick={() => setTendered(baseQuote.dueVnd)}>Nhận vừa đủ</button>
          </div>
          {!quote && <p className="cart-error" role="alert">Tiền nhận phải là số nguyên VND hợp lệ, không dấu phân cách và không vượt 64-bit.</p>}
          {quote && lines.length > 0 && (
            <div className="cash-result">
              {quote.hasTender
                ? quote.sufficient
                  ? <p className="cash-good">Đủ tiền trên bản xem trước — chưa thu tiền thật.</p>
                  : <p className="cash-short">Còn thiếu {formatVnd(quote.shortfallVnd)} — không thể thanh toán.</p>
                : <p>Nhập số tiền khách đưa để xem tiền thừa dự kiến.</p>}
              <span>Tiền thừa dự kiến</span>
              <strong>{formatVnd(quote.changeVnd)}</strong>
            </div>
          )}
          <div className="cart-footer-actions">
            <button type="button" disabled={lines.length === 0}
              onClick={() => { setLines([]); setTendered(''); setError(''); setReceipt(null); }}>Xóa giỏ hàng mẫu</button>
            <button type="button" className="receipt-demo-action"
              disabled={!quote?.hasTender || !quote.sufficient || lines.length === 0}
              onClick={showDemoReceipt}>Xem / in phiếu MẪU</button>
            <span>Phiếu mẫu không xác nhận đã thu tiền.</span>
          </div>
        </section>
      </div>
      <footer>SmartPOS Retail • POS-018/020 demo • Phiếu MẪU, không ghi doanh thu thật</footer>
      {receipt && <DemoReceiptPreview receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function FoundationOverview() {
  const [appInfo, setAppInfo] = useState<SmartPosAppInfo | null>(null);
  const [bridgeError, setBridgeError] = useState('');
  const [loading, setLoading] = useState(false);

  async function checkElectronBridge(): Promise<void> {
    setLoading(true);
    setBridgeError('');
    try {
      if (!window.smartpos) throw new Error('Preload bridge không khả dụng');
      const info = await window.smartpos.getAppInfo();
      if (info.mode !== 'DEMO_ONLY') throw new Error('Ứng dụng đang ở chế độ không mong đợi');
      setAppInfo(info);
    } catch (reason) {
      setAppInfo(null);
      setBridgeError(reason instanceof Error ? reason.message : 'Lỗi kết nối Electron');
    } finally { setLoading(false); }
  }

  return (
    <div className="page">
      <div className="eyebrow">MILESTONE M3 / DEVELOPMENT</div>
      <h1>Xin chào từ SmartPOS <span className="hello">✳</span></h1>
      <p className="subhead">Desktop Electron, React, Fastify, SQLite và các hợp đồng dữ liệu đã sẵn sàng cho giai đoạn phát triển bán hàng.</p>
      <section className="warning" role="status">
        <span className="warning-icon">!</span>
        <div>
          <strong>DEMO — CHƯA THỂ BÁN HÀNG</strong>
          <p>POS-018 tính giỏ hàng và tiền thừa trên dữ liệu mẫu; POS-020 chỉ xem và in phiếu MẪU.
            Chưa có đăng nhập, chốt đơn, thu tiền thật hay đồng bộ tự động.</p>
        </div>
      </section>
      <div className="section-header"><h2>Trạng thái nền tảng</h2><span>Demo phát triển</span></div>
      <section className="stats">
        <div className="stat"><span>Desktop</span><strong>Electron</strong><small className="ready">● Giao diện demo</small></div>
        <div className="stat"><span>Backend API</span><strong>Fastify</strong><small>Health API độc lập</small></div>
        <div className="stat"><span>Dữ liệu offline</span><strong>SQLite v1</strong><small className="ready">● Cache trong Electron MAIN</small></div>
      </section>
      <div className="section-header"><h2>Các phân hệ trong lộ trình</h2><span>Đang phát triển</span></div>
      <section className="modules">
        {modules.map((item) => (
          <article className="module" key={item.code}>
            <div className="module-top"><span className="module-symbol">▧</span><span className="module-tag">{item.code}</span></div>
            <h3>{item.name}</h3><p>{item.detail}</p>
            <small>{item.code === 'POS-018' ? 'DEMO CÓ THỂ THAO TÁC' : 'CHƯA TÍCH HỢP GIAO DIỆN'}</small>
          </article>
        ))}
      </section>
      <section className="bridge-panel">
        <div>
          <h2>Kiểm tra kết nối Electron</h2>
          <p>Kiểm tra IPC và SQLite schema. Renderer không nhận đường dẫn file, kết nối cơ sở dữ liệu hoặc quyền chạy SQL.</p>
          {appInfo && <div className="bridge-success">✓ {appInfo.name} v{appInfo.version} — {appInfo.mode} • SQLite schema v{appInfo.localSchemaVersion}</div>}
          {bridgeError && <div className="bridge-error">⚠ {bridgeError}</div>}
        </div>
        <button type="button" onClick={() => void checkElectronBridge()} disabled={loading}>
          {loading ? 'Đang kiểm tra…' : 'Kiểm tra Electron IPC'}
        </button>
      </section>
      <footer>SmartPOS Retail • Môi trường phát triển • Không ghi nhận doanh thu thật</footer>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<'overview' | 'cart' | 'conflicts'>('overview');
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div><strong>SmartPOS</strong><small>Retail • Desktop</small></div>
        </div>
        <div className="sidebar-label">KHÔNG GIAN LÀM VIỆC</div>
        <button type="button" className={tab === 'overview' ? 'nav-current nav-button' : 'nav-muted nav-button'}
          aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => setTab('overview')}>
          ◆ <span>Tổng quan phát triển</span>
        </button>
        <button type="button" className={tab === 'cart' ? 'nav-current nav-button' : 'nav-muted nav-button'}
          aria-current={tab === 'cart' ? 'page' : undefined} onClick={() => setTab('cart')}>
          ▦ <span>Giỏ hàng &amp; tiền mặt (demo)</span>
        </button>
        <button type="button" className={tab === 'conflicts' ? 'nav-current nav-button' : 'nav-muted nav-button'}
          aria-current={tab === 'conflicts' ? 'page' : undefined} onClick={() => setTab('conflicts')}>
          ⚑ <span>Đối soát xung đột (demo)</span>
        </button>
        <div className="sidebar-label sidebar-label-gap">SẮP TRIỂN KHAI</div>
        <div className="nav-muted">▤ <span>Sản phẩm thực tế</span></div>
        <div className="nav-muted">◫ <span>Kho hàng</span></div>
        <div className="nav-muted">◷ <span>Lịch sử giao dịch</span></div>
        <div className="sidebar-spacer" />
        <div className="sidebar-foot"><span className="status-dot" />
          <div><strong>Máy thử nghiệm</strong><small>Không ghi giao dịch thật</small></div>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="breadcrumb">SmartPOS <span>/</span> {tab === 'cart' ? 'Giỏ hàng demo' : tab === 'conflicts' ? 'Đối soát demo' : 'Tổng quan'}</div>
          <span className="top-label">POS-024 • DEMO ONLY</span>
        </header>
        {tab === 'cart' ? <CashCartDemo /> : tab === 'conflicts' ? <DemoConflictReview /> : <FoundationOverview />}
      </main>
    </div>
  );
}

import { useState } from 'react';
import type { SmartPosAppInfo } from './desktop-bridge';

const modules = [
  { name: 'Danh mục sản phẩm', detail: 'SKU, màu sắc, dung lượng', code: 'POS-014' },
  { name: 'Bán hàng tại quầy', detail: 'Giỏ hàng và thanh toán tiền mặt', code: 'POS-018' },
  { name: 'Kho hàng', detail: 'Theo dõi biến động tồn kho', code: 'POS-015' },
  { name: 'Đồng bộ offline', detail: 'SQLite → Neon qua API', code: 'POS-021' },
];

export function App() {
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
    } catch (error) {
      setAppInfo(null);
      setBridgeError(error instanceof Error ? error.message : 'Lỗi kết nối Electron');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div><strong>SmartPOS</strong><small>Retail • Desktop</small></div>
        </div>
        <div className="sidebar-label">KHÔNG GIAN LÀM VIỆC</div>
        <div className="nav-current">◆ <span>Tổng quan phát triển</span></div>
        <div className="sidebar-label sidebar-label-gap">SẮP TRIỂN KHAI</div>
        <div className="nav-muted">▦ <span>Bán hàng</span></div>
        <div className="nav-muted">▤ <span>Sản phẩm</span></div>
        <div className="nav-muted">◫ <span>Kho hàng</span></div>
        <div className="nav-muted">◷ <span>Lịch sử giao dịch</span></div>
        <div className="sidebar-spacer" />
        <div className="sidebar-foot">
          <span className="status-dot" />
          <div><strong>Máy thử nghiệm</strong><small>Không ghi giao dịch thật</small></div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="breadcrumb">SmartPOS <span>/</span> Tổng quan</div>
          <span className="top-label">POS-013 • Local SQLite v1</span>
        </header>
        <div className="page">
          <div className="eyebrow">MILESTONE M1 / DEVELOPMENT</div>
          <h1>Xin chào từ SmartPOS <span className="hello">✳</span></h1>
          <p className="subhead">Giao diện desktop đầu tiên đã được xây dựng bằng Electron, React, Vite và TypeScript.</p>

          <section className="warning" role="status">
            <span className="warning-icon">!</span>
            <div>
              <strong>CHẾ ĐỘ DEMO — CHƯA THỂ BÁN HÀNG</strong>
              <p>Đây là bản demo có cơ sở dữ liệu SQLite trống trên máy. Fastify và Neon development hiện độc lập; chưa có nhân viên, sản phẩm, bán hàng hay đồng bộ dữ liệu thật.</p>
            </div>
          </section>

          <div className="section-header">
            <h2>Trạng thái nền tảng</h2>
            <span>Khởi tạo hệ thống</span>
          </div>
          <section className="stats">
            <div className="stat"><span>Desktop</span><strong>Electron</strong><small className="ready">● Giao diện demo</small></div>
            <div className="stat"><span>Backend API</span><strong>Fastify</strong><small>Health API độc lập</small></div>
            <div className="stat"><span>Dữ liệu offline</span><strong>SQLite v1</strong><small className="ready">● Lưu trữ trên máy</small></div>
          </section>

          <div className="section-header"><h2>Các phân hệ trong lộ trình</h2><span>Chưa khả dụng</span></div>
          <section className="modules">
            {modules.map((item) => (
              <article className="module" key={item.code}>
                <div className="module-top"><span className="module-symbol">▧</span><span className="module-tag">{item.code}</span></div>
                <h3>{item.name}</h3><p>{item.detail}</p>
                <small>ĐANG LÊN KẾ HOẠCH</small>
              </article>
            ))}
          </section>

          <section className="bridge-panel">
            <div>
              <h2>Kiểm tra kết nối Electron</h2>
              <p>Nhấn nút kiểm tra IPC và phiên bản SQLite. Renderer không nhận đường dẫn file, kết nối database hay quyền thực thi SQL.</p>
              {appInfo && <div className="bridge-success">✓ {appInfo.name} v{appInfo.version} — {appInfo.mode} • SQLite schema v{appInfo.localSchemaVersion}</div>}
              {bridgeError && <div className="bridge-error">⚠ {bridgeError}</div>}
            </div>
            <button type="button" onClick={() => void checkElectronBridge()} disabled={loading}>
              {loading ? 'Đang kiểm tra…' : 'Kiểm tra Electron IPC'}
            </button>
          </section>

          <footer>SmartPOS Retail • Môi trường phát triển • Không sử dụng để ghi nhận doanh thu thật</footer>
        </div>
      </main>
    </div>
  );
}

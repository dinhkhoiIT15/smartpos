import { useEffect, useRef } from 'react';
import { formatVnd } from '@smartpos/domain/cart';
import {
  DEMO_RECEIPT_WATERMARK, INTERNAL_RECEIPT_NOTICE, type InternalReceipt,
} from '@smartpos/domain/receipt';

/**
 * The ONLY receipt available to the renderer in POS-020 is a watermarked
 * synthetic SAMPLE. Persisted sale receipts remain Electron MAIN-only until
 * real D-013 signed device/cashier auth and access-control are implemented.
 */
export function DemoReceiptPreview({
  receipt, onClose,
}: Readonly<{ receipt: InternalReceipt; onClose: () => void }>) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const printButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const backward = event.shiftKey;
        const first = closeButton.current;
        const last = printButton.current;
        if (!first || !last) return;
        if (backward && (document.activeElement === first ||
            !first.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!backward && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (receipt.kind !== 'DEMO' || receipt.watermark !== DEMO_RECEIPT_WATERMARK ||
      receipt.notice !== INTERNAL_RECEIPT_NOTICE) {
    // Refuse to print purported persisted paid evidence in the demo UI.
    return null;
  }

  return (
    <div className="receipt-overlay">
      <div className="receipt-dialog" role="dialog" aria-modal="true"
        aria-labelledby="receipt-title" aria-describedby="receipt-description">
        <div className="receipt-controls">
          <div>
            <strong id="receipt-title">Xem trước phiếu nội bộ</strong>
            <p id="receipt-description">Chỉ là dữ liệu mẫu. Không có đơn bán hay thanh toán thật.</p>
          </div>
          <div className="receipt-buttons">
            <button ref={closeButton} type="button" onClick={onClose}>Đóng (Esc)</button>
            <button ref={printButton} className="receipt-print-button" type="button"
              onClick={() => window.print()}>In phiếu MẪU</button>
          </div>
        </div>
        <article className="receipt-paper" aria-label="Phiếu bán hàng nội bộ mẫu">
          <div className="receipt-watermark" aria-label="Dữ liệu mẫu">{receipt.watermark}</div>
          <div className="receipt-business">SmartPOS Retail</div>
          <h2>PHIẾU BÁN HÀNG NỘI BỘ</h2>
          <p className="receipt-tax-note">{receipt.notice}</p>
          <div className="receipt-meta">
            <div><span>Mã đơn:</span><strong>{receipt.saleCode}</strong></div>
            <div><span>Thời gian (VN):</span><strong>{receipt.createdAtLocal}</strong></div>
            <div><span>Nhân viên:</span><strong>{receipt.cashierLabel}</strong></div>
            <div><span>Trạng thái:</span><strong>{receipt.syncLabel}</strong></div>
          </div>
          <table className="receipt-items">
            <thead>
              <tr><th scope="col">Sản phẩm / SKU</th><th scope="col">SL</th>
                <th scope="col">Đơn giá</th><th scope="col">Thành tiền</th></tr>
            </thead>
            <tbody>
              {receipt.items.map((line) => (
                <tr key={line.sku}>
                  <td>
                    <strong>{line.name}</strong>
                    <small>{line.sku}</small>
                    {Object.keys(line.attributes).length > 0 &&
                      <small>{Object.entries(line.attributes).map(([key, value]) =>
                        `${key}: ${value}`).join(' · ')}</small>}
                  </td>
                  <td>{line.quantity}</td>
                  <td>{formatVnd(line.unitPriceVnd)}</td>
                  <td>
                    {formatVnd(line.lineTotalVnd)}
                    {line.discountVnd !== '0' &&
                      <small>Giảm: {formatVnd(line.discountVnd)}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-totals">
            <div><span>Tạm tính</span><strong>{formatVnd(receipt.subtotalVnd)}</strong></div>
            <div><span>Chiết khấu</span><strong>{formatVnd(receipt.discountTotalVnd)}</strong></div>
            <div className="receipt-due"><span>Tổng phải thu</span><strong>{formatVnd(receipt.dueVnd)}</strong></div>
            <div><span>Tiền khách đưa (giả lập)</span><strong>{formatVnd(receipt.tenderedVnd)}</strong></div>
            <div><span>Tiền thừa dự kiến</span><strong>{formatVnd(receipt.changeVnd)}</strong></div>
          </div>
          <div className="receipt-end">
            <strong>{DEMO_RECEIPT_WATERMARK}</strong>
            <p>Không xác nhận đã thu tiền. Không dùng làm chứng từ giao dịch.</p>
            <p>{INTERNAL_RECEIPT_NOTICE}</p>
          </div>
        </article>
      </div>
    </div>
  );
}

import React from 'react';
import { IconExclamationTriangle, IconXMark } from '../../icons/HeroIcons';
import '../../styles/app.css';

export interface MismatchToast {
  logId: number;
  cardCode: string;
  lane: string;
  entryPlate: string;
  exitPlate: string;
  timestamp: string;
}

interface Props {
  toasts: MismatchToast[];
  onDismiss: (logId: number) => void;
  onOpen?: (logId: number) => void;
}

const formatToastTime = (ts: string) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// KHÔNG tự đóng - đây là cảnh báo nghi gian lận, chỉ biến mất khi bảo vệ chủ
// động đóng hoặc xác nhận khớp trong modal chi tiết (xem ScanStation).
export const MismatchToastPanel: React.FC<Props> = ({ toasts, onDismiss, onOpen }) => {
  if (toasts.length === 0) return null;

  return (
    <aside className="m-toast-container" role="log" aria-live="assertive" aria-label="Cảnh báo biển số không khớp">
      {toasts.map((t) => (
        <article key={t.logId} className="m-toast" role="alert">
          <div>
            <header className="m-toast__title">
              <IconExclamationTriangle size={18} />
              <strong>BIỂN SỐ KHÔNG KHỚP!</strong>
            </header>
            <p className="m-toast__detail">
              {t.lane}
              {formatToastTime(t.timestamp) && ` · ${formatToastTime(t.timestamp)}`}
            </p>
            <p className="m-toast__detail">
              Vào: {t.entryPlate || '—'} · Ra: {t.exitPlate || '—'}
            </p>
            {onOpen && (
              <button type="button" className="m-toast__action" onClick={() => onOpen(t.logId)}>
                Xem &amp; xác nhận
              </button>
            )}
          </div>
          <button
            className="m-toast__dismiss"
            onClick={() => onDismiss(t.logId)}
            aria-label="Đóng cảnh báo"
          >
            <IconXMark size={16} />
          </button>
        </article>
      ))}
    </aside>
  );
};

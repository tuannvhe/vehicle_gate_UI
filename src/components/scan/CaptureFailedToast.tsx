import React from 'react';
import { IconCamera, IconXMark } from '../../icons/HeroIcons';
import '../../styles/app.css';

export interface CaptureFailedToast {
  logId: number;
  cardCode: string;
  lane: string;
  timestamp: string;
}

interface Props {
  toasts: CaptureFailedToast[];
  onDismiss: (logId: number) => void;
}

export const CaptureFailedToastPanel: React.FC<Props> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <aside
      className="m-toast-container"
      role="log"
      aria-live="assertive"
      aria-label="Cảnh báo không chụp được ảnh"
    >
      {toasts.map((t) => (
        <article key={t.logId} className="m-toast m-toast--warning" role="alert">
          <div>
            <header className="m-toast__title">
              <IconCamera size={18} />
              <strong>KHÔNG CHỤP ĐƯỢC ẢNH!</strong>
            </header>
            {/* <p className="m-toast__detail">
              Thẻ: {t.cardCode || 'N/A'} · Làn: {t.lane}
            </p> */}
            <p className="m-toast__detail">Log #{t.logId} - kiểm tra camera</p>
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

import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IconCheckCircle, IconExclamationTriangle, IconXMark } from '../../icons/HeroIcons';
import { consumeFlashToast, type FlashToast as FlashToastData } from '../../utils/flashToast';
import '../../styles/app.css';

/**
 * Hiện 1 toast ngắn cho thông báo "vừa xong" cần thấy được ở TRANG ĐÍCH sau
 * khi điều hướng (VD đăng nhập/đăng xuất thành công) - xem utils/flashToast.ts.
 * Mount 1 lần duy nhất ở gốc App (App.tsx, NẰM NGOÀI <Routes>) để hoạt động
 * bất kể landing ở trang nào - nhưng ĐÚNG VÌ VẬY, component này KHÔNG bị
 * unmount/mount lại khi điều hướng kiểu SPA (navigate() của react-router-dom
 * chỉ đổi nội dung bên trong <Routes>, không đụng tới các phần tử NGOÀI nó).
 * 🐛 FIX: nếu chỉ đọc flash lúc mount (chạy đúng 1 lần khi tải trang /login
 * ban đầu, TRƯỚC KHI đăng nhập), toast set SAU ĐÓ (sau khi login rồi
 * navigate('/')) sẽ không bao giờ được đọc lại - đây là lý do "đăng nhập
 * xong chưa hiện" dù đăng xuất (dùng window.location.href, tải lại trang
 * thật) vẫn hiện bình thường. Phải đọc lại MỖI KHI location đổi.
 */
export const FlashToast: React.FC = () => {
  const [toast, setToast] = useState<FlashToastData | null>(null);
  const location = useLocation();

  useEffect(() => {
    const t = consumeFlashToast();
    if (t) setToast(t);
  }, [location.pathname]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="m-toast-container">
      <div className={`m-toast ${toast.type === 'success' ? 'm-toast--success' : ''}`}>
        <div className="m-toast__title">
          {toast.type === 'success' ? <IconCheckCircle size={18} /> : <IconExclamationTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
        <button className="m-toast__dismiss" onClick={() => setToast(null)} aria-label="Đóng thông báo">
          <IconXMark size={16} />
        </button>
      </div>
    </div>
  );
};

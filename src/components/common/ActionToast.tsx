import React from 'react';
import { IconCheckCircle, IconExclamationTriangle, IconXMark } from '../../icons/HeroIcons';
import type { ToastMessage } from '../../hooks/useToast';
import '../../styles/app.css';

interface Props {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

/**
 * Toast nổi góc trên phải cho kết quả thành công/thất bại của 1 hành động
 * thêm/sửa/xóa ở admin - dùng cùng style .m-toast với FlashToast (đăng nhập/
 * đăng xuất) để đồng nhất giao diện thông báo trong toàn hệ thống.
 */
export const ActionToast: React.FC<Props> = ({ toast, onDismiss }) => {
  if (!toast) return null;
  return (
    <div className="m-toast-container">
      <div className={`m-toast ${toast.type === 'success' ? 'm-toast--success' : ''}`}>
        <div className="m-toast__title">
          {toast.type === 'success' ? <IconCheckCircle size={18} /> : <IconExclamationTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
        <button className="m-toast__dismiss" onClick={onDismiss} aria-label="Đóng thông báo">
          <IconXMark size={16} />
        </button>
      </div>
    </div>
  );
};

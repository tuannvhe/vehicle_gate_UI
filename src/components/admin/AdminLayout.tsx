import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  IconBolt,
  IconCamera,
  IconDocumentText,
  IconArrowUpTray,
  IconSignal,
  IconShieldCheck,
  IconArrowRightEndOnRectangle,
  IconChevronLeft,
  IconChevronRight,
  IconXMark,
} from '../../icons/HeroIcons';
import logo from '../../assets/logo1.png';
import { setFlashToast } from '../../utils/flashToast';
import '../../styles/app.css';
import '../../styles/admin.css';

/**
 * Khung sườn dùng chung cho mọi màn quản lý: sidebar trái (logo, điều hướng,
 * thông tin người đăng nhập dính đáy, có thể thu gọn) + vùng nội dung bên
 * phải. Bọc trang quản lý bằng component này thay vì tự viết lại sidebar:
 *
 *   <AdminLayout>
 *     <div className="m-page">...</div>
 *   </AdminLayout>
 *
 * Thêm màn quản lý mới -> thêm 1 dòng vào NAV_ITEMS bên dưới.
 */
interface NavItem {
  label: string;
  to: string;
  icon: React.FC<{ size?: number }>;
  // Màu icon riêng cho từng mục - lấy cảm hứng từ dashboard nhiều màu (mỗi
  // khối chức năng 1 màu riêng để dễ phân biệt/quét mắt nhanh), nhưng vẫn
  // giữ bố cục PHẲNG (không gradient, không đổi cấu trúc sidebar).
  color: string;
  // Chỉ hiện mục này với đúng role - undefined nghĩa là mọi role đăng nhập
  // đều thấy. Khớp với giới hạn phía backend (LanesController/
  // CamerasController giờ chỉ admin gọi được create/update/delete) - ẩn
  // hẳn khỏi sidebar thay vì để guard vào rồi mới thấy trang trống/lỗi.
  requiredRole?: 'admin';
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Màn hình quét', to: '/', icon: IconBolt, color: '#2563eb' },
  { label: 'Quản lý log ra vào', to: '/admin-logs', icon: IconDocumentText, color: '#6366f1' },
  { label: 'Cho xe ra thủ công', to: '/admin-manual-exit', icon: IconArrowUpTray, color: '#0891b2' },
  { label: 'Quản lý làn xe', to: '/admin-lanes', icon: IconSignal, color: '#a855f7', requiredRole: 'admin' },
  { label: 'Quản lý camera', to: '/admin-cameras', icon: IconCamera, color: '#ec4899', requiredRole: 'admin' },
  { label: 'Quản lý thẻ', to: '/admin-cards', icon: IconShieldCheck, color: '#10b981' },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị viên',
  guard: 'Bảo vệ',
  viewer: 'Người xem',
};

const COLLAPSE_STORAGE_KEY = 'm-sidebar-collapsed';

interface Props {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<Props> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true'
  );
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setFlashToast('Đã đăng xuất thành công');
    } finally {
      navigate('/login');
    }
  };

  return (
    <div className="m-shell">
      <aside className="m-sidebar" data-collapsed={collapsed}>
        <div className="m-sidebar__brand">
          <img src={logo} alt="Logo Vinatech Vina" />
          {!collapsed && (
            <div className="m-sidebar__brand-text">
              <p className="m-sidebar__brand-name">Vinatech Vina</p>
              <p className="m-sidebar__brand-desc">Quản trị hệ thống</p>
            </div>
          )}
        </div>

        <button
          className="m-sidebar__collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        >
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
        </button>

        <nav className="m-sidebar__nav" aria-label="Điều hướng quản lý">
          {!collapsed && <span className="m-sidebar__nav-group-label">Điều hướng</span>}
          {NAV_ITEMS.filter((item) => !item.requiredRole || user?.role === item.requiredRole).map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                className="m-sidebar__nav-item"
                data-active={isActive}
                onClick={() => navigate(item.to)}
                title={collapsed ? item.label : undefined}
                style={{ '--m-nav-color': item.color } as React.CSSProperties}
              >
                <span className="m-sidebar__nav-icon">
                  <Icon size={16} />
                </span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="m-sidebar__user">
          <span className="m-sidebar__user-avatar">
            {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
          </span>
          {!collapsed && (
            <div className="m-sidebar__user-details">
              <span className="m-sidebar__user-name" title={user?.fullName || ''}>
                {user?.fullName || 'Người dùng'}
              </span>
              <span className="m-sidebar__user-role">
                {(user?.role && ROLE_LABEL[user.role]) || user?.role || '—'}
              </span>
            </div>
          )}
          <button
            className="m-sidebar__user-logout"
            onClick={() => setConfirmLogoutOpen(true)}
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <IconArrowRightEndOnRectangle size={16} />
          </button>
        </div>
      </aside>

      {/* --m-page-accent đặt ở ĐÂY (bọc ngoài children) thay vì chỉ ở div
          .m-page bên trong từng trang - để modal/overlay (render dạng
          SIBLING của .m-page trong JSX từng trang, không phải con) vẫn kế
          thừa được đúng màu nhận diện của trang đang mở. */}
      <main
        className="m-shell__content"
        style={{ '--m-page-accent': NAV_ITEMS.find((i) => i.to === location.pathname)?.color } as React.CSSProperties}
      >
        {children}
      </main>

      {confirmLogoutOpen && (
        <div className="m-modal-overlay" onClick={() => !loggingOut && setConfirmLogoutOpen(false)}>
          <article className="m-modal m-modal--sm" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Xác nhận đăng xuất</h3>
              <button
                className="m-modal__close"
                onClick={() => setConfirmLogoutOpen(false)}
                disabled={loggingOut}
                aria-label="Đóng"
              >
                <IconXMark size={20} />
              </button>
            </header>
            <p className="m-confirm-text">
              Bạn có chắc muốn đăng xuất khỏi tài khoản <strong>{user?.fullName || user?.username}</strong> không?
            </p>
            <footer className="m-modal__footer">
              <button
                className="m-btn m-btn--secondary"
                onClick={() => setConfirmLogoutOpen(false)}
                disabled={loggingOut}
              >
                Hủy
              </button>
              <button className="m-btn m-btn--danger" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? (
                  <>
                    <span className="m-btn__spinner" /> Đang đăng xuất...
                  </>
                ) : (
                  'Đăng xuất'
                )}
              </button>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
};

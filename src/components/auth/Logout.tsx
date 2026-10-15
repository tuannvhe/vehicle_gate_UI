import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  IconChevronDown,
  IconChevronUp,
  IconArrowRightEndOnRectangle,
  IconUserCircle,
  IconShieldCheck,
  IconCog,
  IconXMark,
} from '../../icons/HeroIcons';
import { setFlashToast } from '../../utils/flashToast';
import '../../styles/app.css';
// Modal xác nhận đăng xuất tái dùng .m-modal--sm/.m-confirm-text/.m-modal__footer
// - các class này định nghĩa trong admin.css, import thêm ở đây để Logout
// dùng được dù đứng trong màn không tự import admin.css (VD ScanStation).
import '../../styles/admin.css';

interface Props {
  className?: string;
}

export const Logout: React.FC<Props> = ({ className = '' }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
      setFlashToast('Đã đăng xuất thành công');
      window.location.href = '/login';
    } catch {
      setLoading(false);
    }
  };

  const goToAdmin = () => {
    setIsOpen(false);
    navigate('/admin');
  };

  return (
    <>
      <nav ref={menuRef} className={`m-user-menu ${className}`} aria-label="Menu người dùng">
        <button
          className="m-user-menu__trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-label="Tùy chọn tài khoản"
        >
          <span className="m-user-menu__avatar">
            {user?.fullName?.charAt(0) || <IconUserCircle size={18} />}
          </span>
          <span className="m-user-menu__name">{user?.fullName || 'Người dùng'}</span>
          {isOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>

        {isOpen && (
          <menu className="m-user-menu__dropdown" role="menu">
            <li className="m-user-menu__info" role="none">
              <span className="m-user-menu__info-avatar">
                {user?.fullName?.charAt(0) || '👤'}
              </span>
              <span className="m-user-menu__info-details">
                <strong className="m-user-menu__info-name">{user?.fullName}</strong>
                <small className="m-user-menu__info-username">@{user?.username}</small>
                <small className="m-user-menu__info-role">
                  <IconShieldCheck size={12} style={{ display: 'inline', marginRight: 2 }} />
                  {user?.role === 'admin' ? 'Quản trị viên' : 'Bảo vệ'}
                </small>
              </span>
            </li>

            <li className="m-user-menu__divider" role="separator" />

            <li role="none">
              <button className="m-user-menu__item-btn" onClick={goToAdmin} role="menuitem">
                <IconCog size={18} />
                <span>Trang quản trị</span>
              </button>
            </li>

            <li className="m-user-menu__divider" role="separator" />

            <li role="none">
              <button
                className="m-user-menu__logout-btn"
                onClick={() => {
                  setIsOpen(false);
                  setConfirmOpen(true);
                }}
                role="menuitem"
              >
                <IconArrowRightEndOnRectangle size={18} />
                <span>Đăng xuất</span>
              </button>
            </li>
          </menu>
        )}
      </nav>

      {confirmOpen && (
        <div className="m-modal-overlay" onClick={() => !loading && setConfirmOpen(false)}>
          <article className="m-modal m-modal--sm" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Xác nhận đăng xuất</h3>
              <button
                className="m-modal__close"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
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
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
              >
                Hủy
              </button>
              <button className="m-btn m-btn--danger" onClick={handleLogout} disabled={loading}>
                {loading ? (
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
    </>
  );
};

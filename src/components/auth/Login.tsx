import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { IconUser, IconLockClosed, IconShieldCheck, IconExclamationTriangle } from '../../icons/HeroIcons';
import { setFlashToast } from '../../utils/flashToast';
import '../../styles/app.css';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Add JSON-LD for AEO/Structured Data
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'VehicleGate',
      description: 'Hệ thống kiểm soát xe ra vào thông minh với nhận diện biển số tự động',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
    });
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username, password);
      setFlashToast('Đăng nhập thành công');
      navigate('/');
    } catch (err: any) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.title ||
        err.message ||
        'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="m-login">
      <section className="m-login__card">
        <header className="m-login__header">
          <span className="m-login__logo-icon">
            <IconShieldCheck size={36} />
          </span>
          <h1 className="m-login__title">Hệ thống kiểm soát xe ra vào</h1>
          <p className="m-login__subtitle">VehicleGate — Đăng nhập hệ thống</p>
        </header>

        <form onSubmit={handleSubmit} className="m-login__form" aria-label="Form đăng nhập">
          <fieldset className="m-login__field">
            <label htmlFor="login-username" className="m-login__label">
              Tên đăng nhập
            </label>
            <span className="m-login__input-wrap">
              <IconUser className="m-login__input-icon" size={18} />
              <input
                id="login-username"
                type="text"
                className="m-login__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập"
                required
                disabled={loading}
                autoFocus
              />
            </span>
          </fieldset>

          <fieldset className="m-login__field">
            <label htmlFor="login-password" className="m-login__label">
              Mật khẩu
            </label>
            <span className="m-login__input-wrap">
              <IconLockClosed className="m-login__input-icon" size={18} />
              <input
                id="login-password"
                type="password"
                className="m-login__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                required
                disabled={loading}
              />
            </span>
          </fieldset>

          {error && (
            <output className="m-login__error" role="alert">
              <IconExclamationTriangle size={18} />
              <span>{error}</span>
            </output>
          )}

          <button type="submit" className="m-login__btn" disabled={loading}>
            {loading ? (
              <>
                <span className="m-login__spinner" />
                <span>Đang đăng nhập...</span>
              </>
            ) : (
              <span>Đăng nhập</span>
            )}
          </button>
        </form>

        <footer className="m-login__footer">
          <small>© 2026 Viet Nam DX Team — Vehicle Gate Control System</small>
        </footer>
      </section>
    </main>
  );
};

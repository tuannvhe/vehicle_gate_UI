import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/endpoints/auth';
// 🔥 Import đúng file client.ts
import { api } from '../api/client';
import type { UserInfo, AuthResponse } from '../api/types/auth';

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshTokenAsync: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * 🔒 SECURITY: Access/refresh token trước đây lưu ở localStorage (đọc được
 * bằng JS -> XSS lấy được token là chiếm được cả phiên đăng nhập). Giờ token
 * nằm trong HttpOnly cookie do backend đặt (xem AuthController.cs) - trình
 * duyệt tự gửi kèm mỗi request (client.ts đã bật withCredentials), JS không
 * bao giờ đọc được giá trị token nữa.
 *
 * Hệ quả: không còn cách nào để JS tự decode JWT lấy hạn dùng (payload nằm
 * trong cookie, không truy cập được) - bỏ luôn cơ chế "chủ động refresh
 * trước khi hết hạn 1 phút" (scheduleTokenRefresh) trước đây. Giờ chỉ dựa
 * vào refresh PHẢN ỨNG khi gặp 401 (interceptor trong client.ts) - access
 * token sống 15 phút, request đầu tiên sau khi hết hạn sẽ tự động refresh +
 * gọi lại (retry) trong suốt, người dùng không thấy khác biệt.
 *
 * localStorage CHỈ còn cache "user" (tên/role hiển thị UI) - không phải bí
 * mật, chỉ để tránh nháy màn hình trắng khi tải lại trang trong lúc chờ
 * /auth/me xác nhận phiên qua cookie.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(() => {
    try {
      const cached = localStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Xác nhận phiên đăng nhập THẬT qua cookie (không tin localStorage) - gọi
  // /auth/me mỗi lần tải trang. Nếu cookie hết hạn, interceptor 401 trong
  // client.ts tự thử refresh qua cookie refresh-token trước khi request này
  // thất bại thật sự.
  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      try {
        const res = await authApi.getCurrentUser();
        if (cancelled) return;
        const freshUser = (res.data as any)?.data ?? res.data;
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
      } catch {
        if (cancelled) return;
        setUser(null);
        localStorage.removeItem('user');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    verifySession();

    // Đồng bộ lại "user" nếu client.ts (interceptor 401) tự refresh thành
    // công giữa chừng 1 request - backend có thể trả user mới (VD đổi role).
    const handleExternalTokenRefresh = (e: Event) => {
      const data = (e as CustomEvent<AuthResponse>).detail;
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    };
    window.addEventListener('auth:tokens-refreshed', handleExternalTokenRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener('auth:tokens-refreshed', handleExternalTokenRefresh);
    };
  }, []);

  const login = async (username: string, password: string): Promise<AuthResponse> => {
    const response = await authApi.login({ username, password });
    const data = response.data.data ?? response.data;

    // Cookie đã được backend đặt trong response này (Set-Cookie) - chỉ cần
    // lưu lại "user" để hiển thị UI.
    setUser(data.user);
    localStorage.setItem('user', JSON.stringify(data.user));

    return data;
  };

  const logout = async () => {
    try {
      // Không cần gửi refreshToken nữa - backend đọc từ cookie.
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    setUser(null);
    (api as any).clearAuthData();
  };

  const refreshTokenAsync = async () => {
    try {
      const data = await (api as any).refreshTokens();
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch (err: any) {
      // Chỉ logout khi SERVER THẬT SỰ TỪ CHỐI (có response, VD refresh token
      // cookie hết hạn/không hợp lệ) - KHÔNG khi đây là lỗi mạng/timeout.
      if (err?.response) {
        logout();
      }
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword({ currentPassword, newPassword });
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    refreshTokenAsync,
    changePassword,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

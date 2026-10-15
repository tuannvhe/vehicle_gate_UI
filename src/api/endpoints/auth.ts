import { api } from '../client';
import type {
  LoginRequest,
  AuthResponse,
  ChangePasswordRequest,
  UserInfo
} from '../types/auth';

// refreshToken/logout không còn nhận refreshToken làm tham số - backend đọc
// trực tiếp từ HttpOnly cookie (vgm_rt), JS không cầm token nữa.
export const authApi = {
  login: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', data),

  refreshToken: () =>
    api.post<AuthResponse>('/auth/refresh-token'),

  logout: () =>
    api.post('/auth/logout'),

  changePassword: (data: ChangePasswordRequest) =>
    api.post('/auth/change-password', data),

  getCurrentUser: () =>
    api.get<UserInfo>('/auth/me'),
};
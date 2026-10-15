export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserInfo {
  id: number;
  username: string;
  fullName: string;
  role: string;
  assignedLane?: string;
}

// accessToken/refreshToken KHÔNG còn trong body - backend đặt trực tiếp
// thành HttpOnly cookie (JS không đọc được, chống đánh cắp qua XSS).
export interface AuthResponse {
  user: UserInfo;
  expiresAt: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
// Thông báo ngắn cần hiện SAU KHI chuyển trang (VD "Đăng nhập thành công" chỉ
// thấy được ở trang "/" sau khi login, "Đã đăng xuất" chỉ thấy được ở trang
// "/login" sau khi logout) - lưu tạm vào sessionStorage để sống sót qua cả
// điều hướng SPA (navigate()) LẪN tải lại trang thật (window.location.href,
// xem Logout.tsx dùng hard navigation khi đăng xuất).
const KEY = 'vgm_flash_toast';

export type FlashToastType = 'success' | 'error';

export interface FlashToast {
  message: string;
  type: FlashToastType;
}

export function setFlashToast(message: string, type: FlashToastType = 'success') {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ message, type }));
  } catch {
    // Safari private mode/quota đầy... - bỏ qua, không hiện được thông báo
    // thì thôi, không phải lỗi nghiêm trọng.
  }
}

// Đọc VÀ XÓA ngay - thông báo chỉ hiện đúng 1 lần, tránh lặp lại nếu người
// dùng F5 lại trang đích sau đó.
export function consumeFlashToast(): FlashToast | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Toast thông báo thành công/thất bại dùng chung cho các hành động
 * thêm/sửa/xóa ở admin - tự ẩn sau `durationMs`, không dồn thành danh sách
 * (gọi showSuccess/showError lần mới sẽ thay thế toast đang hiện, không xếp
 * chồng nhiều thông báo cùng lúc).
 */
export interface ToastMessage {
  type: 'success' | 'error';
  message: string;
}

export function useToast(durationMs = 3000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback(
    (msg: ToastMessage) => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      setToast(msg);
      timeoutRef.current = window.setTimeout(() => setToast(null), durationMs);
    },
    [durationMs]
  );

  const showSuccess = useCallback((message: string) => showToast({ type: 'success', message }), [showToast]);
  const showError = useCallback((message: string) => showToast({ type: 'error', message }), [showToast]);

  const dismiss = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setToast(null);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    []
  );

  return { toast, showSuccess, showError, dismiss };
}

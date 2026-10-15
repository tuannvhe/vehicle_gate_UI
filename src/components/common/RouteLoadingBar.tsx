import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Thanh loading mỏng ở mép trên cùng màn hình khi CHUYỂN TRANG (route thay
 * đổi) - kiểu NProgress/GitHub. CHỦ ĐỘNG BỎ QUA khi đích đến là "/" (màn
 * quét thẻ chính) theo đúng yêu cầu: không thêm loading vào luồng scan/lịch
 * sử quẹt thẻ, vì đó là màn hình cần cảm giác tức thời, không phù hợp để
 * chèn hiệu ứng chờ.
 */
export const RouteLoadingBar: React.FC = () => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [full, setFull] = useState(false);
  const isFirstRender = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Lần render đầu tiên (tải trang) không phải "chuyển màn" - bỏ qua.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];

    // Không hiện loading khi ĐÍCH ĐẾN là màn quét thẻ chính - màn hình này
    // cần cảm giác tức thời, không phù hợp để chèn hiệu ứng chuyển trang.
    if (location.pathname === '/') {
      setVisible(false);
      setFull(false);
      return;
    }

    setFull(false);
    setVisible(true);

    // Chạy tới ~85% ngay (phản hồi tức thời), giữ 1 nhịp, rồi "chốt" 100% +
    // mờ dần, cuối cùng ẩn hẳn - không có route loader thật gắn với dữ liệu
    // (các trang quản lý hiện tại chưa fetch API thật), nên đây là hiệu ứng
    // cảm nhận (perceived transition) có thời lượng cố định, không phải
    // theo dõi tiến trình tải thật.
    const t1 = setTimeout(() => setFull(true), 250);
    const t2 = setTimeout(() => setVisible(false), 500);
    timeoutsRef.current = [t1, t2];

    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div className="m-route-loading" data-full={full} role="progressbar" aria-label="Đang chuyển trang" />
  );
};

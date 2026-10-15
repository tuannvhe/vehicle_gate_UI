import React, { useEffect, useState } from 'react';
import type { HistoryItem } from '../../api/types/history';
import { IconExclamationTriangle, IconCamera, IconCheckCircle, IconLockClosed } from '../../icons/HeroIcons';
import { formatTime } from '../../utils/formatTime';

const isCardLostExit = (note: string | null | undefined) => !!note && note.includes('Thẻ bị mất: Có');

interface Props {
  item: HistoryItem;
  laneName: string;
  onOpen: (item: HistoryItem) => void;
}

// 🆕 Tách riêng khỏi ScanStation + bọc React.memo - "Hoạt động gần đây" cập
// nhật liên tục theo thời gian thực (SignalR) và có thể dài tới hàng trăm
// item (RECENT_MAX_ITEMS=300). Trước đây cả khối JSX này nằm thẳng trong
// .map() của ScanStation - MỌI lần re-render component cha (VD 1 log mới
// tới) đều tính lại + re-render TOÀN BỘ danh sách dù chỉ 1 item thực sự đổi.
// React.memo skip re-render cho các item khác nếu props (item, laneName,
// onOpen) không đổi - onOpen PHẢI là 1 callback ổn định (useCallback) từ
// ScanStation, không thì memo vô nghĩa vì props luôn "khác" mỗi render.
function TickerItemInner({ item: e, laneName, onOpen }: Props) {
  const hasPhotos = !!(e.photoUrls && e.photoUrls.length > 0);

  // 🐛 FIX: sau khi bọc React.memo, item KHÔNG re-render nếu props (item,
  // laneName, onOpen) không đổi - nhưng "hasNoPhoto" bên dưới phụ thuộc vào
  // Date.now() (thời gian TRÔI QUA), không phải prop nào cả. Trước đây khi
  // JSX này còn nằm thẳng trong ScanStation, MỌI re-render của cha (rất
  // thường xuyên do SignalR) đều vô tình tính lại giúp - giờ memo chặn hết,
  // nên log không ảnh cứ đứng yên "bình thường" mãi cho tới khi có prop
  // khác đổi (hoặc F5 tải lại trang). Chỉ tick lại (buộc render) khi item
  // ĐANG ở trạng thái "chưa rõ" (chưa có ảnh, chưa được xác nhận lỗi) - most
  // item đã có ảnh/đã lỗi thì dừng hẳn, không tốn timer cho hàng trăm item
  // đã xong việc.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (hasPhotos || e.captureFailed === true) return;
    const timer = setInterval(() => forceTick((t) => t + 1), 2000);
    return () => clearInterval(timer);
  }, [hasPhotos, e.captureFailed]);

  const isWarning = e.syncStatus === 'done' && e.direction === 'out' && e.plateMatch === false;
  // 🐛 FIX: trước đây chỉ dựa vào cờ captureFailed (chỉ được set khi có sự
  // kiện SignalR "CaptureFailedAlert" SỐNG) - log tải lại từ /api/history
  // lúc mở/refresh trang (không đi qua sự kiện sống đó) dù KHÔNG CÓ ẢNH NÀO
  // vẫn hiển thị bình thường, không cảnh báo. Thêm điều kiện suy ra trực
  // tiếp từ dữ liệu: không có ảnh + đã tồn tại đủ lâu (>15s, vượt xa thời
  // gian chụp ảnh bình thường) - tránh báo nhầm ngay lúc vừa quẹt, ảnh còn
  // đang trong quá trình chụp/tải.
  const tsNeedsZ = typeof e.timestamp === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$/.test(e.timestamp);
  const ageMs = Date.now() - new Date(tsNeedsZ ? e.timestamp + 'Z' : e.timestamp).getTime();
  const hasNoPhoto = !hasPhotos && ageMs > 15000;
  const isCaptureFailed = e.captureFailed === true || hasNoPhoto;
  // Lượt RA đã xử lý AI xong VÀ biển số khớp - bảo vệ cần thấy NGAY dấu
  // hiệu "an toàn, cho xe ra được" thay vì phải đoán xem AI đã xử lý xong
  // chưa (trước đây chỉ có cảnh báo khi LỆCH, còn khớp thì trông y hệt lúc
  // chưa xử lý xong).
  const isMatched =
    !isWarning && !isCaptureFailed && e.syncStatus === 'done' && e.direction === 'out' && e.plateMatch === true;
  const isLostCardExit = e.direction === 'out' && isCardLostExit(e.note);
  // Lượt VÀO đã xử lý AI xong - không có gì để "khớp" (chỉ lượt RA mới đối
  // chiếu với ảnh vào), nhưng bảo vệ vẫn cần biết AI đã đọc xong biển thay
  // vì đoán xem còn đang xử lý hay không - dùng cùng tông xanh với
  // is-matched (RA) cho nhất quán "an toàn", nhưng nhạt hơn để phân biệt 2
  // trạng thái khác nhau (đã xử lý xong vs đã đối chiếu khớp).
  const isInDone = !isCaptureFailed && e.syncStatus === 'done' && e.direction === 'in';
  // AI xử lý XONG (có ảnh, không phải capture lỗi) nhưng KHÔNG TÌM THẤY
  // BIỂN SỐ / đọc không ra ký tự nào (syncStatus "failed" - khác
  // isCaptureFailed vốn là KHÔNG CÓ ẢNH để xử lý). Mức độ nhẹ hơn hẳn
  // "không khớp biển" (đỏ, có thể là gian lận) hay "không chụp được ảnh"
  // (cam, lỗi camera) - đây chỉ là AI không đọc ra được, dùng màu nhạt để
  // không gây hoang mang ngang hàng 2 loại cảnh báo nghiêm trọng kia.
  const isProcessingFailed = !isWarning && !isCaptureFailed && e.syncStatus === 'failed';

  return (
    <article
      className={`m-ticker__item ${isWarning ? 'is-warning' : ''} ${
        !isWarning && isCaptureFailed ? 'is-capture-warning' : ''
      } ${isProcessingFailed ? 'is-processing-failed' : ''} ${isMatched ? 'is-matched' : ''} ${
        isInDone ? 'is-in-done' : ''
      } ${isLostCardExit ? 'is-lost-card' : ''}`}
      onClick={() => onOpen(e)}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') onOpen(e);
      }}
    >
      <span className={`m-ticker__badge ${e.direction === 'in' ? 'is-in' : 'is-out'}`}>
        {e.direction === 'in' ? 'VÀO' : 'RA'}
      </span>
      <span className="m-ticker__lane">{laneName}</span>
      {isWarning && <IconExclamationTriangle size={16} style={{ color: 'var(--m-color-error)' }} />}
      {!isWarning && isCaptureFailed && <IconCamera size={16} style={{ color: 'var(--m-color-warn)' }} />}
      {isProcessingFailed && <IconExclamationTriangle size={16} style={{ color: '#c9a227' }} />}
      {isMatched && <IconCheckCircle size={16} style={{ color: 'var(--m-color-in)' }} />}
      {isInDone && <IconCheckCircle size={16} style={{ color: 'var(--m-color-in)' }} />}
      {isLostCardExit && (
        <span title="Cho ra thủ công - báo mất thẻ" style={{ display: 'inline-flex' }}>
          <IconLockClosed size={16} style={{ color: '#7c3aed' }} />
        </span>
      )}
      <time className="m-ticker__time">{formatTime(e.timestamp)}</time>
    </article>
  );
}

export const TickerItem = React.memo(TickerItemInner);

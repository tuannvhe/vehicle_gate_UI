import React, { useEffect, useRef, useState } from 'react';
import type { HistoryItem } from '../../api/types/history';
import type { LaneOption } from '../../api/types/lane';
import { ResolvableImage } from '../common/ResolvableImage';
import { scanApi } from '../../api/endpoints/scan';
import {
  IconXMark,
  IconDocumentText,
  IconCheckCircle,
  IconXCircle,
  IconArrowDownTray,
  IconArrowUpTray,
  IconCamera,
  IconClock,
} from '../../icons/HeroIcons';
import { formatTime } from '../../utils/formatTime';
import '../../styles/app.css';
// .m-btn / .m-btn--warn (nút "Báo khớp biển") định nghĩa ở đây, không phải
// app.css - trang quét không nằm trong khu admin nên cần import trực tiếp,
// không thể trông chờ 1 trang admin khác lỡ đã nạp sẵn.
import '../../styles/admin.css';

interface Props {
  item: HistoryItem | null;
  isOpen: boolean;
  lanes: LaneOption[];
  onClose: () => void;
  // Gọi khi bảo vệ xác nhận thủ công biển số THỰC RA có khớp (do AI đọc sai)
  // - cha (ScanStation) dùng để cập nhật lại item trong danh sách "Hoạt động
  // gần đây" cho khớp, không cần tải lại cả trang.
  onPlateMatchConfirmed?: (logId: number) => void;
}

// Dịch lại 1 vài lý do thất bại phổ biến từ ai-service (tiếng Anh, dành cho
// log kỹ thuật) sang tiếng Việt dễ hiểu cho bảo vệ - "No plate detected" là
// lý do phổ biến nhất (không tìm thấy vùng biển số trong khung hình, không
// phải lỗi đọc sai ký tự) nên cần rõ ràng thay vì hiện nguyên câu tiếng Anh.
const formatAiErrorMessage = (raw: string | null | undefined) => {
  if (!raw) return 'Không tìm thấy biển số';
  if (/no plate detected/i.test(raw)) return 'Không tìm thấy biển số';
  if (/ocr failed|no text detected/i.test(raw)) return 'Không đọc được ký tự trên biển số';
  // Phòng hờ cho các log CŨ đã lỡ lưu message .NET gốc trước khi backend
  // dịch lại (xem AiDispatchService.FriendlyDispatchErrorMessage) - VD
  // "No connection could be made because the target machine actively
  // refused it. (localhost:5000)" khi ai-service chưa chạy/bị sập.
  if (/actively refused|no connection could be made|connection refused/i.test(raw)) {
    return 'Không kết nối được tới máy chủ AI - kiểm tra ai-service đã chạy chưa.';
  }
  return raw;
};

export const DetailModal: React.FC<Props> = ({ item, isOpen, lanes, onClose, onPlateMatchConfirmed }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Bản sao cục bộ chỉ để đổi ngay "Không khớp" -> "Khớp" trên modal sau khi
  // xác nhận thành công, không cần đợi cha truyền lại prop `item` mới.
  const [localPlateMatch, setLocalPlateMatch] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    setLocalPlateMatch(undefined);
    setConfirmError(null);
  }, [item?.id]);

  const handleConfirmMatch = async () => {
    if (!item) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await scanApi.confirmPlateMatch(item.id);
      setLocalPlateMatch(true);
      onPlateMatchConfirmed?.(item.id);
      // Đóng modal ngay - cha sẽ hiện thông báo thành công (toast) thay cho
      // việc để bảo vệ tự nhìn vào modal xem đã đổi trạng thái chưa.
      onClose();
    } catch (err: any) {
      setConfirmError(err?.response?.data?.error || 'Xác nhận thất bại, vui lòng thử lại.');
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    if (isOpen && dialogRef.current) {
      if (!dialogRef.current.open) dialogRef.current.showModal();
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!item || !isOpen) return null;

  const laneName = lanes.find((l) => l.id === item.lane || l.laneCode === item.lane)?.name || item.lane;

  return (
    <dialog
      ref={dialogRef}
      className="m-modal-overlay"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-modal="true"
      aria-label={`Chi tiết lượt quẹt #${item.id}`}
    >
      <article className="m-modal" onClick={(e) => e.stopPropagation()}>
        <header className="m-modal__header">
          <h3>
            <IconDocumentText size={20} /> Chi tiết lượt quẹt #{item.id}
          </h3>
          <button className="m-modal__close" onClick={onClose} aria-label="Đóng chi tiết">
            <IconXMark size={20} />
          </button>
        </header>

        <section className="m-modal__body">
          <dl className="m-modal__meta">
            <div className="m-modal__meta-item">
              <dt className="m-modal__meta-label">Log ID</dt>
              <dd className="m-modal__meta-value">#{item.id}</dd>
            </div>
            <div className="m-modal__meta-item">
              <dt className="m-modal__meta-label">Làn</dt>
              <dd className="m-modal__meta-value">{laneName}</dd>
            </div>
            <div className="m-modal__meta-item">
              <dt className="m-modal__meta-label">Thời gian</dt>
              <dd className="m-modal__meta-value">{formatTime(item.timestamp)}</dd>
            </div>
            <div className="m-modal__meta-item">
              <dt className="m-modal__meta-label">Hướng</dt>
              <dd className="m-modal__meta-value">
                {item.direction === 'in' ? (
                  <span className="m-modal__inline-status is-in">
                    <IconArrowDownTray size={14} /> VÀO
                  </span>
                ) : (
                  <span className="m-modal__inline-status is-out">
                    <IconArrowUpTray size={14} /> RA
                  </span>
                )}
              </dd>
            </div>
            <div className="m-modal__meta-item">
              <dt className="m-modal__meta-label">Trạng thái</dt>
              <dd className="m-modal__meta-value">
                {(item.syncStatus === 'pending' || item.syncStatus === 'processing') && (
                  <span className="m-modal__inline-status is-pending">
                    <IconClock size={14} /> {item.syncStatus === 'pending' ? 'Chờ xử lý' : 'Đang xử lý'}
                  </span>
                )}
                {item.syncStatus === 'done' && (
                  <span className="m-modal__inline-status is-done">
                    <IconCheckCircle size={14} /> Hoàn tất
                  </span>
                )}
                {item.syncStatus === 'failed' && (
                  <span className="m-modal__inline-status is-failed">
                    <IconXCircle size={14} /> Thất bại
                  </span>
                )}
              </dd>
            </div>
            {item.syncStatus === 'failed' && (
              <div className="m-modal__meta-item">
                <dt className="m-modal__meta-label">Lý do thất bại</dt>
                <dd className="m-modal__meta-value m-modal__inline-status is-failed">
                  {formatAiErrorMessage(item.errorMessage)}
                </dd>
              </div>
            )}
            {(() => {
              const plateMatch = localPlateMatch !== undefined ? localPlateMatch : item.plateMatch;
              if (plateMatch === undefined || plateMatch === null) return null;
              return (
                <div className={`m-modal__meta-item ${plateMatch === false ? 'm-modal__meta-item--stack' : ''}`}>
                  <div className="m-modal__meta-row">
                    <dt className="m-modal__meta-label">Khớp biển số</dt>
                    <dd className="m-modal__meta-value">
                      {plateMatch ? (
                        <span className="m-modal__inline-status is-done">
                          <IconCheckCircle size={14} /> Khớp
                        </span>
                      ) : (
                        <span className="m-modal__inline-status is-mismatch">
                          <IconXCircle size={14} /> Không khớp
                        </span>
                      )}
                    </dd>
                  </div>
                  {plateMatch === false && (
                    <div className="m-modal__confirm-stack">
                      <button
                        className="m-btn m-btn--warn"
                        style={{ width: '100%' }}
                        disabled={confirming}
                        onClick={handleConfirmMatch}
                      >
                        {confirming ? (
                          <>
                            <span className="m-btn__spinner" /> Đang xác nhận...
                          </>
                        ) : (
                          'Báo khớp biển (do hệ thống đọc lỗi)'
                        )}
                      </button>
                      {confirmError && <span className="m-modal__confirm-error">{confirmError}</span>}
                    </div>
                  )}
                </div>
              );
            })()}
            {item.guardName && (
              <div className="m-modal__meta-item">
                <dt className="m-modal__meta-label">Bảo vệ</dt>
                <dd className="m-modal__meta-value">{item.guardName}</dd>
              </div>
            )}
          </dl>

          <div className="m-modal__photos-stack">
          <section className="m-modal__photos">
            <h4 className="m-modal__photos-title">
              <IconCamera size={16} /> {item.direction === 'out' ? 'Ảnh lượt RA' : 'Ảnh đã chụp'}
            </h4>
            <div className="m-modal__photos-grid">
              {item.photoUrls && item.photoUrls.length > 0 ? (
                item.photoUrls.map((p, idx) => (
                  <figure key={idx} className="m-modal__photo-item">
                    {p ? (
                      <ResolvableImage raw={p} logId={item.id} index={idx} alt={`Ảnh camera ${idx + 1}`} />
                    ) : (
                      <div className="m-modal__no-photo">
                        <IconCamera size={20} /> Không có ảnh
                      </div>
                    )}
                    <figcaption className="m-modal__photo-label">Camera {idx + 1}</figcaption>
                  </figure>
                ))
              ) : (
                <div className="m-modal__no-photo">
                  <IconCamera size={20} /> Không có ảnh
                </div>
              )}
            </div>
          </section>

          {/* Đối chiếu với lượt VÀO tương ứng - chỉ hiện khi đây là lượt RA
              và log lúc vào còn tồn tại (xem HistoryController.Get() ở BE). */}
          {item.direction === 'out' && item.entryLogId && (
            <section className="m-modal__photos">
              <h4 className="m-modal__photos-title">
                <IconArrowDownTray size={16} /> Ảnh lượt VÀO
                {item.entryTimestamp && (
                  <span className="m-modal__hint">({formatTime(item.entryTimestamp)})</span>
                )}
              </h4>
              <div className="m-modal__photos-grid">
                {item.entryPhotoUrls && item.entryPhotoUrls.length > 0 ? (
                  item.entryPhotoUrls.map((p, idx) => (
                    <figure key={idx} className="m-modal__photo-item">
                      {p ? (
                        <ResolvableImage
                          raw={p}
                          logId={item.entryLogId!}
                          index={idx}
                          alt={`Ảnh lượt vào - camera ${idx + 1}`}
                        />
                      ) : (
                        <div className="m-modal__no-photo">
                          <IconCamera size={20} /> Không có ảnh
                        </div>
                      )}
                      <figcaption className="m-modal__photo-label">Camera {idx + 1}</figcaption>
                    </figure>
                  ))
                ) : (
                  <div className="m-modal__no-photo">
                    <IconCamera size={20} /> Không có ảnh lượt vào
                  </div>
                )}
              </div>
            </section>
          )}
          </div>
        </section>
      </article>
    </dialog>
  );
};

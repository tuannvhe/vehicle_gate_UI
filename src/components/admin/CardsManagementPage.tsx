import React, { useEffect, useRef, useState } from 'react';
import { cardsApi } from '../../api/endpoints/cards';
import type { Card } from '../../api/types/card';
import {
  IconPencil,
  IconTrash,
  IconXMark,
  IconDocumentText,
  IconExclamationTriangle,
  IconMagnifyingGlass,
  IconArrowUpTray,
  IconLockClosed,
  IconLockOpen,
} from '../../icons/HeroIcons';
import { AdminLayout } from './AdminLayout';
import { ActionToast } from '../common/ActionToast';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { getPageNumbers } from '../../utils/pagination';
import '../../styles/app.css';
import '../../styles/admin.css';

/**
 * Quản lý Thẻ - danh sách thẻ + đăng ký thẻ mới bằng modal "Quét thẻ hàng
 * loạt". Đầu đọc thật là loại HID keyboard-wedge (gõ thẳng vào ô input đang
 * focus như bàn phím) - KHÔNG dùng Web Serial/chọn cổng COM ở trang này.
 * Modal có 1 ô input luôn giữ focus để hứng dữ liệu quẹt, mỗi lần quẹt xong
 * thêm 1 dòng vào bảng tạm (chưa lưu DB) - bấm "Lưu danh sách" mới gọi API
 * lưu toàn bộ 1 lượt.
 *
 * Nhập thẻ mới (quét hàng loạt) và xóa thẻ giờ chỉ ADMIN gọi API được
 * (backend đã giới hạn) - ẩn 2 hành động này với guard. Sửa ghi chú và báo
 * mất/tìm thấy thẻ vẫn dùng được bình thường (guard xử lý hàng ngày).
 */

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  available: { label: 'Sẵn sàng', badge: 'm-badge--success' },
  issued: { label: 'Đang dùng', badge: 'm-badge--info' },
  lost: { label: 'Đã mất', badge: 'm-badge--error' },
};

const formatTime = (ts: string) => {
  try {
    const needsZ = typeof ts === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$/.test(ts);
    const parsed = needsZ ? new Date(ts + 'Z') : new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  } catch {
    return ts;
  }
};

interface ScanFeedback {
  code: string;
  ok: boolean;
  message: string;
}

const PAGE_SIZE = 10;
const MODAL_PAGE_SIZE = 8;

export const CardsManagementPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [cards, setCards] = useState<Card[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanInputValue, setScanInputValue] = useState('');
  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [modalPage, setModalPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveResults, setSaveResults] = useState<ScanFeedback[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanCommitTimeoutRef = useRef<number | null>(null);

  const [editTarget, setEditTarget] = useState<Card | null>(null);
  const [editNote, setEditNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Báo mất thẻ NGAY LẬP TỨC (khóa vĩnh viễn) - dùng khi khách báo mất thẻ
  // trong lúc xe CÒN TRONG BÃI, không cần chờ tới lúc xe ra cổng mới xử lý
  // qua "Cho xe ra thủ công" (trước đây đây là khoảng trống nghiệp vụ: ai
  // nhặt được thẻ vẫn quẹt ra bình thường như chủ xe thật cho tới lúc đó).
  const [lostTarget, setLostTarget] = useState<Card | null>(null);
  const [lostNote, setLostNote] = useState('');
  const [reportingLost, setReportingLost] = useState(false);
  const [lostError, setLostError] = useState<string | null>(null);

  // Báo thẻ ĐÃ TÌM THẤY - mở khóa 1 thẻ đang "lost" (xem ReportCardFoundAsync
  // ở backend - trạng thái trả về "issued" hay "available" tùy xe có đang
  // giữ 1 log VÀO còn mở hay không, quyết định hoàn toàn ở server).
  const [foundTarget, setFoundTarget] = useState<Card | null>(null);
  const [foundNote, setFoundNote] = useState('');
  const [reportingFound, setReportingFound] = useState(false);
  const [foundError, setFoundError] = useState<string | null>(null);

  const { toast, showSuccess, showError, dismiss } = useToast();

  const loadCards = async () => {
    setPageLoading(true);
    setLoadError(null);
    try {
      const res = await cardsApi.getAll();
      const payload = (res.data as any)?.data ?? res.data;
      setCards(Array.isArray(payload) ? payload : []);
    } catch {
      setLoadError('Không tải được danh sách thẻ.');
      setCards([]);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  useEffect(() => {
    return () => {
      if (scanCommitTimeoutRef.current) window.clearTimeout(scanCommitTimeoutRef.current);
    };
  }, []);

  const openScanModal = () => {
    setPendingCodes([]);
    setSaveResults([]);
    setModalPage(1);
    setScanInputValue('');
    setScanModalOpen(true);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  const closeScanModal = () => {
    if (saving) return;
    if (scanCommitTimeoutRef.current) window.clearTimeout(scanCommitTimeoutRef.current);
    setScanModalOpen(false);
  };

  // Thêm 1 mã vừa quẹt vào bảng TẠM (chưa gọi API) - bỏ qua mã rỗng hoặc đã
  // có sẵn trong danh sách tạm (đầu đọc HID đôi khi gửi trùng nếu quẹt lại).
  // 🐛 FIX: nhận thẳng "code" làm tham số thay vì đọc lại state scanInputValue
  // bên trong hàm - trước đây setTimeout(() => commitScannedCode(), 200) tạo
  // ra closure "đóng băng" giá trị scanInputValue tại đúng lần render lúc
  // hẹn giờ được đặt ra (luôn là giá trị TRƯỚC ký tự vừa gõ, do setState chưa
  // kịp áp dụng), nên mỗi lượt quét chỉ thực sự commit được mã của LƯỢT
  // TRƯỚC ĐÓ - phải quét đủ 2 lần mới thấy thẻ đầu tiên xuất hiện trong bảng.
  const commitScannedCode = (code: string) => {
    const trimmed = code.trim();
    setScanInputValue((prev) => (prev.trim() === trimmed ? '' : prev));
    if (!trimmed) return;

    // Kiểm tra trùng NGAY khi quẹt, trước khi thêm vào bảng tạm - trước đây
    // chỉ kiểm tra trùng trong chính bảng tạm, còn trùng với thẻ ĐÃ CÓ SẴN
    // trong hệ thống (danh sách `cards` đã tải) thì không báo gì cho tới khi
    // bấm "Lưu danh sách" mới nhận lỗi 409 từ backend.
    const existsInSystem = cards.some((c) => c.cardCode.toLowerCase() === trimmed.toLowerCase());
    if (existsInSystem) {
      showError(`${trimmed} - Mã thẻ đã tồn tại trong hệ thống`);
      return;
    }
    if (pendingCodes.includes(trimmed)) {
      showError(`${trimmed} - Đã có trong danh sách đang quét, bỏ qua`);
      return;
    }
    setPendingCodes((prev) => [...prev, trimmed]);
    showSuccess(`${trimmed} - Đã thêm vào danh sách`);
  };

  // Đầu đọc HID (keyboard-wedge) gõ thẳng vào ô input như bàn phím thật, đa
  // số kết thúc bằng Enter - nhưng phòng khi firmware không gửi Enter, vẫn
  // tự commit sau 200ms không có ký tự mới (giống ô quẹt thẻ ở LaneCard).
  const handleScanInputChange = (value: string) => {
    setScanInputValue(value);
    if (scanCommitTimeoutRef.current) window.clearTimeout(scanCommitTimeoutRef.current);
    if (value.trim()) {
      scanCommitTimeoutRef.current = window.setTimeout(() => commitScannedCode(value), 200);
    }
  };

  const removePendingCode = (code: string) => {
    setPendingCodes((prev) => prev.filter((c) => c !== code));
  };

  const saveAllPending = async () => {
    if (pendingCodes.length === 0) return;
    setSaving(true);
    const results: ScanFeedback[] = [];
    const failedCodes: string[] = [];
    for (const code of pendingCodes) {
      try {
        await cardsApi.create({ cardCode: code });
        results.push({ code, ok: true, message: 'Đã lưu' });
      } catch (err: any) {
        const status = err?.response?.status;
        const message =
          status === 409
            ? 'Mã thẻ đã tồn tại trong hệ thống'
            : err?.response?.data?.error || err?.response?.data || 'Lưu thất bại';
        results.push({ code, ok: false, message });
        failedCodes.push(code);
      }
    }
    setSaveResults(results);
    // Chỉ giữ lại các mã LƯU THẤT BẠI trong bảng tạm để người dùng sửa/thử
    // lại - mã đã lưu thành công thì bỏ khỏi danh sách tạm.
    setPendingCodes(failedCodes);
    setModalPage(1);
    setSaving(false);
    loadCards();

    const okCount = results.filter((r) => r.ok).length;
    if (failedCodes.length === 0) {
      showSuccess(`Đã lưu ${okCount} thẻ mới`);
    } else if (okCount === 0) {
      showError(`Lưu thất bại toàn bộ ${failedCodes.length} thẻ`);
    } else {
      showError(`Đã lưu ${okCount} thẻ, ${failedCodes.length} thẻ thất bại - xem chi tiết bên dưới`);
    }
  };

  const filteredCards = cards.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    // Tìm theo CẢ mã thẻ lẫn ghi chú - với ~1000 thẻ, khách báo mất qua điện
    // thoại thường không nhớ chính xác mã thẻ, chỉ nhớ tên/SĐT đã ghi chú
    // lúc phát thẻ - cần tìm ra được bằng thông tin đó thay vì chỉ mã thẻ.
    const keyword = search.trim().toLowerCase();
    if (keyword && !c.cardCode.toLowerCase().includes(keyword) && !(c.note || '').toLowerCase().includes(keyword)) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const pagedCards = filteredCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const modalTotalPages = Math.max(1, Math.ceil(pendingCodes.length / MODAL_PAGE_SIZE));
  const pagedPendingCodes = pendingCodes.slice((modalPage - 1) * MODAL_PAGE_SIZE, modalPage * MODAL_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const openEdit = (card: Card) => {
    setEditTarget(card);
    setEditNote(card.note || '');
    setEditError(null);
  };

  const closeEdit = () => {
    if (savingNote) return;
    setEditTarget(null);
  };

  const saveNote = async () => {
    if (!editTarget) return;
    setSavingNote(true);
    setEditError(null);
    try {
      await cardsApi.updateNote(editTarget.id, editNote.trim() || null);
      setEditTarget(null);
      loadCards();
      showSuccess('Đã lưu ghi chú');
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data || 'Lưu thất bại. Vui lòng thử lại.';
      setEditError(message);
      showError(message);
    } finally {
      setSavingNote(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await cardsApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      loadCards();
      showSuccess('Đã xóa thẻ');
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data || 'Xóa thất bại. Vui lòng thử lại.';
      setDeleteError(message);
      showError(message);
    } finally {
      setDeleting(false);
    }
  };

  const openReportLost = (card: Card) => {
    setLostTarget(card);
    setLostNote('');
    setLostError(null);
  };

  const closeReportLost = () => {
    if (reportingLost) return;
    setLostTarget(null);
  };

  const confirmReportLost = async () => {
    if (!lostTarget) return;
    setReportingLost(true);
    setLostError(null);
    try {
      await cardsApi.reportLost(lostTarget.id, lostNote.trim() || undefined);
      setLostTarget(null);
      loadCards();
      showSuccess(`Đã khóa thẻ ${lostTarget.cardCode} - báo mất thành công`);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data || 'Báo mất thất bại. Vui lòng thử lại.';
      setLostError(message);
      showError(message);
    } finally {
      setReportingLost(false);
    }
  };

  const openReportFound = (card: Card) => {
    setFoundTarget(card);
    setFoundNote('');
    setFoundError(null);
  };

  const closeReportFound = () => {
    if (reportingFound) return;
    setFoundTarget(null);
  };

  const confirmReportFound = async () => {
    if (!foundTarget) return;
    setReportingFound(true);
    setFoundError(null);
    try {
      await cardsApi.reportFound(foundTarget.id, foundNote.trim() || undefined);
      setFoundTarget(null);
      loadCards();
      showSuccess(`Đã mở khóa thẻ ${foundTarget.cardCode} - trạng thái mới: Sẵn sàng`);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data || 'Báo tìm thấy thất bại. Vui lòng thử lại.';
      setFoundError(message);
      showError(message);
    } finally {
      setReportingFound(false);
    }
  };

  return (
    <AdminLayout>
      <ActionToast toast={toast} onDismiss={dismiss} />
      <div className="m-page m-page--cards">
        <header className="m-page__header">
          <div>
            <h1 className="m-page__title">Quản lý thẻ</h1>
            <p className="m-page__subtitle">
              Danh sách thẻ ra vào - quẹt thẻ hàng loạt qua modal để đăng ký nhiều thẻ mới cùng lúc
            </p>
          </div>
          {isAdmin && (
            <button className="m-btn m-btn--primary" onClick={openScanModal}>
              <IconArrowUpTray size={16} /> Quét thẻ hàng loạt
            </button>
          )}
        </header>

        <div className="m-page__toolbar">
          <div className="m-search">
            <IconMagnifyingGlass size={16} />
            <input
              className="m-search__input"
              placeholder="Tìm theo mã thẻ hoặc ghi chú (tên, SĐT khách...)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="m-select" style={{ maxWidth: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="available">Sẵn sàng</option>
            <option value="issued">Đang dùng</option>
            <option value="lost">Đã mất</option>
          </select>
        </div>

        <div className="m-page__card">
          <div className="m-table-wrap">
            {pageLoading ? (
              <div className="m-table-loading">
                <span className="m-btn__spinner" /> Đang tải danh sách...
              </div>
            ) : loadError ? (
              <div className="m-table-empty">
                <IconExclamationTriangle size={28} style={{ opacity: 0.5, color: 'var(--m-color-error)' }} />
                <span>{loadError}</span>
              </div>
            ) : (
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Mã thẻ</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú</th>
                    <th>Ngày tạo</th>
                    <th className="m-table__actions-col">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCards.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="m-table-empty">
                          <IconDocumentText size={28} style={{ opacity: 0.4 }} />
                          <span>Không tìm thấy thẻ nào</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedCards.map((card) => {
                      const statusInfo = STATUS_LABEL[card.status] || { label: card.status, badge: 'm-badge--neutral' };
                      return (
                        <tr key={card.id}>
                          <td className="m-table__cell-mono" style={{ fontWeight: 700 }}>{card.cardCode}</td>
                          <td>
                            <span className={`m-badge ${statusInfo.badge}`}>{statusInfo.label}</span>
                          </td>
                          <td className="m-table__cell-muted">
                            {card.note ? (
                              <span
                                title={card.note}
                                style={{
                                  display: 'inline-block',
                                  maxWidth: 220,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  verticalAlign: 'bottom',
                                }}
                              >
                                {card.note}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="m-table__cell-muted">{formatTime(card.createdAt)}</td>
                          <td className="m-table__actions">
                            <button
                              className="m-table__icon-btn"
                              title="Sửa ghi chú"
                              aria-label="Sửa ghi chú"
                              onClick={() => openEdit(card)}
                            >
                              <IconPencil size={16} />
                            </button>
                            {card.status === 'lost' ? (
                              <button
                                className="m-table__icon-btn"
                                title="Báo đã tìm thấy thẻ (mở khóa)"
                                aria-label="Báo đã tìm thấy thẻ (mở khóa)"
                                onClick={() => openReportFound(card)}
                              >
                                <IconLockOpen size={16} />
                              </button>
                            ) : (
                              <button
                                className="m-table__icon-btn m-table__icon-btn--danger"
                                title="Báo mất thẻ ngay (không cần chờ xe ra cổng)"
                                aria-label="Báo mất thẻ ngay (không cần chờ xe ra cổng)"
                                onClick={() => openReportLost(card)}
                              >
                                <IconLockClosed size={16} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                className="m-table__icon-btn m-table__icon-btn--danger"
                                title="Xóa"
                                aria-label="Xóa"
                                disabled={card.status === 'issued'}
                                onClick={() => {
                                  setDeleteTarget(card);
                                  setDeleteError(null);
                                }}
                              >
                                <IconTrash size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {!pageLoading && !loadError && filteredCards.length > 0 && (
            <div className="m-pagination">
              <span className="m-pagination__info">
                Trang {page}/{totalPages} · {filteredCards.length} thẻ
              </span>
              <div className="m-pagination__controls">
                <button
                  className="m-pagination__btn"
                  aria-label="Trang trước"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                {getPageNumbers(page, totalPages).map((token, i) =>
                  token === 'ellipsis' ? (
                    <span key={`e${i}`} className="m-pagination__ellipsis">…</span>
                  ) : (
                    <button
                      key={token}
                      className="m-pagination__btn"
                      data-active={page === token}
                      aria-label={`Trang ${token}`}
                      aria-current={page === token ? 'page' : undefined}
                      onClick={() => setPage(token)}
                    >
                      {token}
                    </button>
                  )
                )}
                <button
                  className="m-pagination__btn"
                  aria-label="Trang sau"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal quét thẻ hàng loạt - đầu đọc HID gõ thẳng vào ô input luôn giữ
          focus, mỗi lần quẹt thêm 1 dòng vào bảng TẠM (chưa lưu DB), bấm
          "Lưu danh sách" mới gọi API lưu toàn bộ 1 lượt. */}
      {scanModalOpen && (
        <div className="m-modal-overlay" onClick={closeScanModal}>
          <article className="m-modal m-modal--lg" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Quét thẻ hàng loạt</h3>
              <button className="m-modal__close" onClick={closeScanModal} disabled={saving} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>

            <div style={{ padding: '0 1.5rem 1rem' }}>
              <label className="m-form-label">Quẹt thẻ (đầu đọc sẽ tự nhập vào ô này)</label>
              <input
                ref={scanInputRef}
                className="m-input"
                style={{ width: '100%' }}
                value={scanInputValue}
                autoFocus
                disabled={saving}
                onChange={(e) => handleScanInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (scanCommitTimeoutRef.current) window.clearTimeout(scanCommitTimeoutRef.current);
                    commitScannedCode(e.currentTarget.value);
                  }
                }}
                onBlur={() => {
                  // Giữ focus luôn ở ô này để đầu đọc HID (gõ vào phần tử
                  // đang focus) hoạt động được ngay cả khi người dùng lỡ
                  // click ra ngoài - trừ khi modal đang đóng/đang lưu.
                  if (scanModalOpen && !saving) {
                    setTimeout(() => scanInputRef.current?.focus(), 0);
                  }
                }}
                placeholder="Quẹt thẻ..."
              />
              <p className="m-table__cell-muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>
                Đã quét {pendingCodes.length} thẻ - bấm "Lưu danh sách" để lưu vào hệ thống.
              </p>
            </div>

            <div className="m-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="m-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Mã thẻ</th>
                    <th className="m-table__actions-col">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPendingCodes.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="m-table-empty">
                          <IconDocumentText size={24} style={{ opacity: 0.4 }} />
                          <span>Chưa có thẻ nào được quét</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedPendingCodes.map((code, i) => {
                      const idx = (modalPage - 1) * MODAL_PAGE_SIZE + i;
                      return (
                        <tr key={code}>
                          <td>{idx + 1}</td>
                          <td className="m-table__cell-mono" style={{ fontWeight: 700 }}>{code}</td>
                          <td className="m-table__actions">
                            <button
                              className="m-table__icon-btn m-table__icon-btn--danger"
                              title="Bỏ khỏi danh sách"
                              aria-label="Bỏ khỏi danh sách"
                              disabled={saving}
                              onClick={() => removePendingCode(code)}
                            >
                              <IconTrash size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {pendingCodes.length > 0 && modalTotalPages > 1 && (
              <div className="m-pagination" style={{ padding: '0.75rem 1.5rem 0' }}>
                <span className="m-pagination__info">
                  Trang {modalPage}/{modalTotalPages} · {pendingCodes.length} thẻ
                </span>
                <div className="m-pagination__controls">
                  <button
                    className="m-pagination__btn"
                    aria-label="Trang trước"
                    disabled={modalPage <= 1}
                    onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>
                  {getPageNumbers(modalPage, modalTotalPages).map((token, i) =>
                    token === 'ellipsis' ? (
                      <span key={`e${i}`} className="m-pagination__ellipsis">…</span>
                    ) : (
                      <button
                        key={token}
                        className="m-pagination__btn"
                        data-active={modalPage === token}
                        aria-label={`Trang ${token}`}
                        aria-current={modalPage === token ? 'page' : undefined}
                        onClick={() => setModalPage(token)}
                      >
                        {token}
                      </button>
                    )
                  )}
                  <button
                    className="m-pagination__btn"
                    aria-label="Trang sau"
                    disabled={modalPage >= modalTotalPages}
                    onClick={() => setModalPage((p) => Math.min(modalTotalPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}

            {saveResults.length > 0 && (
              <div style={{ padding: '1rem 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 160, overflowY: 'auto' }}>
                {saveResults.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.55rem 0.85rem',
                      borderRadius: 'var(--m-r-sm)',
                      background: f.ok ? 'var(--m-color-in-bg)' : 'var(--m-color-error-bg)',
                      fontSize: '0.88rem',
                    }}
                  >
                    <span className="m-table__cell-mono" style={{ fontWeight: 700 }}>{f.code}</span>
                    <span style={{ color: f.ok ? 'var(--m-color-in-text)' : 'var(--m-color-error-text)' }}>
                      {f.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={closeScanModal} disabled={saving}>
                Đóng
              </button>
              <button className="m-btn m-btn--primary" onClick={saveAllPending} disabled={saving || pendingCodes.length === 0}>
                {saving ? (
                  <>
                    <span className="m-btn__spinner" /> Đang lưu...
                  </>
                ) : (
                  `Lưu danh sách (${pendingCodes.length})`
                )}
              </button>
            </footer>
          </article>
        </div>
      )}

      {/* Modal sửa ghi chú */}
      {editTarget && (
        <div className="m-modal-overlay" onClick={closeEdit}>
          <article className="m-modal m-modal--sm" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Sửa ghi chú - {editTarget.cardCode}</h3>
              <button className="m-modal__close" onClick={closeEdit} disabled={savingNote} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>
            <div style={{ padding: '0 1.5rem 1rem' }}>
              <label className="m-form-label">Ghi chú</label>
              <textarea
                className="m-input"
                rows={3}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="VD: Thẻ cấp cho bảo vệ ca sáng"
                style={{ width: '100%', resize: 'vertical' }}
              />
              {editError && <p className="m-form-error">{editError}</p>}
            </div>
            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={closeEdit} disabled={savingNote}>
                Hủy
              </button>
              <button className="m-btn m-btn--primary" onClick={saveNote} disabled={savingNote}>
                {savingNote ? (
                  <>
                    <span className="m-btn__spinner" /> Đang lưu...
                  </>
                ) : (
                  'Lưu'
                )}
              </button>
            </footer>
          </article>
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {deleteTarget && (
        <div className="m-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <article className="m-modal m-modal--sm" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Xác nhận xóa</h3>
              <button
                className="m-modal__close"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                aria-label="Đóng"
              >
                <IconXMark size={20} />
              </button>
            </header>
            <p className="m-confirm-text">
              Bạn có chắc muốn xóa thẻ <strong>{deleteTarget.cardCode}</strong> không? Hành động này không thể
              hoàn tác.
            </p>
            {deleteError && <p className="m-form-error" style={{ padding: '0 1.5rem' }}>{deleteError}</p>}
            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Hủy
              </button>
              <button className="m-btn m-btn--danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? (
                  <>
                    <span className="m-btn__spinner" /> Đang xóa...
                  </>
                ) : (
                  'Xóa'
                )}
              </button>
            </footer>
          </article>
        </div>
      )}

      {/* Modal xác nhận báo mất thẻ NGAY (không cần chờ xe ra cổng) */}
      {lostTarget && (
        <div className="m-modal-overlay" onClick={closeReportLost}>
          <article className="m-modal m-modal--sm" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Báo mất thẻ - {lostTarget.cardCode}</h3>
              <button className="m-modal__close" onClick={closeReportLost} disabled={reportingLost} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>
            <div style={{ padding: '0 1.5rem 1rem' }}>
              <p className="m-confirm-text" style={{ margin: 0 }}>
                Thẻ sẽ bị <strong>khóa ngay lập tức</strong>, không thể quẹt vào/ra được nữa - kể cả khi thẻ này
                đang gắn với 1 xe còn trong bãi (log VÀO đang mở sẽ được đóng lại sau, khi xe đó thực sự ra cổng
                qua "Cho xe ra thủ công"). Chỉ mở khóa lại được bằng thao tác "Báo đã tìm thấy" riêng.
              </p>
              <label className="m-form-label" style={{ marginTop: '0.85rem', display: 'block' }}>
                Ghi chú <span className="m-form-label__optional">(tùy chọn)</span>
              </label>
              <textarea
                className="m-input"
                rows={2}
                value={lostNote}
                onChange={(e) => setLostNote(e.target.value)}
                placeholder="VD: Khách gọi báo mất thẻ lúc 14h"
                style={{ width: '100%', resize: 'vertical' }}
              />
              {lostError && <p className="m-form-error">{lostError}</p>}
            </div>
            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={closeReportLost} disabled={reportingLost}>
                Hủy
              </button>
              <button className="m-btn m-btn--danger" onClick={confirmReportLost} disabled={reportingLost}>
                {reportingLost ? (
                  <>
                    <span className="m-btn__spinner" /> Đang khóa thẻ...
                  </>
                ) : (
                  'Xác nhận báo mất'
                )}
              </button>
            </footer>
          </article>
        </div>
      )}

      {/* Modal xác nhận báo ĐÃ TÌM THẤY thẻ (mở khóa) */}
      {foundTarget && (
        <div className="m-modal-overlay" onClick={closeReportFound}>
          <article className="m-modal m-modal--sm" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Báo tìm thấy thẻ - {foundTarget.cardCode}</h3>
              <button className="m-modal__close" onClick={closeReportFound} disabled={reportingFound} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>
            <div style={{ padding: '0 1.5rem 1rem' }}>
              <p className="m-confirm-text" style={{ margin: 0 }}>
                Thẻ sẽ được <strong>mở khóa</strong>, về trạng thái "Sẵn sàng". Nếu thẻ này đang gắn với 1 xe còn
                thật sự trong bãi (log vào chưa đóng), phải <strong>cho ra thủ công</strong> lượt đó trước khi
                dùng lại thẻ cho lượt vào mới - hệ thống sẽ tự chặn nếu quẹt vào ngay khi lượt cũ chưa đóng.
              </p>
              <label className="m-form-label" style={{ marginTop: '0.85rem', display: 'block' }}>
                Ghi chú <span className="m-form-label__optional">(tùy chọn)</span>
              </label>
              <textarea
                className="m-input"
                rows={2}
                value={foundNote}
                onChange={(e) => setFoundNote(e.target.value)}
                placeholder="VD: Khách tìm lại được thẻ, gọi báo lúc 15h"
                style={{ width: '100%', resize: 'vertical' }}
              />
              {foundError && <p className="m-form-error">{foundError}</p>}
            </div>
            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={closeReportFound} disabled={reportingFound}>
                Hủy
              </button>
              <button className="m-btn m-btn--primary" onClick={confirmReportFound} disabled={reportingFound}>
                {reportingFound ? (
                  <>
                    <span className="m-btn__spinner" /> Đang mở khóa...
                  </>
                ) : (
                  'Xác nhận đã tìm thấy'
                )}
              </button>
            </footer>
          </article>
        </div>
      )}
    </AdminLayout>
  );
};

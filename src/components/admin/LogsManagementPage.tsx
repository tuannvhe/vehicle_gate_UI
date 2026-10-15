import React, { useEffect, useState } from 'react';
import { historyApi } from '../../api/endpoints/history';
import { lanesApi } from '../../api/endpoints/lanes';
import type { HistoryItem } from '../../api/types/history';
import type { LaneOption } from '../../api/types/lane';
import { resolvePhotoUrl } from '../../utils/photoUrl';
import { vnDayStartUtc, vnDayEndUtc } from '../../utils/dateRange';
import { getPageNumbers } from '../../utils/pagination';
import {
  IconExclamationTriangle,
  IconXMark,
  IconDocumentText,
  IconCamera,
  IconMagnifyingGlass,
} from '../../icons/HeroIcons';
import { AdminLayout } from './AdminLayout';
import { SearchableSelect } from '../common/SearchableSelect';
import '../../styles/app.css';
import '../../styles/admin.css';

/**
 * Quản lý log ra vào - liệt kê lượt quẹt (lọc server-side theo trạng thái xử
 * lý AI, làn và khoảng ngày qua /api/history?syncStatus=&lane=&from=&to=),
 * bấm vào 1 dòng để mở modal xem chi tiết + ảnh đã chụp. Luồng "Cho xe ra
 * thủ công" nằm ở trang riêng (/admin-manual-exit - xem ManualExitPage.tsx).
 */

const PAGE_SIZE = 10;

const SYNC_STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Chờ xử lý', badge: 'm-badge--neutral' },
  processing: { label: 'Đang xử lý', badge: 'm-badge--info' },
  done: { label: 'Hoàn tất', badge: 'm-badge--success' },
  failed: { label: 'Thất bại', badge: 'm-badge--error' },
};

// Đánh dấu trong Note khi lượt RA này là "cho ra thủ công" kèm tick "thẻ bị
// mất" (xem Log.CardLostNoteMarker/LogService.ManualExitAsync ở backend) -
// dùng để hiện badge cảnh báo ngay trong bảng, không cần mở modal chi tiết
// mới biết thẻ đã bị khóa.
const isCardLostExit = (note: string | null | undefined) => !!note && note.includes('Thẻ bị mất: Có');

const formatTime = (ts: string) => {
  try {
    const needsZ = typeof ts === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$/.test(ts);
    const parsed = needsZ ? new Date(ts + 'Z') : new Date(ts);
    return parsed.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
};

export const LogsManagementPage: React.FC = () => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [laneFilter, setLaneFilter] = useState('');
  const [lanes, setLanes] = useState<LaneOption[]>([]);
  const [searchText, setSearchText] = useState('');
  // Debounce 350ms trước khi gọi API - gõ tìm biển số/mã thẻ xuyên TOÀN BỘ
  // dữ liệu khớp các filter khác (server-side thật qua /api/history?search=),
  // không chỉ lọc trong trang đang tải như trước.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Lọc theo ngày - server-side thật (truyền from/to xuống /api/history),
  // KHÔNG tải hết rồi lọc ở client. Để trống = không giới hạn ngày.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [photoTarget, setPhotoTarget] = useState<HistoryItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    lanesApi
      .getAll()
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setLanes(Array.isArray(data) ? data : []);
      })
      .catch(() => setLanes([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const loadLogs = async () => {
    setPageLoading(true);
    setLoadError(null);
    try {
      const res = await historyApi.get({
        page,
        pageSize: PAGE_SIZE,
        syncStatus: statusFilter === 'all' ? undefined : statusFilter,
        lane: laneFilter || undefined,
        from: fromDate ? vnDayStartUtc(fromDate) : undefined,
        to: toDate ? vnDayEndUtc(toDate) : undefined,
        search: debouncedSearch || undefined,
      });
      const payload = (res.data as any)?.data ?? res.data;
      setItems(payload?.items ?? []);
      setTotal(payload?.total ?? 0);
    } catch {
      setLoadError('Không tải được danh sách log. Vui lòng thử lại.');
      setItems([]);
      setTotal(0);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, laneFilter, fromDate, toDate, debouncedSearch]);

  return (
    <AdminLayout>
      <div className="m-page m-page--logs">
        <header className="m-page__header">
          <div>
            <h1 className="m-page__title">Quản lý log ra vào</h1>
            <p className="m-page__subtitle">
              Theo dõi lượt quẹt thẻ và trạng thái xử lý AI - bấm vào 1 dòng để xem chi tiết
            </p>
          </div>
        </header>


        <div className="m-page__toolbar">
          <div className="m-form-field" style={{ minWidth: 240, flex: '1 1 260px' }}>
            <label className="m-form-label">Tìm kiếm</label>
            <div className="m-search">
              <IconMagnifyingGlass size={16} />
              <input
                className="m-search__input"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          <div className="m-form-field" style={{ minWidth: 0, maxWidth: 200 }}>
            <label className="m-form-label">Trạng thái</label>
            <select
              className="m-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ xử lý</option>
              <option value="processing">Đang xử lý</option>
              <option value="done">Hoàn tất</option>
              <option value="failed">Thất bại</option>
            </select>
          </div>

          <div className="m-form-field" style={{ minWidth: 0, maxWidth: 200 }}>
            <label className="m-form-label">Làn</label>
            <SearchableSelect
              options={lanes.map((l) => ({ value: l.laneCode || String(l.id), label: l.name }))}
              value={laneFilter}
              onChange={(v) => {
                setLaneFilter(v);
                setPage(1);
              }}
              placeholder="Tất cả làn"
              allowClear
              clearLabel="Tất cả làn"
            />
          </div>

          <div className="m-form-field" style={{ minWidth: 0 }}>
            <label className="m-form-label">Từ ngày</label>
            <input
              type="date"
              className="m-input"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="m-form-field" style={{ minWidth: 0 }}>
            <label className="m-form-label">Đến ngày</label>
            <input
              type="date"
              className="m-input"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {(fromDate || toDate || laneFilter) && (
            <button
              className="m-btn m-btn--secondary"
              style={{ alignSelf: 'flex-end' }}
              onClick={() => {
                setFromDate('');
                setToDate('');
                setLaneFilter('');
                setPage(1);
              }}
            >
              Bỏ lọc
            </button>
          )}
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
              <table className="m-table m-table--logs">
                <thead>
                  <tr>
                    <th>Log ID</th>
                    <th className="m-table__thumb-col">Ảnh</th>
                    <th>Mã thẻ</th>
                    <th>Làn</th>
                    <th>Hướng</th>
                    <th>Thời gian</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="m-table-empty">
                          <IconDocumentText size={28} style={{ opacity: 0.4 }} />
                          <span>Không tìm thấy log nào</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const statusInfo = SYNC_STATUS_LABEL[item.syncStatus] || {
                        label: item.syncStatus,
                        badge: 'm-badge--neutral',
                      };
                      return (
                        <tr
                          key={item.id}
                          className="m-table__row-clickable"
                          onClick={() => setPhotoTarget(item)}
                        >
                          <td className="m-table__cell-mono m-table__cell-muted">#{item.id}</td>
                          <td className="m-table__thumb-col">
                            {item.photoUrls && item.photoUrls.length > 0 ? (
                              <div className="m-table__thumb-group">
                                {item.photoUrls.slice(0, 2).map((url, i) => (
                                  <img
                                    key={i}
                                    src={resolvePhotoUrl(url)}
                                    alt={`Ảnh ${i + 1} log #${item.id}`}
                                    className="m-table__thumb"
                                    loading="lazy"
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="m-table__thumb m-table__thumb--empty">
                                <IconCamera size={16} />
                              </div>
                            )}
                          </td>
                          <td style={{ fontWeight: 700 }}>{item.cardCode}</td>
                          <td>{item.lane}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {item.direction === 'in' ? (
                                <span className="m-badge m-badge--success">VÀO</span>
                              ) : (
                                <span className="m-badge m-badge--info">RA</span>
                              )}
                              {isCardLostExit(item.note) && (
                                <span className="m-badge m-badge--error" title="Cho ra thủ công kèm báo mất thẻ">
                                  Mất thẻ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="m-table__cell-muted">{formatTime(item.timestamp)}</td>
                          <td>
                            <span className={`m-badge ${statusInfo.badge}`}>{statusInfo.label}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="m-pagination">
            <span className="m-pagination__info">
              {total === 0 ? 'Không có dữ liệu' : `Trang ${page}/${totalPages} · ${total} log`}
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
        </div>
      </div>

      {/* Modal xem chi tiết log ở giữa màn hình - tái dùng .m-modal-overlay/.m-modal chung. */}
      {photoTarget && (
        <div className="m-modal-overlay" onClick={() => setPhotoTarget(null)}>
          <article className="m-modal m-modal--lg" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>
                Log #{photoTarget.id} · {photoTarget.cardCode}
              </h3>
              <button className="m-modal__close" onClick={() => setPhotoTarget(null)} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>
            <section className="m-modal__body m-modal__body--form">
              <dl className="m-detail-meta">
                <div>
                  <dt>Hướng</dt>
                  <dd style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {photoTarget.direction === 'in' ? (
                      <span className="m-badge m-badge--success">VÀO</span>
                    ) : (
                      <span className="m-badge m-badge--info">RA</span>
                    )}
                    {isCardLostExit(photoTarget.note) && (
                      <span className="m-badge m-badge--error">Cho ra thủ công - Mất thẻ</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Làn</dt>
                  <dd>{photoTarget.lane}</dd>
                </div>
                <div>
                  <dt>Thời gian</dt>
                  <dd>{formatTime(photoTarget.timestamp)}</dd>
                </div>
                <div>
                  <dt>Biển số</dt>
                  <dd>{photoTarget.plateNumber || '—'}</dd>
                </div>
              </dl>

              {photoTarget.photoUrls && photoTarget.photoUrls.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {photoTarget.photoUrls.map((url, i) => (
                    <div key={i} className="m-vehicle-card__photo" style={{ width: '100%', height: 200 }}>
                      <img src={resolvePhotoUrl(url)} alt={`Ảnh ${i + 1}`} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="m-table-empty">
                  <IconCamera size={28} style={{ opacity: 0.4 }} />
                  <span>Chưa có ảnh cho log này</span>
                </div>
              )}

              {photoTarget.direction === 'out' && photoTarget.entryPhotoUrls && photoTarget.entryPhotoUrls.length > 0 && (
                <>
                  <div className="m-detail-section-title">
                    <span>Ảnh lúc VÀO</span>
                    <span className="m-table__cell-mono m-table__cell-muted">
                      #{photoTarget.entryLogId}
                      {photoTarget.entryTimestamp ? ` · ${formatTime(photoTarget.entryTimestamp)}` : ''}
                      {photoTarget.entryPlateNumber ? ` · ${photoTarget.entryPlateNumber}` : ''}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    {photoTarget.entryPhotoUrls.map((url, i) => (
                      <div key={i} className="m-vehicle-card__photo" style={{ width: '100%', height: 200 }}>
                        <img src={resolvePhotoUrl(url)} alt={`Ảnh vào ${i + 1}`} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </article>
        </div>
      )}
    </AdminLayout>
  );
};

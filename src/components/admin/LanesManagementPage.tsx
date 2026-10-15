import React, { useEffect, useState } from 'react';
import { lanesApi } from '../../api/endpoints/lanes';
import type { LaneOption } from '../../api/types/lane';
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconXMark,
  IconDocumentText,
  IconExclamationTriangle,
} from '../../icons/HeroIcons';
import { AdminLayout } from './AdminLayout';
import { ActionToast } from '../common/ActionToast';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { getPageNumbers } from '../../utils/pagination';
import '../../styles/app.css';
import '../../styles/admin.css';

/**
 * Quản lý Làn xe - CRUD đầy đủ (backend /api/lanes đã hỗ trợ sẵn từ trước).
 * Trạng thái làn ("active"/"inactive") KHÔNG liên quan CardReaderVendorId/
 * ProductId/Label (ghép đôi đầu đọc thẻ qua Web Serial) - trường đó chỉ sửa
 * được trực tiếp trên LaneCard ở màn hình quét, không sửa ở đây.
 *
 * Tạo/sửa/xóa làn giờ chỉ ADMIN gọi API được (backend đã giới hạn) - ẩn hẳn
 * các nút này với guard thay vì để họ bấm rồi mới thấy lỗi 403 khó hiểu.
 */

const emptyForm = {
  laneCode: '',
  name: '',
  description: '',
  cameraCount: '2',
  status: 'active',
};

const PAGE_SIZE = 10;

export const LanesManagementPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [lanes, setLanes] = useState<LaneOption[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingLane, setEditingLane] = useState<LaneOption | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<LaneOption | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { toast, showSuccess, showError, dismiss } = useToast();

  const loadLanes = async () => {
    setPageLoading(true);
    setLoadError(null);
    try {
      const res = await lanesApi.getAll();
      const payload = (res.data as any)?.data ?? res.data;
      setLanes(Array.isArray(payload) ? payload : []);
    } catch {
      setLoadError('Không tải được danh sách làn xe.');
      setLanes([]);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadLanes();
  }, []);

  const totalPages = Math.max(1, Math.ceil(lanes.length / PAGE_SIZE));
  const pagedLanes = lanes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const openCreate = () => {
    setModalMode('create');
    setEditingLane(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const openEdit = (lane: LaneOption) => {
    setModalMode('edit');
    setEditingLane(lane);
    setForm({
      laneCode: lane.laneCode,
      name: lane.name,
      description: lane.description || '',
      cameraCount: String(lane.cameraCount ?? 2),
      status: lane.status,
    });
    setFormError(null);
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setEditingLane(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || (modalMode === 'create' && !form.laneCode.trim())) {
      setFormError('Vui lòng nhập đầy đủ Mã làn và Tên làn.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        await lanesApi.create({
          laneCode: form.laneCode.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          cameraCount: Number(form.cameraCount) || 1,
        });
      } else if (modalMode === 'edit' && editingLane) {
        // UpdateLaneDto ở BE yêu cầu Name/Description/Status - KHÔNG có
        // LaneCode/CameraCount (2 trường này cố định sau khi tạo, đổi
        // CameraCount sau khi đã có camera gắn vào sẽ làm lệch số ảnh mong
        // đợi lúc chụp - phải sửa qua trang Cameras, không sửa ở đây).
        await lanesApi.update(Number(editingLane.id), {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          status: form.status,
        });
      }
      closeModal();
      loadLanes();
      showSuccess(modalMode === 'create' ? 'Đã thêm làn xe mới' : 'Đã lưu thay đổi làn xe');
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.response?.data || err?.message || 'Lưu thất bại. Vui lòng thử lại.';
      setFormError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await lanesApi.delete(Number(deleteTarget.id));
      setDeleteTarget(null);
      loadLanes();
      showSuccess('Đã xóa làn xe');
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.response?.data || err?.message || 'Xóa thất bại. Vui lòng thử lại.';
      setDeleteError(message);
      showError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <ActionToast toast={toast} onDismiss={dismiss} />
      <div className="m-page m-page--lanes">
        <header className="m-page__header">
          <div>
            <h1 className="m-page__title">Quản lý làn xe</h1>
            <p className="m-page__subtitle">Danh sách làn ra vào và số camera gắn theo từng làn</p>
          </div>
          {isAdmin && (
            <button className="m-btn m-btn--primary" onClick={openCreate}>
              <IconPlus size={18} /> Thêm làn xe
            </button>
          )}
        </header>

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
                    <th>Tên làn</th>
                    <th>Mã làn</th>
                    <th>Mô tả</th>
                    <th>Số camera</th>
                    <th>Trạng thái</th>
                    <th className="m-table__actions-col">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLanes.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="m-table-empty">
                          <IconDocumentText size={28} style={{ opacity: 0.4 }} />
                          <span>Chưa có làn xe nào</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedLanes.map((lane) => (
                      <tr key={lane.id}>
                        <td style={{ fontWeight: 700 }}>{lane.name}</td>
                        <td className="m-table__cell-mono m-table__cell-muted">{lane.laneCode}</td>
                        <td className="m-table__cell-muted">{lane.description || '—'}</td>
                        <td>{lane.cameraCount}</td>
                        <td>
                          {lane.status === 'active' ? (
                            <span className="m-badge m-badge--success">Hoạt động</span>
                          ) : (
                            <span className="m-badge m-badge--neutral">Ngừng</span>
                          )}
                        </td>
                        <td className="m-table__actions">
                          {isAdmin ? (
                            <>
                              <button
                                className="m-table__icon-btn"
                                title="Sửa"
                                aria-label="Sửa"
                                onClick={() => openEdit(lane)}
                              >
                                <IconPencil size={16} />
                              </button>
                              <button
                                className="m-table__icon-btn m-table__icon-btn--danger"
                                title="Xóa"
                                aria-label="Xóa"
                                onClick={() => {
                                  setDeleteTarget(lane);
                                  setDeleteError(null);
                                }}
                              >
                                <IconTrash size={16} />
                              </button>
                            </>
                          ) : (
                            <span className="m-table__cell-muted" style={{ fontSize: '0.8rem' }}>
                              Chỉ admin
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {!pageLoading && !loadError && lanes.length > 0 && (
            <div className="m-pagination">
              <span className="m-pagination__info">
                Trang {page}/{totalPages} · {lanes.length} làn
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

      {/* Modal Create/Edit */}
      {modalMode && (
        <div className="m-modal-overlay" onClick={closeModal}>
          <article className="m-modal m-modal--form" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>
                <IconDocumentText size={18} />
                {modalMode === 'create' ? 'Thêm làn xe' : 'Sửa làn xe'}
              </h3>
              <button className="m-modal__close" onClick={closeModal} disabled={saving} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>

            <section className="m-modal__body m-modal__body--form">
              <div className="m-form-grid">
                <div className="m-form-field">
                  <label className="m-form-label">Mã làn</label>
                  <input
                    className="m-input"
                    value={form.laneCode}
                    disabled={modalMode === 'edit'}
                    onChange={(e) => setForm({ ...form, laneCode: e.target.value })}
                    placeholder="VD: motorbike"
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Tên làn</label>
                  <input
                    className="m-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: Làn xe máy"
                  />
                </div>
                <div className="m-form-field m-form-field--full">
                  <label className="m-form-label">
                    Mô tả <span className="m-form-label__optional">(tùy chọn)</span>
                  </label>
                  <input
                    className="m-input"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                {modalMode === 'create' && (
                  <div className="m-form-field">
                    <label className="m-form-label">Số camera</label>
                    <select
                      className="m-select"
                      value={form.cameraCount}
                      onChange={(e) => setForm({ ...form, cameraCount: e.target.value })}
                    >
                      <option value="1">1 camera</option>
                      <option value="2">2 camera</option>
                      <option value="3">3 camera</option>
                    </select>
                  </div>
                )}
                {modalMode === 'edit' && (
                  <div className="m-form-field">
                    <label className="m-form-label">Trạng thái</label>
                    <select
                      className="m-select"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="active">Hoạt động</option>
                      <option value="inactive">Ngừng</option>
                    </select>
                  </div>
                )}
                {formError && (
                  <div className="m-form-field--full">
                    <span className="m-form-error">{formError}</span>
                  </div>
                )}
              </div>
            </section>

            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={closeModal} disabled={saving}>
                Hủy
              </button>
              <button className="m-btn m-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? (
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
              Bạn có chắc muốn xóa làn <strong>{deleteTarget.name}</strong> không? Camera thuộc làn này (nếu
              còn) cũng có thể bị ảnh hưởng. Hành động này không thể hoàn tác.
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
    </AdminLayout>
  );
};

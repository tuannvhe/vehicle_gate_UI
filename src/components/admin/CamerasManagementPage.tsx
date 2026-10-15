import React, { useEffect, useState } from 'react';
import { camerasApi } from '../../api/endpoints/cameras';
import { lanesApi } from '../../api/endpoints/lanes';
import type { Camera, LaneOption } from '../../api/types/lane';
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconXMark,
  IconDocumentText,
  IconExclamationTriangle,
} from '../../icons/HeroIcons';
import { AdminLayout } from './AdminLayout';
import { SearchableSelect } from '../common/SearchableSelect';
import { ActionToast } from '../common/ActionToast';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import { getPageNumbers } from '../../utils/pagination';
import '../../styles/app.css';
import '../../styles/admin.css';

/**
 * Quản lý Camera - CRUD cấu hình camera vật lý gắn theo từng làn. CameraIndex
 * PHẢI duy nhất trong 1 làn (backend chặn trùng) - ScanController.CapturePhotos
 * ghép ảnh<->camera theo đúng chỉ số này khi chụp.
 *
 * Tạo/sửa/xóa camera giờ chỉ ADMIN gọi API được (backend đã giới hạn, vì
 * form có cả username/password RTSP thật) - ẩn hẳn các nút này với guard.
 */

const emptyForm = {
  laneId: '',
  cameraIndex: '0',
  name: '',
  cameraType: 'hikvision',
  ipAddress: '',
  port: '80',
  username: 'admin',
  password: '',
  channel: '1',
  stream: '1',
  snapshotUrl: '',
  rtspUrl: '',
  status: 'active',
};

const PAGE_SIZE = 10;

export const CamerasManagementPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [lanes, setLanes] = useState<LaneOption[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [laneFilter, setLaneFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { toast, showSuccess, showError, dismiss } = useToast();

  const laneName = (laneId: number) => lanes.find((l) => Number(l.id) === laneId)?.name || `#${laneId}`;

  // Mỗi làn tối đa 2 camera (Trước = index 0, Sau = index 1, xem <select> "Vị trí
  // camera" bên dưới) - làn nào đã đủ 2 camera thì ẩn khỏi danh sách chọn khi
  // THÊM MỚI để tránh chọn nhầm làn đã đầy rồi bị backend chặn trùng cameraIndex.
  const laneCameraCount = (laneId: number) => cameras.filter((c) => c.laneId === laneId).length;
  const laneOptionsForForm = lanes.filter(
    (lane) => laneCameraCount(Number(lane.id)) < 2 || (editingCamera && Number(lane.id) === editingCamera.laneId)
  );

  const loadAll = async () => {
    setPageLoading(true);
    setLoadError(null);
    try {
      const [camerasRes, lanesRes] = await Promise.all([camerasApi.getAll(), lanesApi.getAll()]);
      const camerasPayload = (camerasRes.data as any)?.data ?? camerasRes.data;
      const lanesPayload = (lanesRes.data as any)?.data ?? lanesRes.data;
      setCameras(Array.isArray(camerasPayload) ? camerasPayload : []);
      setLanes(Array.isArray(lanesPayload) ? lanesPayload : []);
    } catch {
      setLoadError('Không tải được danh sách camera.');
      setCameras([]);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredCameras =
    laneFilter === 'all' ? cameras : cameras.filter((c) => String(c.laneId) === laneFilter);

  const totalPages = Math.max(1, Math.ceil(filteredCameras.length / PAGE_SIZE));
  const pagedCameras = filteredCameras.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [laneFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const openCreate = () => {
    const firstAvailableLane = lanes.find((lane) => laneCameraCount(Number(lane.id)) < 2);
    setModalMode('create');
    setEditingCamera(null);
    setForm({ ...emptyForm, laneId: firstAvailableLane ? String(firstAvailableLane.id) : '' });
    setFormError(null);
  };

  const openEdit = (camera: Camera) => {
    setModalMode('edit');
    setEditingCamera(camera);
    setForm({
      laneId: String(camera.laneId),
      cameraIndex: String(camera.cameraIndex),
      name: camera.name,
      cameraType: camera.cameraType,
      ipAddress: camera.ipAddress,
      port: String(camera.port),
      username: camera.username,
      password: camera.password,
      channel: String(camera.channel),
      stream: String(camera.stream),
      snapshotUrl: camera.snapshotUrl || '',
      rtspUrl: camera.rtspUrl || '',
      status: camera.status,
    });
    setFormError(null);
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setEditingCamera(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.laneId || !form.ipAddress.trim() || !form.username.trim()) {
      setFormError('Vui lòng nhập đầy đủ Làn, Tên camera, IP và Username.');
      return;
    }

    const payload = {
      laneId: Number(form.laneId),
      cameraIndex: Number(form.cameraIndex) || 0,
      name: form.name.trim(),
      cameraType: form.cameraType,
      ipAddress: form.ipAddress.trim(),
      port: Number(form.port) || 80,
      username: form.username.trim(),
      password: form.password,
      channel: Number(form.channel) || 1,
      stream: Number(form.stream) || 1,
      snapshotUrl: form.snapshotUrl.trim() || undefined,
      rtspUrl: form.rtspUrl.trim() || undefined,
      status: form.status,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        await camerasApi.create(payload);
      } else if (modalMode === 'edit' && editingCamera) {
        await camerasApi.update(editingCamera.id, payload);
      }
      closeModal();
      loadAll();
      showSuccess(modalMode === 'create' ? 'Đã thêm camera mới' : 'Đã lưu thay đổi camera');
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
      await camerasApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      loadAll();
      showSuccess('Đã xóa camera');
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
      <div className="m-page m-page--cameras">
        <header className="m-page__header">
          <div>
            <h1 className="m-page__title">Quản lý Camera</h1>
            <p className="m-page__subtitle">Cấu hình camera gắn theo từng làn (chỉ số camera phải khác nhau trong cùng 1 làn)</p>
          </div>
          {isAdmin && (
            <button
              className="m-btn m-btn--primary"
              onClick={openCreate}
              disabled={lanes.every((lane) => laneCameraCount(Number(lane.id)) >= 2)}
              title={
                lanes.every((lane) => laneCameraCount(Number(lane.id)) >= 2)
                  ? 'Tất cả các làn đã đủ 2 camera'
                  : undefined
              }
            >
              <IconPlus size={18} /> Thêm camera
            </button>
          )}
        </header>

        <div className="m-page__toolbar">
          <div className="m-form-field" style={{ minWidth: 0, maxWidth: 280 }}>
            <label className="m-form-label">Lọc theo làn</label>
            <SearchableSelect
              options={lanes.map((lane) => ({ value: String(lane.id), label: lane.name }))}
              value={laneFilter === 'all' ? '' : laneFilter}
              onChange={(v) => setLaneFilter(v || 'all')}
              placeholder="Tất cả làn"
              allowClear
              clearLabel="Tất cả làn"
            />
          </div>
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
                    <th>Tên camera</th>
                    <th>Làn</th>
                    <th>IP : Port</th>
                    <th>Loại</th>
                    <th>Trạng thái</th>
                    <th className="m-table__actions-col">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCameras.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="m-table-empty">
                          <IconDocumentText size={28} style={{ opacity: 0.4 }} />
                          <span>Chưa có camera nào</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedCameras.map((camera) => (
                      <tr key={camera.id}>
                        <td style={{ fontWeight: 700 }}>{camera.name}</td>
                        <td>{laneName(camera.laneId)}</td>
                        <td className="m-table__cell-mono">
                          {camera.ipAddress}:{camera.port}
                        </td>
                        <td className="m-table__cell-muted">{camera.cameraType}</td>
                        <td>
                          {camera.status === 'active' ? (
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
                                onClick={() => openEdit(camera)}
                              >
                                <IconPencil size={16} />
                              </button>
                              <button
                                className="m-table__icon-btn m-table__icon-btn--danger"
                                title="Xóa"
                                aria-label="Xóa"
                                onClick={() => {
                                  setDeleteTarget(camera);
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

          {!pageLoading && !loadError && filteredCameras.length > 0 && (
            <div className="m-pagination">
              <span className="m-pagination__info">
                Trang {page}/{totalPages} · {filteredCameras.length} camera
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
          <article className="m-modal m-modal--lg" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>
                <IconDocumentText size={18} />
                {modalMode === 'create' ? 'Thêm camera' : 'Sửa camera'}
              </h3>
              <button className="m-modal__close" onClick={closeModal} disabled={saving} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>

            <section className="m-modal__body m-modal__body--form">
              <div className="m-form-grid">
                <div className="m-form-field">
                  <label className="m-form-label">
                    Làn{' '}
                    {modalMode === 'create' && (
                      <span className="m-form-label__optional">(chỉ hiện làn còn thiếu camera - mỗi làn tối đa 2)</span>
                    )}
                  </label>
                  <SearchableSelect
                    options={laneOptionsForForm.map((lane) => ({ value: String(lane.id), label: lane.name }))}
                    value={form.laneId}
                    onChange={(v) => setForm({ ...form, laneId: v })}
                    placeholder="Chọn làn..."
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Vị trí camera</label>
                  <select
                    className="m-select"
                    value={form.cameraIndex}
                    onChange={(e) => setForm({ ...form, cameraIndex: e.target.value })}
                  >
                    <option value="0">Trước</option>
                    <option value="1">Sau</option>
                  </select>
                </div>
                <div className="m-form-field m-form-field--full">
                  <label className="m-form-label">Tên camera</label>
                  <input
                    className="m-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: Camera trước"
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Loại</label>
                  <select
                    className="m-select"
                    value={form.cameraType}
                    onChange={(e) => setForm({ ...form, cameraType: e.target.value })}
                  >
                    <option value="hikvision">Hikvision</option>
                    <option value="dahua">Dahua</option>
                    <option value="generic">Khác</option>
                  </select>
                </div>
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
                <div className="m-form-field">
                  <label className="m-form-label">Địa chỉ IP</label>
                  <input
                    className="m-input"
                    value={form.ipAddress}
                    onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                    placeholder="VD: 192.168.1.64"
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Cổng HTTP (snapshot)</label>
                  <input
                    className="m-input"
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: e.target.value })}
                    placeholder="80 hoặc 8000 - KHÔNG dùng cổng RTSP (554)"
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Username</label>
                  <input
                    className="m-input"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Password</label>
                  <input
                    className="m-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Channel</label>
                  <input
                    className="m-input"
                    type="number"
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Stream</label>
                  <input
                    className="m-input"
                    type="number"
                    value={form.stream}
                    onChange={(e) => setForm({ ...form, stream: e.target.value })}
                  />
                </div>
                <div className="m-form-field m-form-field--full">
                  <label className="m-form-label">
                    Snapshot URL <span className="m-form-label__optional">(tùy chọn - để trống sẽ tự dựng từ IP/Port/Channel/Stream)</span>
                  </label>
                  <input
                    className="m-input"
                    value={form.snapshotUrl}
                    onChange={(e) => setForm({ ...form, snapshotUrl: e.target.value })}
                    placeholder="http://192.168.1.64/ISAPI/Streaming/channels/101/picture"
                  />
                </div>
                <div className="m-form-field m-form-field--full">
                  <label className="m-form-label">
                    RTSP URL <span className="m-form-label__optional">(tùy chọn)</span>
                  </label>
                  <input
                    className="m-input"
                    value={form.rtspUrl}
                    onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })}
                  />
                </div>
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
              Bạn có chắc muốn xóa camera <strong>{deleteTarget.name}</strong> không? Hành động này không thể hoàn tác.
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

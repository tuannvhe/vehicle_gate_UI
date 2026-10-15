// src/api/endpoints/scan.ts
import { api } from '../client';
import type {
  ScanRequest,
  ScanResponse,
  PhotoUploadResponse,
  LogStatusResponse,
  CurrentEntry,
  ManualExitResponse,
} from '../types/scan';

export const scanApi = {
  // Gửi cả direct body và wrapper req để hỗ trợ cả hai kiểu server contract
  scan: (data: { cardCode: string; lane: string }) => {
    console.log('📤 Sending scan data:', data);
    return api.post('/scan', data); // KHÔNG có wrapper { req: data }
  },
  
  capturePhotos: (logId: number, lane: string) => {
    console.log('📤 Capture API request:', { logId, lane });
    return api.post<PhotoUploadResponse>(
      `/scan/${logId}/capture`, 
      { lane },
    );
  },
  
  uploadPhotos: (logId: number, photos: File[]) => {
    const formData = new FormData();
    photos.forEach((photo) => {
      formData.append('photos', photo);
    });
    return api.upload<PhotoUploadResponse>(`/scan/${logId}/photos`, formData);
  },
  
  getStatus: (logId: number) => api.get<LogStatusResponse>(`/scan/${logId}/status`),
  getPhoto: (logId: number, cameraIndex: number) =>
    `/scan/${logId}/photo/${cameraIndex}`,
  getThumbnail: (logId: number, cameraIndex: number) =>
    `/scan/${logId}/thumbnail/${cameraIndex}`,

  // Xe đang trong bãi - dùng để chọn đúng log khi "Cho ra thủ công".
  getCurrentEntries: () => api.get<CurrentEntry[]>('/scan/current-entries'),

  // Cho xe ra thủ công không qua quẹt thẻ (VD thẻ đã báo mất khi xe còn
  // trong bãi) - yêu cầu đăng nhập (JWT). Backend validate lại toàn bộ field
  // (không chỉ tin frontend) vì đây là bước an ninh quan trọng nhất của quy
  // trình thay thế quẹt thẻ.
  manualExit: (
    logId: number,
    data: { note: string; staffCode: string; plateNumber: string; documentsChecked: boolean; cardLost: boolean }
  ) => api.post<ManualExitResponse>(`/scan/${logId}/manual-exit`, data),

  // Xác nhận thủ công biển số THỰC RA có khớp - dùng khi bảo vệ xem ảnh thấy
  // rõ đúng 1 xe nhưng AI đọc sai khiến hệ thống báo "Không khớp" oan.
  confirmPlateMatch: (logId: number) =>
    api.post<{ id: number; plateMatch: boolean }>(`/scan/${logId}/confirm-plate-match`),
};
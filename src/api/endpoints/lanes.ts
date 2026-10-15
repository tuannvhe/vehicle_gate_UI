import { api } from '../client';
import type { LaneOption } from '../types/lane';

export const lanesApi = {
  // Lấy danh sách lane từ DB (trả về id, laneCode, name, cameras...)
  getAll: () => api.get<LaneOption[]>('/lanes'),
  getById: (id: number) => api.get<LaneOption>(`/lanes/${id}`),
  getByCode: (code: string) => api.get<LaneOption>(`/lanes/code/${code}`),
  create: (data: any) => api.post('/lanes', data),
  update: (id: number, data: any) => api.put(`/lanes/${id}`, data),
  delete: (id: number) => api.delete(`/lanes/${id}`),

  // Lưu/gỡ ghép đôi đầu đọc thẻ qua Web Serial API (xem useSerialCardReader.ts).
  // Endpoint RIÊNG (PATCH /lanes/{id}/card-reader) - không dùng chung PUT
  // sửa cấu hình làn nữa (PUT giờ giới hạn chỉ admin, còn ghép đôi đầu đọc
  // là việc guard trực ca vẫn cần tự làm được từ màn hình quét).
  updateCardReader: (
    lane: LaneOption,
    reader: { vendorId: number | null; productId: number | null; label: string | null }
  ) =>
    api.patch(`/lanes/${lane.id}/card-reader`, {
      cardReaderVendorId: reader.vendorId,
      cardReaderProductId: reader.productId,
      cardReaderLabel: reader.label,
    }),
};
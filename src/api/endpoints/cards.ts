import { api } from '../client';
import type { Card, CreateCardRequest } from '../types/card';

export const cardsApi = {
  getAll: () => api.get<Card[]>('/cards'),
  getById: (id: number) => api.get<Card>(`/cards/${id}`),
  getByCode: (code: string) => api.get<Card>(`/cards/code/${code}`),
  create: (data: CreateCardRequest) => api.post<Card>('/cards', data),
  updateStatus: (id: number, status: string) =>
    api.patch<Card>(`/cards/${id}/status`, status),
  // Báo mất thẻ NGAY LẬP TỨC (khóa vĩnh viễn) - dùng khi khách báo mất thẻ
  // trong lúc xe CÒN TRONG BÃI, không cần chờ tới lúc xe ra cổng mới xử lý
  // (xem CardsController.ReportLost/LogService.ReportCardLostAsync).
  reportLost: (id: number, note?: string) => api.post<Card>(`/cards/${id}/report-lost`, { note }),
  // Báo thẻ ĐÃ TÌM THẤY - mở khóa 1 thẻ đang "lost" (xem CardsController.
  // ReportFound/LogService.ReportCardFoundAsync).
  reportFound: (id: number, note?: string) => api.post<Card>(`/cards/${id}/report-found`, { note }),
  updateNote: (id: number, note: string | null) => api.put<Card>(`/cards/${id}`, { note }),
  delete: (id: number) => api.delete(`/cards/${id}`),
  getAvailable: () => api.get<Card[]>('/cards/available'),
  getIssued: () => api.get<Card[]>('/cards/issued'),
  getAvailableCount: () => api.get<{ available: number }>('/cards/count/available'),
};
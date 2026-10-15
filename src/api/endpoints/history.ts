import { api } from '../client';
import type { HistoryResponse, HistoryFilter } from '../types/history';

export const historyApi = {
  get: (params: HistoryFilter) => 
    api.get<HistoryResponse>('/history', params),
  getByCard: (cardId: number, params?: HistoryFilter) => 
    api.get<HistoryResponse>(`/history/card/${cardId}`, params),
  export: (params?: HistoryFilter) => 
    api.get('/history/export', { ...params, responseType: 'blob' }),
};
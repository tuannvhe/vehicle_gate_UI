import { api } from '../client';
import type { CurrentStatus, StatsResponse } from '../types/status';

export const statusApi = {
  getCurrent: () => api.get<CurrentStatus[]>('/status/current'),
  getStats: () => api.get<StatsResponse>('/status/stats'),
};
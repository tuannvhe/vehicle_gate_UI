import { api } from '../client';
import type { Camera } from '../types/lane';

export interface CameraFormData {
  laneId: number;
  cameraIndex: number;
  name: string;
  cameraType: string;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  channel: number;
  stream: number;
  snapshotUrl?: string;
  rtspUrl?: string;
  status?: string;
}

export const camerasApi = {
  getAll: (laneId?: number) => api.get<Camera[]>('/cameras', laneId ? { laneId } : undefined),
  getById: (id: number) => api.get<Camera>(`/cameras/${id}`),
  create: (data: CameraFormData) => api.post<Camera>('/cameras', data),
  update: (id: number, data: CameraFormData) => api.put<Camera>(`/cameras/${id}`, data),
  delete: (id: number) => api.delete(`/cameras/${id}`),
};

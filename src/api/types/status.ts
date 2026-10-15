export interface CurrentStatus {
  id: number;
  cardCode: string;
  lane: string;  // Tên lane để hiển thị
  laneId?: number;
  timestamp: string;
  plateNumber?: string;
  photoUrls: string[];
}

export interface StatsResponse {
  totalInside: number;
  totalAvailable: number;
  totalLost: number;
  timestamp: string;
  currentEntries: CurrentStatus[];
  // Dải KPI đầu trang màn quét
  inCountToday: number;
  outCountToday: number;
  processingCount: number;
  pendingAlertCount: number;
}
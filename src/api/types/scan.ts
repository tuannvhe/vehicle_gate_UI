// src/api/types/scan.ts
export interface ScanRequest {
  cardCode: string;
  lane: string;
  guardId?: number;
  note?: string;
}

export interface CaptureRequest {
  lane: string;
}
export interface ScanResponse {
  logId: number;
  cardCode: string;
  lane: string;
  direction: 'in' | 'out';
  timestamp: string;
  cardStatus: string;
  syncStatus: 'pending' | 'capturing' | 'processing' | 'done' | 'failed';
  message: string;
}

export interface PhotoUploadResponse {
  logId: number;
  photoUrls: string[];
  syncStatus: string;
  message: string;
}

export interface LogStatusResponse {
  id: number;
  cardCode?: string;
  lane: string;
  direction: 'in' | 'out';
  timestamp: string;
  syncStatus: string;
  retryCount: number;
  errorMessage?: string;
  plateNumber?: string;
  plateMatch?: boolean;
  ocrConfidence?: number;
  processedAt?: string;
  photoCount: number;
}

// Xe đang trong bãi (Direction="in", thẻ chưa "available") - dùng cho trang
// "Cho ra thủ công". cardStatus phân biệt "issued" (bình thường) với "lost"
// (thẻ đã bị báo mất) để hiển thị cảnh báo rõ ràng.
export interface CurrentEntry {
  logId: number;
  cardCode: string;
  cardStatus: 'issued' | 'lost' | string;
  lane: string;
  timestamp: string;
  plateNumber?: string;
  photoUrls: string[];
}

export interface ManualExitResponse {
  logId: number;
  entryLogId: number;
  cardCode: string;
  lane: string;
  timestamp: string;
  message: string;
}

export interface ScanEvent {
  id: number;
  cardCode: string;
  lane: string;
  direction: 'in' | 'out';
  timestamp: string;
  syncStatus: string;
  photoPaths?: string[];
  stage:
    | 'scanned'
    | 'duplicate'
    | 'retaking'
    | 'capturing'
    | 'captured'
    | 'uploaded'
    | 'processed'
    | 'failed'
    | 'manual-exit'
    | 'plate-match-confirmed';
  plateNumber?: string;
  plateMatch?: boolean | null;
  // Biển lượt VÀO tương ứng - chỉ có ở stage "processed" của lượt RA.
  entryPlateNumber?: string | null;
  ocrConfidence?: number;
  error?: string;
}

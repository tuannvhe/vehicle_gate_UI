export interface HistoryItem {
  id: number;
  cardCode: string;
  lane: string;  // Tên lane (string) để hiển thị
  laneId?: number;  // Thêm laneId nếu cần
  direction: 'in' | 'out';
  timestamp: string;
  plateNumber?: string;
  ocrConfidence?: number;
  plateMatch?: boolean;
  photoUrls: string[];
  syncStatus: string;
  // Lý do AI xử lý thất bại (chỉ có giá trị khi syncStatus="failed") - hiển
  // thị trong modal chi tiết để biết chính xác vì sao (không phát hiện được
  // biển số, timeout gọi AI service, AI service lỗi...) thay vì chỉ thấy
  // chữ "Thất bại" chung chung.
  errorMessage?: string | null;
  guardName?: string;
  note?: string | null;
  // Chỉ có giá trị khi direction='out' và log lúc vào còn tồn tại - dùng để
  // hiển thị thêm ảnh lượt VÀO trong modal chi tiết của lượt RA.
  entryLogId?: number | null;
  entryTimestamp?: string | null;
  entryPlateNumber?: string | null;
  entryPhotoUrls?: string[];
  // Cờ CHỈ CÓ Ở FRONTEND (không tới từ backend) - set khi nhận được sự kiện
  // SignalR "CaptureFailedAlert" cho log này, dùng để bôi màu cảnh báo trong
  // ticker "Hoạt động gần đây".
  captureFailed?: boolean;
}

export interface HistoryResponse {
  total: number;
  page: number;
  pageSize: number;
  items: HistoryItem[];
}

export interface HistoryFilter {
  page?: number;
  pageSize?: number;
  lane?: string;
  from?: string;
  to?: string;
  syncStatus?: string;
  direction?: 'in' | 'out';
  manualOnly?: boolean;
  search?: string;
  // Lọc theo trạng thái "thẻ bị mất" TẠI THỜI ĐIỂM cho ra thủ công (đánh dấu
  // trong Note lúc tạo log - xem LogService.ManualExitAsync ở backend) -
  // true = chỉ lấy lượt có tick "thẻ bị mất", false = chỉ lấy lượt KHÔNG mất.
  cardLost?: boolean;
}
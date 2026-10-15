export interface Camera {
  id: number;
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
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LaneOption {
  id: string;  // Đổi từ number thành string (vì laneCode là string)
  laneCode: string;
  name: string;
  description?: string;
  cameraCount: number;
  status: string;
  cameras?: Camera[];
  createdAt: string;
  updatedAt?: string;
  // Ghép đôi đầu đọc thẻ qua cổng COM (Web Serial API) - xem useSerialCardReader.ts.
  // Web Serial không cho JS đọc tên cổng thật ("COM3"), chỉ có vendorId/
  // productId của thiết bị USB, nên đây là định danh phần cứng lưu ở DB.
  cardReaderVendorId?: number | null;
  cardReaderProductId?: number | null;
  cardReaderLabel?: string | null;
}

export interface LaneSettings {
  lanes: LaneOption[];
}
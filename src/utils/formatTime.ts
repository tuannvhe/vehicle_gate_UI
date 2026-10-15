// Backend trả timestamp KHÔNG có hậu tố "Z" dù là UTC (JSON serialize mặc
// định của .NET DateTime không tự thêm) - JS Date hiểu chuỗi không có "Z"
// là GIỜ ĐỊA PHƯƠNG, làm lệch múi giờ khi hiển thị. Tự thêm "Z" trước khi
// parse nếu phát hiện đúng định dạng ISO không hậu tố, để Date hiểu đúng là
// UTC rồi tự quy đổi sang giờ VN lúc format.
export function formatTime(ts: string): string {
  try {
    const needsZ = typeof ts === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$/.test(ts);
    const parsed = needsZ ? new Date(ts + 'Z') : new Date(ts);
    return parsed.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

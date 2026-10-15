/**
 * Quy đổi 1 ngày lịch VIỆT NAM (từ <input type="date">, dạng "YYYY-MM-DD",
 * không mang múi giờ) thành mốc UTC chính xác để gửi lên backend qua các
 * tham số from/to của /api/history.
 *
 * 🐛 FIX: trước đây gửi thẳng "${date}T00:00:00"/"T23:59:59" KHÔNG kèm múi
 * giờ - ASP.NET Core model-bind chuỗi này thành DateTime Kind=Unspecified,
 * rồi EF Core so sánh TRỰC TIẾP với cột Timestamp (luôn lưu UTC, xem
 * Log.Timestamp = DateTime.UtcNow) - nghĩa là "00:00:00" bị hiểu nhầm thành
 * 0h UTC thay vì 0h giờ Việt Nam (UTC+7, tức 17h ngày hôm trước theo UTC).
 * Kết quả: lọc "hôm nay" thực chất lấy khoảng 7h sáng hôm nay -> 6h59 sáng
 * hôm sau (giờ VN) - sai lệch rõ nhất với log rơi vào khung 0h-7h hoặc
 * 17h-24h giờ VN, dễ bị xếp nhầm sang ngày liền kề.
 *
 * Dùng offset "+07:00" TƯỜNG MINH trong chuỗi ISO khi tạo Date - đúng bất kể
 * múi giờ hệ điều hành của trình duyệt đang chạy là gì (không phụ thuộc
 * "may mắn" trùng giờ VN).
 */
export const vnDayStartUtc = (dateStr: string): string => new Date(`${dateStr}T00:00:00+07:00`).toISOString();

export const vnDayEndUtc = (dateStr: string): string => new Date(`${dateStr}T23:59:59.999+07:00`).toISOString();

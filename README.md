# Vehicle Gate — Giao diện web

Giao diện web của hệ thống kiểm soát xe ra vào **Vehicle Gate**: màn hình quét thẻ tại chốt bảo vệ và các trang quản trị.
Xây dựng bằng React 19 + TypeScript + Vite, nhận sự kiện thời gian thực qua SignalR.

Các repo liên quan:
- Dịch vụ AI đọc biển số: [vehicle_gate_AI](https://github.com/tuannvhe/vehicle_gate_AI)
- Backend .NET: `Vehicle_Gate_Management` (REST API + SignalR hub `/hubs/display`, mặc định `https://localhost:7069`)

## Chức năng

| Trang | Đường dẫn | Ai dùng |
|---|---|---|
| Màn hình quét thẻ | `/` | Bảo vệ, quản trị viên |
| Quản lý log ra vào | `/admin-logs` | Bảo vệ, quản trị viên |
| Cho xe ra thủ công | `/admin-manual-exit` | Bảo vệ, quản trị viên |
| Quản lý thẻ | `/admin-cards` | Bảo vệ, quản trị viên (tạo/xoá thẻ, quét hàng loạt: chỉ quản trị viên) |
| Quản lý làn xe | `/admin-lanes` | Quản trị viên |
| Quản lý camera | `/admin-cameras` | Quản trị viên |

**Màn hình quét thẻ:**
- Mỗi làn là một thẻ có ô nhận mã thẻ. Đầu đọc RFID kiểu bàn phím gõ vào ô đang có focus (làn đó hiện viền xanh và chip "ĐANG NHẬN THẺ").
  Có hỗ trợ ghép đôi đầu đọc cổng COM qua Web Serial trên trình duyệt Chromium.
- Sau khi quẹt: hướng VÀO/RA, ảnh các camera, biển số AI đọc được và kết quả đối chiếu biển lúc ra với lúc vào.
- Cột "Hoạt động gần đây" cập nhật thời gian thực, cuộn để tải thêm, bấm một dòng để xem chi tiết.
- Cảnh báo lệch biển số và lỗi chụp ảnh hiện dạng hộp thông báo kèm âm thanh, không tự đóng; băng đỏ khi mất kết nối máy chủ.
- Tự chuyển giao diện nền tối từ 19h đến 6h.

## Chạy khi phát triển

Yêu cầu Node.js 20+ và backend đang chạy tại `https://localhost:7069`.

```bash
npm install
npm run dev        # http://localhost:5173
```

Lần đầu, mở `https://localhost:7069` trong trình duyệt và chấp nhận chứng chỉ tự ký của backend, nếu không trình duyệt sẽ chặn mọi lời gọi API.

Các lệnh khác:

```bash
npm run build      # kiểm tra kiểu TypeScript + build ra thư mục dist/
npm run lint       # oxlint
npm run preview    # chạy thử bản build
```

## Cấu hình địa chỉ backend khi triển khai

Mặc định giao diện gọi `https://localhost:7069/api`, chỉ đúng khi backend chạy trên cùng máy. Khi triển khai cho máy trực khác, khai báo địa chỉ backend thật bằng `window.__API_URL__` trong `index.html` (hoặc `dist/index.html` sau khi build), **trước** thẻ script của ứng dụng:

```html
<script>window.__API_URL__ = 'https://192.168.1.10:7069/api';</script>
```

REST API, SignalR hub và đường dẫn ảnh đều lấy từ giá trị này. Backend chỉ cho phép (CORS) các origin đã khai báo trong `Program.cs`, nên phải thêm origin của máy chạy giao diện vào đó.

## Cấu trúc thư mục

```
src/
  api/              Axios client (tự làm mới access token), endpoint và kiểu dữ liệu
  components/
    scan/           Màn hình quét: ScanStation, ticker, modal chi tiết, cảnh báo
    lane/           LaneCard — thẻ từng làn, nhận mã thẻ, chụp ảnh, hiển thị kết quả
    admin/          Các trang quản trị và khung AdminLayout
    auth/, common/  Đăng nhập, route bảo vệ, toast, select tìm kiếm...
  contexts/         AuthContext (JWT), SignalRContext (sự kiện thời gian thực)
  hooks/            Âm thanh cảnh báo, đầu đọc COM (Web Serial), toast
  styles/           app.css (màn quét), admin.css (trang quản trị)
public/             Âm thanh cảnh báo, icon
```

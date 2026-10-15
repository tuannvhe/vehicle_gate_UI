import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SignalRProvider } from './contexts/SignalRContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Login } from './components/auth/Login';
import { ScanStation } from './components/scan/ScanStation';
import { LogsManagementPage } from './components/admin/LogsManagementPage';
import { ManualExitPage } from './components/admin/ManualExitPage';
import { LanesManagementPage } from './components/admin/LanesManagementPage';
import { CamerasManagementPage } from './components/admin/CamerasManagementPage';
import { CardsManagementPage } from './components/admin/CardsManagementPage';
import { RouteLoadingBar } from './components/common/RouteLoadingBar';
import { FlashToast } from './components/common/FlashToast';
import './styles/app.css';

// 🔥 FIX: KHÔNG được để SignalRProvider dùng url mặc định (localhost:7069).
// Trước đây mỗi máy tự kết nối vào localhost của CHÍNH NÓ thay vì server thật
// -> chỉ máy dev (nơi server cũng chạy local) mới "vô tình" đúng, còn mọi
// máy/tab khác không bao giờ nhận được sự kiện SignalR (im lặng hoàn toàn).
//
// 🔧 Dùng LẠI đúng nguồn cấu hình mà api/client.ts đang dùng
// (window.__API_URL__, được set runtime — thường trong index.html hoặc
// public/config.js khi deploy) để đảm bảo API REST và SignalR hub luôn
// trỏ về CÙNG một server, không bị lệch giữa 2 nơi.
const rawApiUrl =
  (typeof window !== 'undefined' && (window as any).__API_URL__) ||
  'https://localhost:7069/api';

// apiUrl có dạng "https://host:port/api" -> bỏ hậu tố "/api" để lấy gốc host,
// rồi ghép "/hubs/display" cho đúng route của SignalR hub.
const API_ROOT = rawApiUrl.replace(/\/api\/?$/, '');
const SIGNALR_HUB_URL = `${API_ROOT}/hubs/display`;

const App: React.FC = () => {
  return (
    // 🔥 QUAN TRỌNG: BrowserRouter phải bọc ngoài cùng (Cấp độ cao nhất)
    <BrowserRouter>
      <AuthProvider>
        <SignalRProvider url={SIGNALR_HUB_URL}>
          <RouteLoadingBar />
          <FlashToast />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ScanStation />
                </ProtectedRoute>
              }
            />
            <Route path="/admin" element={<Navigate to="/admin-manual-exit" replace />} />
            <Route
              path="/admin-logs"
              element={
                <ProtectedRoute>
                  <LogsManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-manual-exit"
              element={
                <ProtectedRoute>
                  <ManualExitPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-lanes"
              element={
                <ProtectedRoute requiredRole="admin">
                  <LanesManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-cameras"
              element={
                <ProtectedRoute requiredRole="admin">
                  <CamerasManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-cards"
              element={
                <ProtectedRoute>
                  <CardsManagementPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SignalRProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
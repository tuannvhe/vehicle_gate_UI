import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/app.css';

interface Props {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'guard' | 'viewer';
}

export const ProtectedRoute: React.FC<Props> = ({ children, requiredRole }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <main className="m-board__loading" aria-busy="true" aria-label="Đang kiểm tra quyền truy cập">
        <span className="m-board__loading-spinner" />
        <p>Đang xác thực thông tin...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

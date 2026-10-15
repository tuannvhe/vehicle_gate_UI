import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

class ApiClient {
  private client: AxiosInstance;
  private apiUrl: string;
  // 🔧 FIX RACE CONDITION: AuthContext (refresh CHỦ ĐỘNG theo lịch, xem
  // scheduleTokenRefresh) và interceptor bên dưới (refresh PHẢN ỨNG khi gặp
  // 401) trước đây MỖI BÊN TỰ GỌI axios.post('/auth/refresh-token') RIÊNG,
  // không biết đến nhau. Nếu 2 luồng này vô tình kích hoạt gần như cùng lúc
  // (rất dễ xảy ra đúng lúc access token sắp hết hạn), cả 2 gửi CÙNG 1
  // refresh token cũ lên server - nếu backend chỉ cho dùng refresh token 1
  // lần (xoay vòng), request thứ 2 bị từ chối THẬT -> logout oan dù phiên
  // vẫn còn hiệu lực. sharedRefreshPromise đảm bảo TOÀN BỘ app (dù gọi từ
  // đâu) chỉ có ĐÚNG 1 request refresh-token bay ra tại 1 thời điểm.
  private sharedRefreshPromise: Promise<any> | null = null;

  constructor(baseURL?: string) {
    // Sử dụng giá trị mặc định hoặc từ window
    const apiUrl = baseURL ||
      (typeof window !== 'undefined' && (window as any).__API_URL__) ||
      'https://localhost:7069/api';

    this.apiUrl = apiUrl;
    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      // 🔒 Access/refresh token giờ nằm trong HttpOnly cookie do backend đặt
      // (xem AuthController + AuthCookies.cs) - JS KHÔNG còn đọc/gắn token
      // vào header Authorization thủ công nữa (chống đánh cắp token qua
      // XSS). withCredentials bắt buộc để trình duyệt gửi kèm cookie này
      // trên request cross-origin (frontend/backend khác port/domain).
      withCredentials: true,
    });

    // Response interceptor - không còn request interceptor gắn header
    // Authorization thủ công (cookie tự động đính kèm bởi trình duyệt).
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config || {};
        const url = config.url || '';
        const isLoginRequest = url.includes('/auth/login');
        const isRefreshRequest = url.includes('/auth/refresh-token');

        if (error.response?.status === 401 && !isLoginRequest && !isRefreshRequest) {
          if ((config as any)._retry) {
            return Promise.reject(error);
          }
          (config as any)._retry = true;

          try {
            // refreshTokens() tự dedupe - nếu AuthContext (refresh theo lịch)
            // đang refresh cùng lúc, request này CHỜ CHUNG kết quả đó thay vì
            // tự bắn thêm 1 request refresh-token song song (xem giải thích ở
            // sharedRefreshPromise). Không cần tự gắn lại header Authorization
            // - cookie mới (do refresh-token set) đã tự động dùng cho lần
            // gọi lại (retry) này.
            await this.refreshTokens();
            return this.client.request(config);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Refresh access/refresh token - ĐIỂM VÀO DUY NHẤT cho toàn app (cả
   * interceptor 401 phản ứng ở trên lẫn AuthContext.refreshTokenAsync chủ
   * động theo lịch đều PHẢI gọi qua đây, không tự bắn axios.post riêng).
   * Nếu đã có 1 lần refresh đang chạy, mọi lệnh gọi tới trong lúc đó nhận
   * lại CHÍNH promise đó thay vì tạo request mới - đảm bảo tại 1 thời điểm
   * chỉ có ĐÚNG 1 request POST /auth/refresh-token bay ra, bất kể ai gọi.
   * (Backend xoay vòng refresh token 1 lần dùng - 2 request refresh trùng
   * thời điểm sẽ làm request thứ 2 bị từ chối thật, gây logout oan.)
   */
  public async refreshTokens(): Promise<any> {
    if (this.sharedRefreshPromise) {
      return this.sharedRefreshPromise;
    }

    // Không còn đọc/gửi refreshToken thủ công - cookie HttpOnly do backend
    // đặt (vgm_rt) tự động đính kèm nhờ withCredentials:true. Nếu cookie
    // không tồn tại/hết hạn, backend tự trả 401.
    this.sharedRefreshPromise = (async () => {
      try {
        const response = await axios.post(
          `${this.apiUrl}/auth/refresh-token`,
          {},
          { withCredentials: true }
        );
        const data = response.data.data ?? response.data;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:tokens-refreshed', { detail: data }));
        }

        return data;
      } catch (err: any) {
        // Chỉ coi là đăng xuất khi SERVER THẬT SỰ TỪ CHỐI (có response, VD
        // 401 vì refresh token cookie hết hạn/không hợp lệ) - KHÔNG khi đây
        // là lỗi mạng/timeout (err.response không tồn tại).
        const isNetworkError = !err?.response;
        if (!isNetworkError) {
          this.clearAuthData();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
        throw err;
      } finally {
        this.sharedRefreshPromise = null;
      }
    })();

    return this.sharedRefreshPromise;
  }

  // Giờ chỉ còn cache thông tin user (KHÔNG nhạy cảm, chỉ để hiện UI nhanh
  // trước khi /auth/me phản hồi) - token thật nằm trong HttpOnly cookie,
  // JS không cầm/lưu token nữa.
  public clearAuthData() {
    localStorage.removeItem('user');
  }

  async get<T = any>(url: string, params?: any): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.get(url, { params });
  }

  async post<T = any>(url: string, data?: any): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.post(url, data);
  }

  async put<T = any>(url: string, data?: any): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.put(url, data);
  }

  async patch<T = any>(url: string, data?: any): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.patch(url, data);
  }

  async delete<T = any>(url: string): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.delete(url);
  }

  async upload<T = any>(url: string, formData: FormData): Promise<AxiosResponse<ApiResponse<T>>> {
    return this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }
}

export const api = new ApiClient();
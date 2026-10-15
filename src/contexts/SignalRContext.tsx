import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import type { ScanEvent } from '../api/types/scan';

// 🆕 Sự kiện cảnh báo biển số không khớp, gửi riêng từ AiWebhookController
interface PlateMismatchEvent {
  logId: number;
  cardCode: string;
  lane: string;
  entryPlate: string;
  exitPlate: string;
  timestamp: string;
  message: string;
}

// 🆕 Cảnh báo log không thể xử lý AI sau khi đã hết số lần thử lại - gửi từ
// LogProcessingWorker/AiWebhookController (backend) khi RetryCount chạm
// AiProcessingSettings.MaxRetryCount.
interface ProcessingFailedEvent {
  logId: number;
  cardCode: string;
  lane: string;
  errorMessage: string;
  timestamp: string;
  message: string;
}

// 🆕 Không chụp được ảnh nào cho lượt quét - gửi từ ScanController.CapturePhotos
// (camera lỗi/timeout/không cấu hình) - broadcast tới TẤT CẢ client, khác với
// bản cũ chỉ phát hiện cục bộ ở đúng máy vừa quét qua polling.
interface CaptureFailedEvent {
  logId: number;
  cardCode: string;
  lane: string;
  timestamp: string;
  message: string;
}

interface SignalRContextType {
  connection: signalR.HubConnection | null;
  isConnected: boolean;
  scanEvents: ScanEvent[];
  plateMismatchEvents: PlateMismatchEvent[]; // 🆕
  processingFailedEvents: ProcessingFailedEvent[]; // 🆕
  captureFailedEvents: CaptureFailedEvent[]; // 🆕
  reconnectedAt?: number | null;
  sendMessage: (method: string, ...args: any[]) => Promise<void>;
  clearEvents: () => void;
}

const SignalRContext = createContext<SignalRContextType | undefined>(undefined);

export const useSignalR = () => {
  const context = useContext(SignalRContext);
  if (!context) {
    throw new Error('useSignalR must be used within SignalRProvider');
  }
  return context;
};

interface SignalRProviderProps {
  children: React.ReactNode;
  url?: string;
}

export const SignalRProvider: React.FC<SignalRProviderProps> = ({ 
  children, 
  url = 'https://localhost:7069/hubs/display' 
}) => {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // 🚀 FIX: Thay đổi từ Date.now() sang counter tăng dần
  const [reconnectCounter, setReconnectCounter] = useState(0);
  
  const [scanEvents, setScanEvents] = useState<ScanEvent[]>([]);
  const [plateMismatchEvents, setPlateMismatchEvents] = useState<PlateMismatchEvent[]>([]); // 🆕
  const [processingFailedEvents, setProcessingFailedEvents] = useState<ProcessingFailedEvent[]>([]); // 🆕
  const [captureFailedEvents, setCaptureFailedEvents] = useState<CaptureFailedEvent[]>([]); // 🆕

  // Dùng useRef để lưu trạng thái kết nối trước đó nhằm tránh vòng lặp vô hạn
  const prevConnectedRef = useRef(false);

  // 🔧 FIX: withAutomaticReconnect của SignalR CHỈ áp dụng cho kết nối đã
  // start() THÀNH CÔNG rồi bị rớt giữa chừng - nó KHÔNG retry nếu lần
  // start() ĐẦU TIÊN thất bại (VD trang vừa mở lúc backend chưa sẵn sàng,
  // hoặc mất mạng đúng lúc đó) - trước đây .catch() chỉ log lỗi rồi bỏ luôn,
  // isConnected mãi mãi là false, không có cách nào tự phục hồi ngoài F5.
  //
  // onclose cũng tương tự - SignalR chỉ gọi onclose khi automatic reconnect
  // đã THẬT SỰ bỏ cuộc (không còn thử nữa), lúc đó cũng cần tự start() lại
  // thủ công, nếu không kết nối coi như chết vĩnh viễn.
  //
  // stoppedRef đánh dấu component đã unmount / đang tạo connection MỚI (đổi
  // url) - để vòng lặp retry cũ dừng lại, không tiếp tục chạy ngầm sau khi
  // effect đã cleanup.
  const stoppedRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stoppedRef.current = false;

    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          if (retryContext.elapsedMilliseconds < 60000) {
            return 5000;
          }
          return 30000;
        },
      })
      .build();

    newConnection.on('ScanEvent', (data: ScanEvent) => {
      console.log('ScanEvent received:', data);
      // Cùng id + stage -> THAY bản cũ bằng bản mới (đưa lên đầu), không bỏ
      // qua: bấm "Chụp lại" chạy lại AI cho CÙNG log, sinh stage "processed"
      // lần 2 với biển số/kết quả khớp MỚI - bỏ qua thì UI kẹt ở kết quả cũ.
      setScanEvents((prev) => {
        const rest = prev.filter(e => !(e.id === data.id && e.stage === data.stage));
        return [data, ...rest].slice(0, 100);
      });
    });

    // 🆕 Lắng nghe sự kiện cảnh báo biển số không khớp (gửi riêng từ AiWebhookController)
    newConnection.on('PlateMismatch', (data: PlateMismatchEvent) => {
      console.log('PlateMismatch received:', data);
      setPlateMismatchEvents((prev) => [data, ...prev].slice(0, 50));
    });

    // 🆕 Log không đọc được biển số sau khi hết số lần thử lại - cần bảo vệ/
    // quản lý can thiệp thủ công (gửi từ LogProcessingWorker/AiWebhookController).
    newConnection.on('ProcessingFailedAlert', (data: ProcessingFailedEvent) => {
      console.log('ProcessingFailedAlert received:', data);
      setProcessingFailedEvents((prev) => [data, ...prev].slice(0, 50));
    });

    // 🆕 Không chụp được ảnh (camera lỗi) - gửi từ ScanController.CapturePhotos
    newConnection.on('CaptureFailedAlert', (data: CaptureFailedEvent) => {
      console.log('CaptureFailedAlert received:', data);
      setCaptureFailedEvents((prev) => [data, ...prev].slice(0, 50));
    });

    newConnection.on('UserConnected', (connectionId: string) => {
      console.log('User connected:', connectionId);
    });

    newConnection.on('UserDisconnected', (connectionId: string) => {
      console.log('User disconnected:', connectionId);
    });

    newConnection.onreconnecting((err) => {
      console.warn('SignalR reconnecting...', err);
      setIsConnected(false);
    });

    newConnection.onreconnected((connectionId?: string) => {
      console.log('SignalR reconnected:', connectionId);
      setIsConnected(true);
      
      // 🚀 FIX: Tăng counter lên 1 đơn vị thay vì dùng Date.now()
      // Điều này giúp `ScanStation` biết là có kết nối lại, 
      // nhưng giá trị này chỉ thay đổi đúng 1 lần khi kết nối lại thành công.
      setReconnectCounter(prev => prev + 1);
    });

    // Thử start() lại với backoff tăng dần (3s -> 6s -> 12s..., trần 30s) -
    // dùng chung cho cả lần connect ĐẦU TIÊN thất bại lẫn khi onclose bắn ra
    // (automatic reconnect đã bỏ cuộc thật sự). Không dùng attempt cố định
    // vô hạn kiểu retry ngay lập tức để tránh dội liên tục vào server đang
    // gặp sự cố.
    const connectWithRetry = (attempt: number) => {
      if (stoppedRef.current) return;

      newConnection
        .start()
        .then(() => {
          if (stoppedRef.current) return;
          setIsConnected(true);
          console.log('SignalR connected to:', url);
        })
        .catch((err) => {
          if (stoppedRef.current) return;
          const delay = Math.min(30000, 3000 * Math.pow(2, attempt));
          console.error(
            `SignalR connection failed (lần thử ${attempt + 1}), thử lại sau ${delay / 1000}s:`,
            err
          );
          retryTimeoutRef.current = setTimeout(() => connectWithRetry(attempt + 1), delay);
        });
    };

    newConnection.onclose((err) => {
      console.warn('SignalR connection closed - sẽ tự kết nối lại', err);
      setIsConnected(false);
      // onclose chỉ bắn ra khi automatic reconnect đã bỏ cuộc THẬT SỰ - phải
      // tự start() lại thủ công, nếu không kết nối chết vĩnh viễn tới khi F5.
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(() => connectWithRetry(0), 3000);
    });

    connectWithRetry(0);

    setConnection(newConnection);

    return () => {
      stoppedRef.current = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      newConnection.stop();
    };
  }, [url]);

  // Kiểm tra trạng thái kết nối khi `isConnected` thay đổi.
  // Nếu vừa mới kết nối thành công (từ false -> true), tăng counter lên 1.
  // Việc này đảm bảo `ScanStation` chỉ bị trigger 1 lần duy nhất khi có kết nối.
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      setReconnectCounter(prev => prev + 1);
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected]);

  const sendMessage = useCallback(async (method: string, ...args: any[]) => {
    if (connection && isConnected) {
      try {
        await connection.send(method, ...args);
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  }, [connection, isConnected]);

  const clearEvents = useCallback(() => {
    setScanEvents([]);
    setPlateMismatchEvents([]); // 🆕
    setProcessingFailedEvents([]); // 🆕
    setCaptureFailedEvents([]); // 🆕
  }, []);

  return (
    <SignalRContext.Provider value={{
      connection,
      isConnected,
      scanEvents,
      plateMismatchEvents, // 🆕
      processingFailedEvents, // 🆕
      captureFailedEvents, // 🆕
      reconnectedAt: reconnectCounter, // 🚀 Đã đổi thành counter an toàn
      sendMessage,
      clearEvents
    }}>
      {children}
    </SignalRContext.Provider>
  );
};
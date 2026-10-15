import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Đọc thẻ qua cổng COM bằng Web Serial API - dùng song song với ô nhập thẻ
 * bình thường (đầu đọc HID keyboard-wedge vẫn gõ thẳng vào ô input, không
 * cần hook này). Hook này dành cho đầu đọc RS-232/USB-serial THẬT, cần mở
 * cổng nối tiếp qua trình duyệt.
 *
 * GIỚI HẠN QUAN TRỌNG của Web Serial API (không phải bug, là chủ đích bảo
 * mật của trình duyệt): JS KHÔNG BAO GIỜ đọc được tên cổng thật ("COM3"),
 * chỉ có usbVendorId/usbProductId của thiết bị USB - và nhiều thiết bị
 * (cổng COM thật trên mainboard, một số adapter) KHÔNG trả các giá trị này.
 * - Lần đầu ghép đôi: bảo vệ/quản trị bấm "Ghép đôi đầu đọc", trình duyệt
 *   hiện hộp thoại chọn thiết bị (chỉ hiện được sau 1 cử chỉ người dùng
 *   thật - không thể tự động chạy khi tải trang).
 * - Trình duyệt tự nhớ quyền đã cấp cho thiết bị đó (theo origin), nên
 *   pairing (vendorId/productId) lưu ở DB (qua lanesApi) dùng để lần sau
 *   TỰ ĐỘNG nhận diện lại đúng port trong số các port trình duyệt đã từng
 *   được cấp quyền (navigator.serial.getPorts()) mà KHÔNG cần hỏi lại.
 * - Nếu thiết bị không trả vendorId/productId VÀ máy có từ 2 cổng trở lên
 *   đã từng được cấp quyền, KHÔNG có cách nào trong JS để biết chắc cổng
 *   nào là cổng nào sau khi tải lại trang - lúc đó bắt buộc phải ghép đôi
 *   lại thủ công (giới hạn của trình duyệt, không sửa được bằng code).
 * - Chỉ hoạt động trên trình duyệt nền Chromium (Chrome/Edge) - Firefox/
 *   Safari không hỗ trợ Web Serial, isSupported sẽ là false.
 */

export interface SerialPairing {
  vendorId?: number | null;
  productId?: number | null;
  // Chỉ có giá trị SAU KHI đã từng ghép đôi thành công (xem LaneCard) - dùng
  // làm dấu hiệu "làn này có đầu đọc đã ghép đôi" khi vendorId bị null (thiết
  // bị không trả USB info, xem fix bên dưới).
  label?: string | null;
}

export type SerialReaderStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseSerialCardReaderResult {
  isSupported: boolean;
  status: SerialReaderStatus;
  /** Mở hộp thoại chọn thiết bị - CHỈ gọi được từ trong 1 handler click thật. */
  pairNewDevice: () => Promise<SerialPairing | null>;
  disconnect: () => Promise<void>;
}

const DEFAULT_BAUD_RATE = 9600;

export function useSerialCardReader(
  pairing: SerialPairing | null | undefined,
  onCardCode: (code: string) => void
): UseSerialCardReaderResult {
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;
  const [status, setStatus] = useState<SerialReaderStatus>(isSupported ? 'disconnected' : 'unsupported');

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const stopFlagRef = useRef(false);
  const onCardCodeRef = useRef(onCardCode);
  onCardCodeRef.current = onCardCode;

  const readLoop = useCallback(async (port: any) => {
    stopFlagRef.current = false;
    const textDecoder = new TextDecoderStream();
    const readableClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    let buffer = '';
    try {
      while (!stopFlagRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += value;
        // Đầu đọc thường gửi mã thẻ + xuống dòng (\r\n hoặc \n) - tách theo
        // cả 2 kiểu để không phụ thuộc vào firmware từng loại đầu đọc.
        const lines = buffer.split(/\r\n|\r|\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const code = line.trim();
          if (code) onCardCodeRef.current(code);
        }
      }
    } catch (err) {
      console.warn('useSerialCardReader: lỗi đọc dữ liệu, đầu đọc có thể đã rút:', err);
      setStatus('error');
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
      await readableClosed;
      if (!stopFlagRef.current) {
        // Mất kết nối ngoài ý muốn (rút dây) - không phải do disconnect() chủ động gọi.
        setStatus('disconnected');
      }
    }
  }, []);

  const openPort = useCallback(
    async (port: any) => {
      setStatus('connecting');
      try {
        await port.open({ baudRate: DEFAULT_BAUD_RATE });
        portRef.current = port;
        setStatus('connected');
        readLoop(port);
      } catch (err) {
        console.warn('useSerialCardReader: không mở được cổng:', err);
        setStatus('error');
      }
    },
    [readLoop]
  );

  const disconnect = useCallback(async () => {
    stopFlagRef.current = true;
    try {
      await readerRef.current?.cancel();
    } catch {
      // ignore
    }
    try {
      await portRef.current?.close();
    } catch {
      // ignore
    }
    portRef.current = null;
    readerRef.current = null;
    setStatus(isSupported ? 'disconnected' : 'unsupported');
  }, [isSupported]);

  const pairNewDevice = useCallback(async (): Promise<SerialPairing | null> => {
    if (!isSupported) return null;
    try {
      const port = await (navigator as any).serial.requestPort();

      // Nếu đang có 1 cổng khác đang mở (VD lần ghép trước chọn NHẦM thiết
      // bị), phải đóng nó lại TRƯỚC khi mở cổng mới - nếu không, cổng cũ
      // (sai) vẫn tiếp tục được đọc song song với cổng mới (đúng), khiến dữ
      // liệu từ thiết bị sai vẫn có thể bị hiểu nhầm thành mã thẻ và kích
      // hoạt quét, dù giao diện chỉ hiển thị đã ghép đôi với thiết bị mới.
      if (portRef.current) {
        await disconnect();
      }

      await openPort(port);
      const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
      return { vendorId: info.usbVendorId ?? null, productId: info.usbProductId ?? null };
    } catch (err) {
      // Người dùng bấm Hủy trên hộp thoại chọn thiết bị - không phải lỗi thật.
      console.warn('useSerialCardReader: chọn thiết bị thất bại/bị hủy:', err);
      return null;
    }
  }, [isSupported, openPort, disconnect]);

  // Tự kết nối lại KHÔNG CẦN HỎI khi đã từng ghép đôi trước đó - trình duyệt
  // vẫn nhớ quyền đã cấp cho thiết bị đó qua các lần tải trang (navigator.
  // serial.getPorts() chỉ trả về các cổng ĐÃ được cấp quyền cho origin này),
  // chỉ JS phải tự tìm lại đúng cổng thôi.
  useEffect(() => {
    // Chỉ cần đã từng ghép đôi (có vendorId HOẶC có label) là thử tự kết nối
    // lại - trước đây bắt buộc phải có vendorId, khiến các đầu đọc không trả
    // usbVendorId (rất phổ biến với cổng COM thật) không bao giờ tự kết nối
    // lại được sau F5, dù đã ghép đôi thật.
    const hasPairing = !!pairing && (pairing.vendorId != null || pairing.label != null);
    if (!isSupported || !hasPairing) return;

    let cancelled = false;

    (async () => {
      try {
        const ports = await (navigator as any).serial.getPorts();
        if (ports.length === 0) return;

        let match: any = null;
        if (pairing!.vendorId != null) {
          match = ports.find((p: any) => {
            const info = typeof p.getInfo === 'function' ? p.getInfo() : {};
            return info.usbVendorId === pairing!.vendorId && info.usbProductId === pairing!.productId;
          });
        }
        if (!match && ports.length === 1) {
          // Không match được theo vendorId (thiết bị không trả USB info) -
          // nhưng nếu trình duyệt chỉ cấp quyền cho ĐÚNG 1 thiết bị ở origin
          // này thì gần như chắc chắn đó là đầu đọc đã ghép đôi trước đó.
          // Nếu có ≥2 cổng và không match được theo vendorId, KHÔNG đoán -
          // bắt ghép đôi lại thủ công (giới hạn thật của Web Serial API).
          match = ports[0];
        }

        if (match && !cancelled) {
          await openPort(match);
        }
      } catch (err) {
        console.warn('useSerialCardReader: tự kết nối lại thất bại:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, pairing?.vendorId, pairing?.productId, pairing?.label]);

  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isSupported, status, pairNewDevice, disconnect };
}

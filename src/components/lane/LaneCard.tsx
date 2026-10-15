import React, { useState, useRef, useEffect } from 'react';
import { scanApi } from '../../api/endpoints/scan';
import { lanesApi } from '../../api/endpoints/lanes';
import { historyApi } from '../../api/endpoints/history';
import { useSignalR } from '../../contexts/SignalRContext';
import type { LaneOption } from '../../api/types/lane';
import { resolvePhotoUrl } from '../../utils/photoUrl';
import { useSerialCardReader } from '../../hooks/useSerialCardReader';
import { useAlertSound } from '../../hooks/useAlertSound';
import {
  IconCamera,
  IconArrowDownTray,
  IconArrowUpTray,
  IconExclamationTriangle,
  IconSignal,
  IconClock,
} from '../../icons/HeroIcons';
import '../../styles/app.css';

interface ScanResult {
  id: number;
  cardCode: string;
  lane: string;
  direction: 'in' | 'out';
  timestamp: string;
  plateNumber?: string;
  plateMatch?: boolean | null;
  entryPlateNumber?: string | null;
  // undefined = vừa quẹt, chưa có event nào từ backend -> coi như đang đọc biển.
  syncStatus?: string;
  photoUrls?: string[];
  error?: string;
}

interface Props {
  lane: LaneOption;
  onNewHistory?: (h: any) => void;
}

const POLL_MAX_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 1000;

export function LaneCard(props: Props) {
  const { lane, onNewHistory } = props;
  const [cardCode, setCardCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [isReady, setIsReady] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const { scanEvents } = useSignalR();
  // Beep ngắn NGAY khi đọc được mã thẻ (trước cả khi biết kết quả quẹt
  // thành công hay không) - bảo vệ cần biết ngay đầu đọc đã nhận được thẻ,
  // không cần nhìn màn hình. Tần số 1200Hz khác hẳn 2 âm cảnh báo hiện có
  // (880Hz lệch biển số, 440Hz lỗi chụp ảnh) để không bị nhầm lẫn.
  const { playAlertSound: playScanBeep } = useAlertSound('/beep_quet_the.mp3', 1200);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanTimeoutRef = useRef<number | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  // logId của lượt quẹt MỚI NHẤT trên làn này - dùng để bỏ qua kết quả poll
  // ảnh của lượt quét CŨ nếu 1 lượt quét MỚI đã bắt đầu trước khi poll cũ
  // kịp xong (VD bảo vệ quẹt liên tiếp 2 thẻ nhanh) - nếu không, ảnh của xe
  // trước có thể "chạy" nhầm vào thẻ đang hiển thị lượt quét sau.
  const activeLogIdRef = useRef<number | null>(null);
  const [recapturing, setRecapturing] = useState(false);
  // "Vừa quẹt thẻ" - nhấn mạnh RÕ RÀNG thẻ đang xử lý so với các làn khác
  // đang chờ, thay vì mọi thứ trông nhạt nhòa như nhau. Tự tắt sau vài giây
  // (không cần bảo vệ tự tắt) - chỉ là dấu hiệu "vừa xảy ra", không phải
  // trạng thái cố định.
  const [justScanned, setJustScanned] = useState(false);
  const justScannedTimeoutRef = useRef<number | null>(null);

  const expectedCount = Math.max(lane.cameraCount || 2, 1);

  // Ghép đôi đầu đọc thẻ qua cổng COM (Web Serial API) - DÀNH CHO đầu đọc
  // RS-232/USB-serial THẬT, cần mở cổng nối tiếp. Song song với ô nhập thẻ
  // bên dưới (đầu đọc HID keyboard-wedge vẫn gõ thẳng vào đó, không liên
  // quan tới cơ chế này) - làn nào không dùng Web Serial thì cứ bỏ qua khối
  // ghép đôi, quẹt thẳng vào ô input như bình thường.
  const [readerPairing, setReaderPairing] = useState({
    vendorId: lane.cardReaderVendorId ?? null,
    productId: lane.cardReaderProductId ?? null,
    label: lane.cardReaderLabel ?? null,
  });
  const [pairingBusy, setPairingBusy] = useState(false);

  const {
    isSupported: isSerialSupported,
    status: serialStatus,
    pairNewDevice,
  } = useSerialCardReader(readerPairing, (code) => handleScan(code));

  const handlePairReader = async () => {
    setPairingBusy(true);
    try {
      const result = await pairNewDevice();
      if (!result) return; // người dùng hủy hộp thoại chọn thiết bị

      const label = `${lane.name} - đầu đọc COM`;
      setReaderPairing({ vendorId: result.vendorId ?? null, productId: result.productId ?? null, label });

      try {
        await lanesApi.updateCardReader(lane, {
          vendorId: result.vendorId ?? null,
          productId: result.productId ?? null,
          label,
        });
      } catch (err) {
        // Ghép đôi vẫn hoạt động ngay trong phiên này dù lưu DB thất bại -
        // chỉ ảnh hưởng tới việc tự kết nối lại ở LẦN TẢI TRANG SAU.
        console.warn('Không lưu được ghép đôi đầu đọc vào DB:', err);
      }
    } finally {
      setPairingBusy(false);
    }
  };

  // Đầu đọc HID (keyboard-wedge) gõ vào ô ĐANG CÓ FOCUS - chỉ 1 làn nhận
  // thẻ tại 1 thời điểm, phải cho bảo vệ thấy rõ là làn nào. Input nhận cả
  // blur khi cửa sổ trình duyệt mất focus nên không cần nghe window riêng.
  const [isReceiving, setIsReceiving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) window.clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const laneMatchKey = lane.laneCode || String(lane.id);

  // Nạp lượt quẹt GẦN NHẤT của làn này ngay khi mở/tải lại trang - trước
  // đây thẻ luôn trống ("Chờ quẹt thẻ...") cho tới khi có 1 lượt quẹt MỚI
  // trong chính phiên này, khiến bảo vệ mất hết thông tin xe/ảnh gần nhất
  // mỗi khi F5 hoặc mới mở màn hình. Chỉ set khi CHƯA có scanResult nào
  // (ưu tiên dữ liệu SỐNG từ SignalR nếu tới trước/sau đó).
  useEffect(() => {
    let cancelled = false;
    historyApi
      .get({ lane: laneMatchKey, page: 1, pageSize: 1 })
      .then((res) => {
        if (cancelled) return;
        const payload = (res.data as any)?.data ?? res.data;
        const latest = payload?.items?.[0];
        if (!latest) return;

        const resolvedPhotos = Array.isArray(latest.photoUrls)
          ? latest.photoUrls.map((u: string) => resolvePhotoUrl(u))
          : [];

        setScanResult((prev) =>
          prev
            ? prev
            : {
                id: latest.id,
                cardCode: latest.cardCode ?? '',
                lane: latest.lane ?? laneMatchKey,
                direction: latest.direction ?? 'in',
                timestamp: latest.timestamp,
                plateNumber: latest.plateNumber ?? undefined,
                plateMatch: latest.plateMatch ?? null,
                entryPlateNumber: latest.entryPlateNumber ?? null,
                syncStatus: latest.syncStatus,
                photoUrls: resolvedPhotos,
              }
        );
        setPhotoUrls((prev) => (prev.length > 0 ? prev : resolvedPhotos));
      })
      .catch(() => {
        // Không có log nào trước đó hoặc lỗi tải - giữ nguyên trạng thái
        // rỗng ("Chờ quẹt thẻ..."), không cần báo lỗi cho bảo vệ.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneMatchKey]);

  useEffect(() => {
    if (scanEvents.length === 0) return;

    const relevant = scanEvents.filter((e: any) => e.lane === laneMatchKey);
    if (relevant.length === 0) return;

    const latestId = Math.max(...relevant.map((e: any) => e.id));
    const eventsForLatest = relevant
      .filter((e: any) => e.id === latestId)
      .slice()
      .reverse();

    let merged: Partial<ScanResult> & { photoUrls?: string[] } = {};
    eventsForLatest.forEach((e: any) => {
      const rawPhotos = e.photoPaths ?? e.photoUrls;
      // Stage "processed" mang KẾT QUẢ AI HOÀN CHỈNH - lấy thẳng cả giá trị
      // null (VD không có biển lượt vào -> plateMatch null), không dùng ?? để
      // khỏi giữ lại kết quả cũ của lần đọc trước khi bấm "Chụp lại".
      const isProcessed = e.stage === 'processed';
      merged = {
        ...merged,
        id: e.id,
        cardCode: e.cardCode ?? merged.cardCode,
        lane: e.lane ?? merged.lane,
        direction: e.direction ?? merged.direction,
        timestamp: e.timestamp ?? merged.timestamp,
        syncStatus: e.syncStatus ?? merged.syncStatus,
        plateNumber: isProcessed ? e.plateNumber ?? undefined : e.plateNumber ?? merged.plateNumber,
        plateMatch: isProcessed ? e.plateMatch ?? null : e.plateMatch ?? merged.plateMatch,
        entryPlateNumber: isProcessed
          ? e.entryPlateNumber ?? null
          : e.entryPlateNumber ?? merged.entryPlateNumber,
        photoUrls:
          Array.isArray(rawPhotos) && rawPhotos.length > 0
            ? rawPhotos.map((r: string) => resolvePhotoUrl(r))
            : merged.photoUrls,
      };
    });

    if (latestId > (activeLogIdRef.current ?? 0)) {
      activeLogIdRef.current = latestId;
    }

    setScanResult((prev) => {
      if (prev && prev.id === latestId) {
        // Bỏ các key undefined trước khi trộn - spread 1 key có giá trị
        // undefined vẫn GHI ĐÈ giá trị cũ (VD biển lượt vào đã nạp từ
        // /api/history bị xóa mất chỉ vì event live không mang field đó).
        const defined = Object.fromEntries(
          Object.entries(merged).filter(([, v]) => v !== undefined)
        );
        return { ...prev, ...defined } as ScanResult;
      }
      return {
        id: latestId,
        cardCode: merged.cardCode ?? '',
        lane: merged.lane ?? laneMatchKey,
        direction: (merged.direction as any) ?? 'in',
        timestamp: merged.timestamp ?? new Date().toISOString(),
        plateNumber: merged.plateNumber,
        plateMatch: merged.plateMatch ?? null,
        entryPlateNumber: merged.entryPlateNumber ?? null,
        syncStatus: merged.syncStatus,
        photoUrls: merged.photoUrls ?? [],
      };
    });

    if (merged.photoUrls && merged.photoUrls.length > 0) {
      setPhotoUrls(merged.photoUrls);
    }
  }, [scanEvents, laneMatchKey]);

  useEffect(() => {
    if (cardCode.trim() && !loading && isReady) {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = window.setTimeout(
        () => handleScan(cardCode.trim()),
        150
      );
    }
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, [cardCode, isReady]);

  const handleScan = async (code: string) => {
    playScanBeep();
    setLoading(true);
    setIsReady(false);

    try {
      const laneCode = lane.laneCode;
      const finalLane = laneCode || String(lane.id);

      const res = await scanApi.scan({ cardCode: code, lane: finalLane });
      const response = res.data as any;
      const responsePayload = response.data ?? response;
      const success = response.success !== false;

      if (!success || !responsePayload) {
        setScanResult({
          id: 0,
          cardCode: code,
          lane: finalLane,
          direction: 'in',
          timestamp: '',
          error: response.message || 'Quét thẻ thất bại',
        });
      } else {
        const initialRaw =
          responsePayload.photoPaths ?? responsePayload.photoUrls ?? [];
        const resolvedInitial = Array.isArray(initialRaw)
          ? initialRaw.map((r: string) => resolvePhotoUrl(r))
          : [];

        activeLogIdRef.current = responsePayload.logId;
        setScanResult({
          id: responsePayload.logId,
          cardCode: responsePayload.cardCode,
          lane: responsePayload.lane,
          direction: responsePayload.direction,
          timestamp: responsePayload.timestamp,
          photoUrls: resolvedInitial,
        });
        setPhotoUrls(resolvedInitial);

        setJustScanned(true);
        if (justScannedTimeoutRef.current) clearTimeout(justScannedTimeoutRef.current);
        justScannedTimeoutRef.current = window.setTimeout(() => setJustScanned(false), 6000);

        try {
          const newItem = {
            id: responsePayload.logId,
            cardCode: responsePayload.cardCode,
            lane: responsePayload.lane,
            direction: responsePayload.direction,
            timestamp: responsePayload.timestamp,
            plateNumber: null,
            plateMatch: null,
            photoUrls: [],
            syncStatus: responsePayload.syncStatus ?? 'pending',
            guardName: null,
          };
          onNewHistory?.(newItem);
        } catch {
          // ignore
        }

        captureBackground(responsePayload.logId);
      }
    } catch (error: any) {
      setScanResult({
        id: 0,
        cardCode: '',
        lane: lane.id,
        direction: 'in',
        timestamp: '',
        error:
          error.response?.data?.message ||
          error.response?.data?.title ||
          'Lỗi quẹt thẻ',
      });
    } finally {
      setIsReady(true);
      setCardCode('');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  // Chụp lại ảnh cho ĐÚNG log vừa quẹt - dùng khi ảnh vừa chụp bị mờ/lỗi mà
  // xe vẫn còn đứng đúng vị trí (cùng 1 thẻ, chưa quẹt lượt mới). Gọi lại
  // CHÍNH API capture đã dùng lúc quẹt - backend (LogService.UploadPhotosAsync)
  // đã tự XÓA ảnh cũ + reset kết quả AI + chạy lại AI ngay khi nhận ảnh mới
  // cho CÙNG logId, không cần API riêng.
  const handleRecapture = async () => {
    if (!scanResult || recapturing) return;
    setRecapturing(true);
    try {
      await captureBackground(scanResult.id);
    } finally {
      setRecapturing(false);
    }
  };

  const captureBackground = async (logId: number) => {
    try {
      const laneCode = lane.laneCode || String(lane.id);
      const captureRes = await scanApi.capturePhotos(logId, laneCode);
      const capturePayload = (captureRes?.data &&
        (captureRes.data.data ?? captureRes.data)) as any;
      const immediateRaw =
        capturePayload?.photoUrls ?? capturePayload?.photoPaths ?? [];

      applyPhotos(logId, Array.isArray(immediateRaw) ? immediateRaw : []);

      if (Array.isArray(immediateRaw) && immediateRaw.length >= expectedCount) {
        return;
      }

      pollForRemainingPhotos(logId);
    } catch {
      pollForRemainingPhotos(logId);
    }
  };

  const applyPhotos = (logId: number, rawPaths: string[]) => {
    if (!rawPaths || rawPaths.length === 0) return;
    // 🐛 FIX: bỏ qua nếu đây không còn là lượt quét MỚI NHẤT của làn này -
    // trước đây setPhotoUrls không có điều kiện này (chỉ setScanResult có),
    // nên ảnh của lượt quét CŨ (poll dở dang) có thể "chạy" nhầm vào ảnh
    // đang hiển thị nếu 1 thẻ khác được quẹt trước khi poll cũ kết thúc.
    if (activeLogIdRef.current !== logId) return;

    const urls = Array.from({ length: expectedCount }).map((_, i) => {
      const raw = rawPaths[i];
      return raw ? resolvePhotoUrl(raw) : '';
    });
    setPhotoUrls(urls);
    setScanResult((prev) =>
      prev && prev.id === logId ? { ...prev, photoUrls: urls } : prev
    );
  };

  // Chỉ còn nhiệm vụ chờ ảnh hiển thị lên UI của đúng máy này - việc phát
  // hiện "chụp thất bại" để CẢNH BÁO giờ do backend đảm nhiệm ngay lúc gọi
  // /capture (ScanController phát SignalR "CaptureFailedAlert" tới mọi
  // client), không cần LaneCard tự phỏng đoán qua polling nữa.
  const pollForRemainingPhotos = (logId: number) => {
    // Dừng chuỗi poll CŨ (nếu còn) trước khi bắt đầu chuỗi mới cho logId
    // khác - trước đây chỉ ghi đè pollTimeoutRef mà không hủy timer cũ,
    // khiến 2 chuỗi poll của 2 lượt quét khác nhau chạy chồng lên nhau,
    // vừa lãng phí request vừa tăng nguy cơ lẫn ảnh (xem applyPhotos).
    if (pollTimeoutRef.current) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    let attempts = 0;

    const poll = async () => {
      // Đã có lượt quét MỚI HƠN bắt đầu trong lúc chờ - dừng hẳn, không
      // tiếp tục poll/áp dụng ảnh cho logId cũ này nữa.
      if (activeLogIdRef.current !== logId) return;

      try {
        const statusRes = await scanApi.getStatus(logId);
        const statusData = (statusRes.data &&
          (statusRes.data.data ?? statusRes.data)) as any;
        const photoCount = statusData?.photoCount ?? 0;
        const rawPaths = statusData?.photoPaths ?? statusData?.photoUrls ?? [];

        if (photoCount > 0 || (rawPaths && rawPaths.length > 0)) {
          applyPhotos(logId, rawPaths);
          if (rawPaths.length >= expectedCount) return;
        }
      } catch {
        // ignore
      }

      if (activeLogIdRef.current !== logId) return;

      attempts += 1;
      if (attempts < POLL_MAX_ATTEMPTS) {
        pollTimeoutRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  };

  const formatTime = (ts: string) => {
    try {
      const needsZ =
        typeof ts === 'string' &&
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$/.test(ts);
      const parsed = needsZ ? new Date(ts + 'Z') : new Date(ts);
      return parsed.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  const isIn = (scanResult?.direction ?? 'in') === 'in';
  const displayPhotoUrls = scanResult?.photoUrls?.length
    ? scanResult.photoUrls
    : photoUrls;

  return (
    <article
      className={`m-lane ${justScanned ? 'is-just-scanned' : ''} ${isReceiving ? 'is-receiving' : ''}`}
    >
      {justScanned && (
        <span className="m-lane__just-scanned-badge">
          <IconClock size={12} /> Vừa quẹt thẻ
        </span>
      )}
      <header className="m-lane__header">
        <div className="m-lane__title">
          <span className="m-lane__dot" data-ready={isReady && !loading} />
          <h2 className="m-lane__name">{lane.name}</h2>
        </div>
        <div className="m-lane__header-right">
          <span className="m-lane__status-text" data-ready={isReady && !loading}>
            {loading ? 'Đang xử lý…' : isReady ? 'Sẵn sàng' : 'Bận'}
          </span>
          <span className="m-lane__cam-badge">
            <IconCamera size={14} /> {expectedCount} camera
          </span>
        </div>
      </header>

      {/* Ghép đôi đầu đọc COM (Web Serial) - chỉ hiện trên trình duyệt nền
          Chromium hỗ trợ. Đầu đọc HID keyboard-wedge KHÔNG cần khối này - gõ
          thẳng vào ô input bên dưới, cứ để trống/bỏ qua nếu làn này không
          dùng đầu đọc RS-232/USB-serial thật. */}
      {isSerialSupported && (
        <div className="m-lane__reader-row">
          {/* Dùng thẳng serialStatus (trạng thái CỔNG THẬT) làm nguồn hiển thị
              chính - readerPairing chỉ để biết đã từng lưu DB hay chưa, vì
              nhiều thiết bị không trả vendorId dù đã mở cổng thành công. */}
          <span className="m-lane__reader-status" data-state={serialStatus}>
            <IconSignal size={12} />
            {serialStatus === 'connected' && `Đầu đọc COM: ${readerPairing.label ?? 'đã ghép đôi'}`}
            {serialStatus === 'connecting' && 'Đang kết nối đầu đọc...'}
            {serialStatus === 'error' && 'Lỗi kết nối đầu đọc COM'}
            {serialStatus === 'disconnected' &&
              (readerPairing.vendorId != null || readerPairing.label != null
                ? 'Mất kết nối đầu đọc COM'
                : 'Chưa ghép đôi đầu đọc COM')}
          </span>
          <button
            className="m-lane__reader-pair-btn"
            onClick={handlePairReader}
            disabled={pairingBusy || serialStatus === 'connecting'}
            type="button"
          >
            {pairingBusy || serialStatus === 'connecting'
              ? 'Đang chọn...'
              : serialStatus === 'connected'
              ? 'Ghép lại'
              : 'Ghép đôi đầu đọc'}
          </button>
        </div>
      )}

      <fieldset className="m-lane__input-row" style={{ border: 'none', padding: 0, margin: 0 }}>
        <label htmlFor={`input-lane-${lane.id}`} className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
          Mã thẻ cho {lane.name}
        </label>
        <input
          id={`input-lane-${lane.id}`}
          ref={inputRef}
          type="text"
          value={cardCode}
          onChange={(e) => setCardCode(e.target.value)}
          onFocus={() => setIsReceiving(true)}
          onBlur={() => setIsReceiving(false)}
          disabled={loading}
          autoFocus
          className="m-lane__input"
          placeholder={isReceiving ? 'Quét thẻ...' : 'Bấm vào đây để nhận thẻ ở làn này'}
        />
        {isReceiving && (
          <span className="m-lane__receiving" aria-hidden="true">
            <span className="m-lane__receiving-dot" /> ĐANG NHẬN THẺ
          </span>
        )}
      </fieldset>

      {scanResult?.error && (
        <output className="m-lane__error" role="alert">
          <IconExclamationTriangle size={18} />
          <span>{scanResult.error}</span>
        </output>
      )}

      {scanResult && !scanResult.error ? (
        <output className="m-lane__result" aria-live="polite">
          <div className={`m-lane__direction-banner ${isIn ? 'is-in' : 'is-out'}`}>
            <span className="m-lane__direction-main">
              {isIn ? (
                <>
                  <IconArrowDownTray size={20} /> VÀO
                </>
              ) : (
                <>
                  <IconArrowUpTray size={20} /> RA
                </>
              )}
            </span>
            {scanResult.cardCode && (
              <span className="m-lane__card-code">Thẻ {scanResult.cardCode}</span>
            )}
            <time className="m-lane__time">{formatTime(scanResult.timestamp)}</time>
          </div>

          <div className="m-lane__photos">
            {Array.from({ length: expectedCount }).map((_, i) => {
              const imageUrl = displayPhotoUrls?.[i] || '';
              return (
                <figure className="m-lane__photo" key={i}>
                  {imageUrl ? (
                    <img
                      // key theo URL - buộc React tạo lại <img> (thay vì chỉ đổi
                      // src của node cũ) mỗi khi ảnh khác thay thế ảnh trước đó,
                      // để animation fade-in (m-photoFadeIn, xem app.css) chạy
                      // lại từ đầu thay vì đứng yên do element không đổi.
                      key={imageUrl}
                      src={imageUrl}
                      alt={`Camera ${i + 1}`}
                      loading="lazy"
                      className="m-lane__photo-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                      <IconCamera size={24} />
                    </div>
                  )}
                  <figcaption className="m-lane__photo-tag">CAM {i + 1}</figcaption>
                </figure>
              );
            })}
          </div>

          <button
            type="button"
            className="m-lane__recapture-btn"
            onClick={handleRecapture}
            disabled={recapturing}
          >
            <IconCamera size={16} />
            {recapturing ? 'Đang chụp lại…' : 'Ảnh mờ? Chụp lại'}
          </button>
        </output>
      ) : (
        !scanResult?.error && (
          <div className="m-lane__placeholder">
            <IconCamera size={44} style={{ opacity: 0.3 }} />
            <span>Chờ quẹt thẻ…</span>
          </div>
        )
      )}
    </article>
  );
}

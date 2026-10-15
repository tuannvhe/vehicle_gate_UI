import React, { useState, useEffect, useRef, useCallback } from 'react';
import { lanesApi } from '../../api/endpoints/lanes';
import { historyApi } from '../../api/endpoints/history';
import type { HistoryItem } from '../../api/types/history';
import { useSignalR } from '../../contexts/SignalRContext';
import type { LaneOption } from '../../api/types/lane';
import { LaneCard } from '../lane/LaneCard';
import { Logout } from '../auth/Logout';
import { LiveClock } from './LiveClock';
import { DetailModal } from './DetailModal';
import { TickerItem } from './TickerItem';
import { MismatchToastPanel, type MismatchToast } from './MismatchToast';
import { CaptureFailedToastPanel, type CaptureFailedToast } from './CaptureFailedToast';
import { ActionToast } from '../common/ActionToast';
import { useToast } from '../../hooks/useToast';
import { useAlertSound } from '../../hooks/useAlertSound';
import { resolvePhotoUrl } from '../../utils/photoUrl';
import { IconBolt, IconSignal, IconMoon, IconExclamationTriangle } from '../../icons/HeroIcons';
import logo from '../../assets/logo1.png';
import '../../styles/app.css';

// Kích thước trang cho khu "Hoạt động gần đây" - dùng chung cho lần tải đầu
// VÀ mỗi lần tải thêm khi cuộn.
const RECENT_PAGE_SIZE = 16;
// Trần an toàn tuyệt đối cho danh sách trong bộ nhớ trình duyệt - phòng khi
// cuộn tải thêm rất nhiều trang trong 1 ca trực dài (có thể tới ~1500
// lượt/ngày) mà không dọn bớt thì tốn RAM/làm chậm render dần. 300 là dư
// nhiều so với nhu cầu xem lại thực tế (khu này chỉ để xem nhanh, xem sâu
// hơn thì dùng trang "Lịch sử" có phân trang đầy đủ + tìm kiếm).
const RECENT_MAX_ITEMS = 300;

const DEFAULT_LANES: LaneOption[] = [
  {
    id: 'motorbike',
    laneCode: 'motorbike',
    name: 'Làn xe máy',
    cameraCount: 2,
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'car',
    laneCode: 'car',
    name: 'Làn ô tô',
    cameraCount: 2,
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

export const ScanStation: React.FC = () => {
  const [lanes, setLanes] = useState<LaneOption[]>([]);
  const [lanesLoading, setLanesLoading] = useState(true);
  const [, setHistoryLoading] = useState(false);
  const [, setHistoryItems] = useState<any[]>([]);
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [, setRecentLoading] = useState(false);
  // Phân trang cho khu "Hoạt động gần đây" - trước đây cố định 16 lượt, cuộn
  // xuống không tải thêm được lượt cũ hơn. recentPage = trang đã tải tới,
  // recentHasMore = còn dữ liệu cũ hơn để tải hay không (dựa vào `total` từ
  // API, không đoán qua độ dài mảng trả về - chính xác hơn khi trang cuối
  // vừa vặn đủ pageSize).
  const [recentPage, setRecentPage] = useState(1);
  const [recentHasMore, setRecentHasMore] = useState(true);
  const [recentLoadingMore, setRecentLoadingMore] = useState(false);
  const tickerListRef = useRef<HTMLDivElement>(null);
  // 🐛 FIX: recentHistory khởi tạo là [] rồi mới fetch async - effect tính
  // maxKnownLogIdRef chạy NGAY ở lần render đầu (recentHistory=[]) và khóa
  // mốc = 0 trước khi fetch xong. Hậu quả: mọi CaptureFailedAlert/PlateMismatch
  // cũ đã có sẵn trong SignalRContext (Provider không unmount) bị coi là "mới"
  // (logId <= 0 luôn false) và phát lại toast mỗi lần quay về trang quét.
  // historyReady chỉ bật true SAU KHI fetch xong, để effect tính mốc đợi dữ
  // liệu thật thay vì khóa mốc dựa trên mảng rỗng tạm thời.
  const [historyReady, setHistoryReady] = useState(false);
  const [modalItem, setModalItem] = useState<HistoryItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mismatchToasts, setMismatchToasts] = useState<MismatchToast[]>([]);
  const [captureFailedToasts, setCaptureFailedToasts] = useState<CaptureFailedToast[]>([]);

  // Theme đêm tự động - bảo vệ trực ca đêm nhìn nền sáng/xanh nhạt trong
  // phòng gác tối rất chói mắt, mỏi mắt kéo dài qua nhiều giờ. Tự chuyển
  // sang nền tối dịu ngoài khung giờ 6h-19h, không cần bảo vệ tự bật tắt.
  // Chỉ cần kiểm tra giờ hiện tại - không cần chờ tick giây, đủ để tick mỗi
  // phút là bắt kịp đúng thời điểm chuyển ca.
  const [isNight, setIsNight] = useState(() => {
    const h = new Date().getHours();
    return h < 6 || h >= 19;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const h = new Date().getHours();
      setIsNight(h < 6 || h >= 19);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const warnedIdsRef = useRef<Set<number>>(new Set());
  const warnedMismatchIdsRef = useRef<Set<number>>(new Set());
  // canhbao_bienso.mp3: cảnh báo biển số RA không khớp biển số VÀO.
  const { playAlertSound } = useAlertSound('/canhbao_bienso.mp3', 880);
  // canhbao_anh.mp3: cảnh báo không chụp được ảnh (camera lỗi) - tần số beep
  // dự phòng (440Hz) khác 880Hz để phân biệt bằng tai nếu file mp3 lỗi/thiếu.
  const { playAlertSound: playCaptureFailedSound } = useAlertSound('/canhbao_anh.mp3', 440);
  const { toast, showSuccess, dismiss: dismissActionToast } = useToast();

  const signalR = useSignalR() as {
    scanEvents: any[];
    plateMismatchEvents: any[];
    captureFailedEvents: any[];
    isConnected: boolean;
    reconnectedAt?: number | null;
  };
  const { scanEvents, plateMismatchEvents, captureFailedEvents, isConnected, reconnectedAt } = signalR;

  // Mất kết nối realtime = cảnh báo lệch biển/lỗi chụp ảnh KHÔNG tới được,
  // ticker đứng im - phải báo thật rõ thay vì chỉ đổi màu pill trong header.
  // Chờ 3s mới hiện để không báo nhầm lúc mới mở trang (kết nối chưa kịp
  // thiết lập) hoặc chập chờn tự nối lại ngay.
  const [disconnectedSince, setDisconnectedSince] = useState<Date | null>(null);
  useEffect(() => {
    if (isConnected) {
      setDisconnectedSince(null);
      return;
    }
    const timer = setTimeout(() => setDisconnectedSince(new Date(Date.now() - 3000)), 3000);
    return () => clearTimeout(timer);
  }, [isConnected]);

  useEffect(() => {
    loadLanes();
  }, []);

  useEffect(() => {
    if (reconnectedAt) loadLanes();
  }, [reconnectedAt]);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    loadRecentHistory();
  }, []);

  useEffect(() => {
    if (reconnectedAt) loadHistory();
  }, [reconnectedAt]);

  useEffect(() => {
    if (reconnectedAt) loadRecentHistory();
  }, [reconnectedAt]);

  useEffect(() => {
    if (isConnected) loadRecentHistory();
  }, [isConnected]);

  const loadLanes = async () => {
    try {
      setLanesLoading(true);
      const res = await lanesApi.getAll();
      let data: LaneOption[] = [];
      if (res.data?.success) data = res.data.data || [];
      else if (Array.isArray(res.data)) data = res.data;
      else if (res.data?.data) data = res.data.data;
      setLanes(data.length > 0 ? data : DEFAULT_LANES);
    } catch {
      setLanes(DEFAULT_LANES);
    } finally {
      setLanesLoading(false);
    }
  };

  const loadHistory = async (lane?: string) => {
    try {
      setHistoryLoading(true);
      const res = await historyApi.get({ page: 1, pageSize: 12, lane });
      const payload = res.data?.data ?? res.data;
      if (payload?.items) setHistoryItems(payload.items || []);
      else if (Array.isArray(payload)) setHistoryItems(payload);
      else setHistoryItems([]);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const normalizeRecentItems = (items: any[]) =>
    items.map((it) => ({
      ...it,
      photoUrls: Array.isArray(it.photoUrls) ? it.photoUrls.map((u: string) => resolvePhotoUrl(u)) : [],
      entryPhotoUrls: Array.isArray(it.entryPhotoUrls)
        ? it.entryPhotoUrls.map((u: string) => resolvePhotoUrl(u))
        : [],
    })) as HistoryItem[];

  // Tải lại TỪ ĐẦU (trang 1) - dùng lúc mount, lúc reconnect SignalR, hoặc
  // khi cần làm mới hẳn danh sách. Reset luôn trạng thái phân trang.
  const loadRecentHistory = async (lane?: string) => {
    try {
      setRecentLoading(true);
      const res = await historyApi.get({ page: 1, pageSize: RECENT_PAGE_SIZE, lane });
      const payload = res.data?.data ?? res.data;
      const items: any[] = payload?.items ?? (Array.isArray(payload) ? payload : []);
      const total: number = typeof payload?.total === 'number' ? payload.total : items.length;

      setRecentHistory(normalizeRecentItems(items));
      setRecentPage(1);
      setRecentHasMore(items.length < total);
    } catch {
      setRecentHistory([]);
      setRecentPage(1);
      setRecentHasMore(false);
    } finally {
      setRecentLoading(false);
      setHistoryReady(true);
    }
  };

  // Tải THÊM lượt cũ hơn khi cuộn xuống cuối khu "Hoạt động gần đây" - nối
  // vào cuối danh sách hiện có (không thay thế), khác hẳn loadRecentHistory
  // (luôn làm mới từ đầu).
  const loadMoreRecentHistory = async () => {
    if (recentLoadingMore || !recentHasMore) return;
    try {
      setRecentLoadingMore(true);
      const nextPage = recentPage + 1;
      const res = await historyApi.get({ page: nextPage, pageSize: RECENT_PAGE_SIZE });
      const payload = res.data?.data ?? res.data;
      const items: any[] = payload?.items ?? (Array.isArray(payload) ? payload : []);
      const total: number = typeof payload?.total === 'number' ? payload.total : items.length;

      setRecentHistory((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const appended = normalizeRecentItems(items).filter((it) => !existingIds.has(it.id));
        return [...prev, ...appended].slice(0, RECENT_MAX_ITEMS);
      });
      setRecentPage(nextPage);
      setRecentHasMore(nextPage * RECENT_PAGE_SIZE < total);
    } catch {
      // Lỗi mạng tạm thời - không đụng gì tới danh sách hiện có, để người
      // dùng cuộn/thử lại, không cần báo lỗi ồn ào cho 1 khu phụ trợ.
    } finally {
      setRecentLoadingMore(false);
    }
  };

  // 🐛 FIX: onScroll ở .m-ticker__list (bên dưới) chỉ kích hoạt khi khung
  // THỰC SỰ có thanh cuộn - nhưng khung "Hoạt động gần đây" giờ cao BẰNG
  // đúng cột làn xe bên cạnh (xem app.css .m-ticker), nên nếu danh sách
  // hiện có (mới tải trang 1) CHƯA ĐỦ DÀI để tràn hết khung đó thì không hề
  // có gì để cuộn - loadMoreRecentHistory() qua sự kiện cuộn chuột vì vậy
  // KHÔNG BAO GIỜ được gọi, list bị "kẹt cứng" ở đúng trang đầu dù
  // recentHasMore vẫn còn dữ liệu cũ hơn thật. Tự kiểm tra sau mỗi lần danh
  // sách đổi: còn dư chỗ (chưa tràn) VÀ còn dữ liệu để tải thì tự tải thêm
  // luôn, không đợi người dùng cuộn - tự lặp lại tới khi tràn khung (sinh ra
  // thanh cuộn thật) hoặc hết dữ liệu (recentHasMore=false).
  useEffect(() => {
    if (!historyReady || recentLoadingMore || !recentHasMore) return;
    const el = tickerListRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) {
      loadMoreRecentHistory();
    }
  }, [recentHistory, recentHasMore, recentLoadingMore, historyReady]);

  const handleNewHistory = (item: HistoryItem) => {
    setRecentHistory((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev;
      // 🐛 FIX: trước đây cắt cứng về 16 - xóa mất các trang cũ hơn người
      // dùng đã cuộn tải thêm mỗi khi có 1 lượt quẹt mới. Dùng trần an toàn
      // RECENT_MAX_ITEMS thay vì con số cố định của trang ĐẦU TIÊN.
      return [item, ...prev].slice(0, RECENT_MAX_ITEMS);
    });
  };

  useEffect(() => {
    if (!scanEvents || scanEvents.length === 0) return;

    setRecentHistory((prev) => {
      const byId = new Map<number, HistoryItem>();
      prev.forEach((p) => byId.set(p.id, p));

      [...scanEvents].reverse().forEach((e: any) => {
        const existing = byId.get(e.id);
        const rawPhotos = e.photoPaths ?? e.photoUrls ?? existing?.photoUrls ?? [];
        const resolvedPhotos = Array.isArray(rawPhotos)
          ? rawPhotos.map((u: string) => resolvePhotoUrl(u))
          : [];

        // ScanEvent stage "uploaded" của lượt RA có thể mang kèm ảnh lượt VÀO
        // (xem ScanController.UploadPhotos) - chỉ ghi đè khi event thực sự có
        // entryLogId, tránh xóa mất dữ liệu đã nạp từ /api/history lúc đầu.
        const rawEntryPhotos = e.entryPhotoUrls ?? existing?.entryPhotoUrls ?? [];
        const resolvedEntryPhotos = Array.isArray(rawEntryPhotos)
          ? rawEntryPhotos.map((u: string) => resolvePhotoUrl(u))
          : [];

        const merged = {
          // Giữ lại mọi field đã có (VD entryPhotoUrls/entryLogId/entryPlateNumber
          // nạp từ /api/history lúc đầu) - ScanEvent qua SignalR không mang các
          // field này, nếu không spread existing trước sẽ bị xóa mất mỗi lần có
          // sự kiện live cập nhật cùng log.
          ...existing,
          id: e.id,
          cardCode: e.cardCode ?? existing?.cardCode ?? '',
          lane: e.lane ?? existing?.lane ?? '',
          direction: e.direction ?? existing?.direction ?? 'in',
          timestamp: e.timestamp ?? existing?.timestamp ?? new Date().toISOString(),
          plateNumber: e.plateNumber ?? existing?.plateNumber ?? null,
          plateMatch: e.plateMatch ?? existing?.plateMatch ?? null,
          photoUrls: resolvedPhotos,
          syncStatus: e.syncStatus ?? existing?.syncStatus ?? 'pending',
          guardName: existing?.guardName ?? null,
          entryLogId: e.entryLogId ?? existing?.entryLogId ?? null,
          entryTimestamp: e.entryTimestamp ?? existing?.entryTimestamp ?? null,
          entryPlateNumber: e.entryPlateNumber ?? existing?.entryPlateNumber ?? null,
          entryPhotoUrls: resolvedEntryPhotos,
        } as HistoryItem;
        byId.set(e.id, merged);
      });

      return Array.from(byId.values())
        .sort((a, b) => b.id - a.id)
        .slice(0, RECENT_MAX_ITEMS);
    });
  }, [scanEvents]);

  const hasInitializedHistoryRef = useRef(false);
  const maxKnownLogIdRef = useRef<number>(0);

  useEffect(() => {
    if (!historyReady) return;

    const current = new Set<number>();
    let maxId = 0;
    recentHistory.forEach((e) => {
      if (e.id > maxId) maxId = e.id;
      if (e.syncStatus === 'done' && e.direction === 'out' && e.plateMatch === false) {
        current.add(e.id);
      }
    });

    if (!hasInitializedHistoryRef.current) {
      warnedIdsRef.current = current;
      maxKnownLogIdRef.current = maxId;
      hasInitializedHistoryRef.current = true;
      return;
    }

    // 🐛 FIX: KHÔNG được tiếp tục nâng maxKnownLogIdRef theo maxId của
    // recentHistory ở đây - recentHistory tăng dần ngay khi có ScanEvent
    // SỐNG (quẹt thẻ mới tạo log), mà ScanEvent luôn tới TRƯỚC
    // CaptureFailedAlert/PlateMismatch của CHÍNH log đó. Nếu cứ nâng mốc
    // theo recentHistory, mốc sẽ bị đẩy lên bằng đúng logId vừa quẹt trước
    // khi cảnh báo của log đó kịp xử lý, khiến check "logId <= mốc" luôn
    // đúng và cảnh báo SỐNG bị nuốt mất. Mốc chỉ nên đóng băng 1 LẦN DUY
    // NHẤT lúc mount (đúng nghĩa "log nào có trước khi mở trang này").

    const prev = warnedIdsRef.current;
    current.forEach((id) => {
      if (!prev.has(id) && id > 0) playAlertSound();
    });
    warnedIdsRef.current = current;
  }, [recentHistory, playAlertSound, historyReady]);

  useEffect(() => {
    if (!historyReady) return;
    if (!plateMismatchEvents || plateMismatchEvents.length === 0) return;

    plateMismatchEvents.forEach((ev: any) => {
      const logId = ev.logId ?? ev.LogId;
      if (logId == null || warnedMismatchIdsRef.current.has(logId)) return;
      warnedMismatchIdsRef.current.add(logId);

      if (logId <= maxKnownLogIdRef.current) return;

      playAlertSound();

      setRecentHistory((prev) =>
        prev.map((item) =>
          item.id === logId
            ? { ...item, plateMatch: false, syncStatus: 'done' as const }
            : item
        )
      );

      const rawMismatchLane = ev.lane ?? ev.Lane ?? '';
      setMismatchToasts((prev) => [
        {
          logId,
          cardCode: ev.cardCode ?? ev.CardCode ?? '',
          lane:
            lanes.find((l) => l.id === rawMismatchLane || l.laneCode === rawMismatchLane)?.name ||
            rawMismatchLane,
          entryPlate: ev.entryPlate ?? ev.EntryPlate ?? '',
          exitPlate: ev.exitPlate ?? ev.ExitPlate ?? '',
          timestamp: ev.timestamp ?? ev.Timestamp ?? new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 5));
    });
  }, [plateMismatchEvents, playAlertSound, historyReady, lanes]);

  // Toast lệch biển số KHÔNG tự đóng (trước đây 10s) - cảnh báo nghi gian
  // lận, bảo vệ đang ra kiểm tra xe khác sẽ bỏ lỡ. Chỉ đóng khi bảo vệ bấm
  // đóng, hoặc tự đóng khi đã xác nhận khớp trong modal (xem DetailModal).
  const dismissToast = (logId: number) => {
    setMismatchToasts((prev) => prev.filter((t) => t.logId !== logId));
  };

  useEffect(() => {
    if (captureFailedToasts.length === 0) return;
    const timer = setTimeout(() => {
      setCaptureFailedToasts((prev) => prev.slice(0, -1));
    }, 15000);
    return () => clearTimeout(timer);
  }, [captureFailedToasts]);

  const dismissCaptureFailedToast = (logId: number) => {
    setCaptureFailedToasts((prev) => prev.filter((t) => t.logId !== logId));
  };

  // 🔧 Nhận từ SignalR (ScanController.CapturePhotos phát "CaptureFailedAlert")
  // thay vì tự phỏng đoán ở LaneCard qua polling - backend biết NGAY LẬP TỨC
  // và CHÍNH XÁC khi capture thất bại, đồng thời phát tới TẤT CẢ client đang
  // kết nối chứ không chỉ riêng máy vừa quét như cách cũ.
  //
  // 🐛 FIX: warnedCaptureFailedIdsRef là useRef CỤC BỘ CỦA COMPONENT - khi
  // ScanStation unmount (VD chuyển sang trang quản trị) rồi mount lại (quay
  // về "/"), ref này bị tạo mới TRẮNG TINH, trong khi captureFailedEvents
  // trong SignalRContext (Provider nằm NGOÀI ScanStation, không unmount)
  // vẫn còn nguyên toàn bộ lịch sử event cũ - hậu quả: mọi cảnh báo cũ bị
  // coi là "mới" và phát lại toast + âm thanh HÀNG LOẠT mỗi lần quay lại
  // màn hình này. Sửa bằng cách áp dụng ĐÚNG cơ chế mốc chặn theo LogId đã
  // dùng cho PlateMismatch ở trên (maxKnownLogIdRef, tính lại mỗi lần mount
  // từ recentHistory vừa tải) - chỉ coi là "mới" nếu logId > mốc đã biết
  // lúc mount, bất kể ref dedupe có bị reset hay không.
  const warnedCaptureFailedIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!historyReady) return;
    if (!captureFailedEvents || captureFailedEvents.length === 0) return;

    captureFailedEvents.forEach((ev: any) => {
      const logId = ev.logId ?? ev.LogId;
      if (logId == null || warnedCaptureFailedIdsRef.current.has(logId)) return;
      warnedCaptureFailedIdsRef.current.add(logId);

      if (logId <= maxKnownLogIdRef.current) return;

      playCaptureFailedSound();

      // 🆕 Đánh dấu log trong ticker để bôi màu cảnh báo (giống cách làm
      // với PlateMismatch ở trên) - trước đây chỉ có toast, ticker không
      // có dấu hiệu gì cho biết log nào từng bị lỗi chụp ảnh.
      //
      // 🐛 FIX: log đã CÓ SẴN ảnh (VD bấm "Chụp lại" cho log đã xử lý xong
      // từ trước, nhưng lần chụp lại này thất bại) KHÔNG được đánh dấu -
      // backend chỉ phát CaptureFailedAlert TRƯỚC KHI gọi UploadPhotosAsync
      // (xem ScanController.CapturePhotos) nên ảnh/kết quả CŨ trong DB vẫn
      // giữ nguyên, không hề bị mất. Trước đây cứ set captureFailed=true vô
      // điều kiện khiến item đang xanh (đã khớp/đã xử lý xong) bỗng mất màu
      // ngay trên UI dù dữ liệu thật không đổi gì - F5 lại đúng vì tải lại
      // từ DB. Chỉ đánh dấu cảnh báo cho log THẬT SỰ chưa có ảnh nào.
      setRecentHistory((prev) =>
        prev.map((item) =>
          item.id === logId && (!item.photoUrls || item.photoUrls.length === 0)
            ? { ...item, captureFailed: true }
            : item
        )
      );

      const rawLane = ev.lane ?? ev.Lane ?? '';
      setCaptureFailedToasts((prev) =>
        [
          {
            logId,
            cardCode: ev.cardCode ?? ev.CardCode ?? '',
            lane: lanes.find((l) => l.id === rawLane || l.laneCode === rawLane)?.name || rawLane,
            timestamp: ev.timestamp ?? ev.Timestamp ?? new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 5)
      );
    });
  }, [captureFailedEvents, lanes, playCaptureFailedSound, historyReady]);

  // useCallback - PHẢI ổn định (không tạo hàm mới mỗi render) để
  // TickerItem (React.memo) thật sự skip re-render được, không thì props
  // onOpen "khác" mỗi lần khiến memo vô nghĩa.
  const openDetails = useCallback((item: HistoryItem) => {
    setModalItem(item);
    setModalOpen(true);
  }, []);

  const closeDetails = () => {
    setModalOpen(false);
    setModalItem(null);
  };

  return (
    <div className="m-board" data-theme={isNight ? 'night' : undefined}>
      <ActionToast toast={toast} onDismiss={dismissActionToast} />
      {/* 1 cột chung cho 2 loại toast - tự xếp nối tiếp theo chiều cao thật,
          không chồng lên nhau (trước đây lùi cố định 90px/toast). */}
      <div className="m-toast-stack">
        <MismatchToastPanel
          toasts={mismatchToasts}
          onDismiss={dismissToast}
          onOpen={(logId) => {
            const item = recentHistory.find((h) => h.id === logId);
            if (item) openDetails(item);
          }}
        />
        <CaptureFailedToastPanel toasts={captureFailedToasts} onDismiss={dismissCaptureFailedToast} />
      </div>

      <header className="m-board__header">
        <div className="m-board__header-left">
          <figure className="m-board__logo">
            <img src={logo} alt="Logo Vinatech Vina" />
          </figure>
          <div className="m-board__brand">
            <h1 className="m-board__brand-name">Vinatech Vina</h1>
            <p className="m-board__brand-desc">Hệ thống kiểm soát xe ra vào</p>
          </div>
        </div>

        <div className="m-board__header-right">
          {isNight && (
            <div className="m-night-badge">
              <IconMoon size={14} /> Chế độ đêm
            </div>
          )}
          <LiveClock />
          <div className="m-conn" data-connected={isConnected ? 'true' : 'false'}>
            <span className="m-conn__dot" />
            <IconSignal size={14} />
            <span>{isConnected ? 'Đã kết nối' : 'Mất kết nối'}</span>
          </div>
          <Logout />
        </div>
      </header>

      {disconnectedSince && (
        <div className="m-conn-banner" role="alert">
          <IconExclamationTriangle size={22} />
          <div className="m-conn-banner__text">
            <strong>
              Mất kết nối máy chủ từ{' '}
              {disconnectedSince.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </strong>
            <span>
              Cảnh báo lệch biển số và kết quả đọc biển TẠM THỜI KHÔNG cập nhật. Hệ thống đang tự kết nối lại —
              kiểm tra biển số bằng mắt trong lúc chờ.
            </span>
          </div>
          <button type="button" className="m-conn-banner__btn" onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
        </div>
      )}

      {lanesLoading ? (
        <main className="m-board__loading" aria-busy="true">
          <div className="m-board__loading-spinner" />
          <span>Đang tải danh sách làn…</span>
        </main>
      ) : (
        <main className="m-board__content">
          <section className="m-board__main">
            <div
              className="m-board__grid"
              style={{ '--lane-count': lanes.length } as React.CSSProperties}
            >
              {lanes.map((lane) => (
                <LaneCard
                  key={lane.id}
                  lane={lane}
                  onNewHistory={handleNewHistory}
                />
              ))}
            </div>
          </section>

          <aside className="m-board__sidebar">
            <section className={`m-ticker ${disconnectedSince ? 'is-stale' : ''}`}>
              <header className="m-ticker__header">
                <h3 className="m-ticker__title">
                  <IconBolt size={16} /> Hoạt động gần đây
                </h3>
              </header>

              <div
                className="m-ticker__list"
                ref={tickerListRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  // Còn cách đáy <= 80px thì coi như "gần cuối", tự tải thêm
                  // trước khi người dùng cuộn chạm đáy hẳn - đỡ khựng lại chờ.
                  if (el.scrollHeight - el.scrollTop - el.clientHeight <= 80) {
                    loadMoreRecentHistory();
                  }
                }}
              >
                {recentHistory.length === 0 && (
                  <p className="m-ticker__empty">Chưa có lượt quẹt nào…</p>
                )}
                {recentHistory.map((e: HistoryItem) => (
                  <TickerItem
                    key={e.id}
                    item={e}
                    laneName={lanes.find((l) => l.id === e.lane || l.laneCode === e.lane)?.name || e.lane}
                    onOpen={openDetails}
                  />
                ))}
                {recentLoadingMore && (
                  <p className="m-ticker__empty" style={{ fontSize: '0.8rem' }}>
                    Đang tải thêm…
                  </p>
                )}
                {!recentLoadingMore && !recentHasMore && recentHistory.length > 0 && (
                  <p className="m-ticker__empty" style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                    Đã hết dữ liệu
                  </p>
                )}
              </div>
            </section>
          </aside>
        </main>
      )}

      <DetailModal
        item={modalItem}
        isOpen={modalOpen}
        lanes={lanes}
        onClose={closeDetails}
        onPlateMatchConfirmed={(logId) => {
          setRecentHistory((prev) => prev.map((p) => (p.id === logId ? { ...p, plateMatch: true } : p)));
          dismissToast(logId);
          showSuccess(`Đã xác nhận khớp biển số cho lượt quẹt #${logId}`);
        }}
      />
    </div>
  );
};

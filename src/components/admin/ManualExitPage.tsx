import React, { useEffect, useRef, useState } from 'react';
import { scanApi } from '../../api/endpoints/scan';
import { historyApi } from '../../api/endpoints/history';
import { lanesApi } from '../../api/endpoints/lanes';
import type { CurrentEntry } from '../../api/types/scan';
import type { HistoryItem } from '../../api/types/history';
import type { LaneOption } from '../../api/types/lane';
import { resolvePhotoUrl } from '../../utils/photoUrl';
import { vnDayStartUtc, vnDayEndUtc } from '../../utils/dateRange';
import { getPageNumbers } from '../../utils/pagination';
import {
  IconExclamationTriangle,
  IconXMark,
  IconDocumentText,
  IconArrowUpTray,
  IconArrowDownTray,
  IconCamera,
  IconMagnifyingGlass,
} from '../../icons/HeroIcons';
import { AdminLayout } from './AdminLayout';
import { SearchableSelect } from '../common/SearchableSelect';
import { ActionToast } from '../common/ActionToast';
import { useToast } from '../../hooks/useToast';
import '../../styles/app.css';
import '../../styles/admin.css';

/**
 * Trang riêng "Cho xe ra thủ công" - đóng 1 log VÀO đang mở KHÔNG QUA QUẸT
 * THẺ (VD thẻ đã báo mất trong lúc xe còn trong bãi - báo mất ở trang Quản
 * lý log ra vào). Chọn xe bằng ẢNH + MÃ THẺ, KHÔNG dùng biển số AI đọc để
 * xác định (có thể sai).
 */

// "Lọc nhanh" (relative-to-now) và "Chọn ngày cụ thể" (absolute, cho phép cả
// ngày quá khứ) là 2 khái niệm khác nhau - tách riêng thay vì gộp chung 1
// hàng nút như trước (dễ hiểu nhầm "Tùy chỉnh" cũng chỉ giới hạn trong ngày).
type QuickPreset = 'all' | '30m' | '1h' | '3h' | 'today' | 'morning-peak' | 'evening-peak';

// 2 khung giờ cao điểm cố định trong ngày (6h-8h sáng, 17h-19h chiều) - KHÁC
// với các preset "N phút/giờ qua" (tương đối so với hiện tại): đây luôn là
// khung giờ CỦA HÔM NAY, hữu ích để rà soát nhanh đúng lúc đông xe nhất mà
// không cần tự gõ giờ ở phần "chọn ngày cụ thể".
const QUICK_PRESETS: { value: QuickPreset; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: '30m', label: '30 phút qua' },
  { value: '1h', label: '1 giờ qua' },
  { value: '3h', label: '3 giờ qua' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'morning-peak', label: '6h - 8h' },
  { value: 'evening-peak', label: '17h - 19h' },
];

const toDateInputValue = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Note lưu dạng "[Cho ra thủ công] NV: {code} | Đã kiểm tra giấy tờ: Có |
// (Thẻ bị mất: Có |) {lý do}" (xem LogService.ManualExitAsync) - tách ra để
// hiển thị đẹp thay vì in nguyên chuỗi thô. Đoạn "Thẻ bị mất: Có" (nếu có)
// tách riêng thành cờ cardLost, KHÔNG để lẫn vào "reason" hiển thị.
const parseManualExitNote = (note: string | null | undefined) => {
  if (!note) return { staffCode: '—', reason: '—', cardLost: false };
  const staffMatch = note.match(/NV:\s*([^|]+)/);
  const cardLost = note.includes('Thẻ bị mất: Có');
  const parts = note
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p !== 'Thẻ bị mất: Có');
  const reason = parts.length >= 3 ? parts.slice(2).join(' | ').trim() : '—';
  return {
    staffCode: staffMatch ? staffMatch[1].trim() : '—',
    reason: reason || '—',
    cardLost,
  };
};

// Tự ghép chuỗi thay vì dùng Intl.toLocaleString() - locale "vi-VN" không
// đảm bảo LUÔN trả về đúng thứ tự "ngày trước giờ" (từng thấy hiện ngược
// "15:23:09 20-08" - giờ trước ngày, đọc sai thói quen VN).
const formatTime = (ts: string) => {
  try {
    const needsZ = typeof ts === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$/.test(ts);
    const parsed = needsZ ? new Date(ts + 'Z') : new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
  } catch {
    return ts;
  }
};

const DONE_PAGE_SIZE = 10;

// Bỏ hết ký tự không phải chữ/số + viết hoa - so khớp biển số không nên
// quan tâm dấu cách/gạch ngang/chấm (VD "66F1-876.56" và "66F1 876 56" phải
// coi là cùng 1 biển).
const normalizePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

// Khoảng cách Levenshtein (số ký tự thêm/xóa/sửa tối thiểu để biến chuỗi a
// thành b) - dùng để lọc "gần đúng": biển số AI đọc hoặc gõ tay có thể lệch
// 1-2 ký tự (nhầm 0/O, 1/I, 8/B, 5/S...) so với biển thật, vẫn nên tìm ra
// được thay vì bắt gõ chính xác tuyệt đối từng ký tự.
const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
};

// Biển số/mã log KHỚP GẦN ĐÚNG với từ khóa tìm kiếm: khớp tuyệt đối, khớp
// dạng chứa chuỗi con (sau khi chuẩn hóa), hoặc lệch tối đa 2 ký tự (đủ
// dung sai cho nhầm lẫn OCR/gõ tay mà không khớp bừa với biển hoàn toàn
// khác - biển số VN thường 7-9 ký tự, lệch 2 vẫn còn "rất giống").
const isFuzzyPlateMatch = (plate: string, query: string): boolean => {
  const p = normalizePlate(plate);
  const q = normalizePlate(query);
  if (!p || !q) return false;
  if (p.includes(q) || q.includes(p)) return true;
  return levenshtein(p, q) <= 2;
};

export const ManualExitPage: React.FC = () => {
  // Tab cấp trang: "pending" = danh sách xe đang trong bãi cần xử lý (nội
  // dung gốc của trang), "done" = lịch sử các lượt đã cho ra thủ công (lọc
  // server-side qua /api/history?direction=out&manualOnly=true).
  const [pageTab, setPageTab] = useState<'pending' | 'done'>('pending');

  const [currentEntries, setCurrentEntries] = useState<CurrentEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [doneItems, setDoneItems] = useState<HistoryItem[]>([]);
  const [doneTotal, setDoneTotal] = useState(0);
  const [donePage, setDonePage] = useState(1);
  const [doneLoading, setDoneLoading] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  // Lọc theo khoảng ngày cho tab "Đã xử lý" - mặc định THÁNG HIỆN TẠI (ngày 1
  // -> hôm nay), server-side thật qua /api/history?from=&to=.
  const [doneFromDate, setDoneFromDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [doneToDate, setDoneToDate] = useState(() => toDateInputValue(new Date()));
  // Tìm theo biển số/mã thẻ cho tab "Đã xử lý" - server-side thật (khớp
  // chuỗi con qua /api/history?search=, xem HistoryController), debounce
  // giống trang Quản lý log để không gọi API dồn dập khi đang gõ.
  const [doneSearch, setDoneSearch] = useState('');
  const [debouncedDoneSearch, setDebouncedDoneSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedDoneSearch(doneSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [doneSearch]);

  // Lọc theo trạng thái "thẻ bị mất" TẠI THỜI ĐIỂM cho ra thủ công (server-
  // side qua /api/history?cardLost=, xem HistoryController) - 'all' bỏ qua
  // filter này, không gửi param.
  const [doneCardLostFilter, setDoneCardLostFilter] = useState<'all' | 'lost' | 'not-lost'>('lost');

  // Ảnh đang phóng lớn (lightbox) - dùng chung cho cả 2 tab.
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  // 2 chế độ lọc tách biệt:
  // - "quick": nút bấm sẵn theo mốc TƯƠNG ĐỐI so với hiện tại (30 phút qua,
  //   hôm nay...) - to, dễ chạm, không cần gõ số.
  // - "date": chọn 1 NGÀY CỤ THỂ bất kỳ (kể cả quá khứ - xe quên quẹt ra
  //   nhiều ngày trước vẫn tìm được) bằng lịch chọn ngày quen thuộc, kèm
  //   khoảng giờ tùy chọn trong ngày đó.
  const [filterMode, setFilterMode] = useState<'quick' | 'date'>('quick');
  const [quickPreset, setQuickPreset] = useState<QuickPreset>('all');
  const [customDate, setCustomDate] = useState(() => toDateInputValue(new Date()));
  const [customFromTime, setCustomFromTime] = useState('');
  const [customToTime, setCustomToTime] = useState('');
  // Tìm theo biển số (khớp GẦN ĐÚNG, xem isFuzzyPlateMatch) hoặc Log ID
  // (khớp chính xác/chứa chuỗi con) - lọc client-side trên danh sách xe
  // đang trong bãi đã tải sẵn (thường không nhiều, không cần gọi API riêng).
  const [pendingSearch, setPendingSearch] = useState('');
  // Lọc theo làn - '' nghĩa là tất cả làn. entry.lane trả về từ backend là
  // laneCode (xem ScanController.GetCurrentEntries), khớp với LaneOption.laneCode.
  const [laneFilter, setLaneFilter] = useState('');
  const [lanes, setLanes] = useState<LaneOption[]>([]);

  useEffect(() => {
    lanesApi
      .getAll()
      .then((res) => {
        const data = (res.data as any)?.data ?? res.data;
        setLanes(Array.isArray(data) ? data : []);
      })
      .catch(() => setLanes([]));
  }, []);

  // Phân trang - danh sách xe đang trong bãi tải 1 lần từ API (không phải
  // lịch sử vô hạn), nên phân trang ở client trên dữ liệu đã lọc là đủ,
  // không cần đổi backend hỗ trợ page/pageSize riêng cho current-entries.
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [exitTarget, setExitTarget] = useState<CurrentEntry | null>(null);
  const [exitStaffCode, setExitStaffCode] = useState('');
  const [exitPlateNumber, setExitPlateNumber] = useState('');
  const [exitDocsChecked, setExitDocsChecked] = useState(false);
  // Tick khi thẻ bị mất (khác với hỏng đầu đọc) - gộp luôn bước "báo mất
  // thẻ" vào hành động cho ra thủ công, backend sẽ khóa vĩnh viễn thẻ này.
  const [exitCardLost, setExitCardLost] = useState(false);
  const [exitNote, setExitNote] = useState('');
  const [exiting, setExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);
  const [justExitedCodes, setJustExitedCodes] = useState<Set<string>>(new Set());

  const { toast, showSuccess, showError, dismiss } = useToast();

  // Đếm thứ tự lần gọi loadEntries/loadDoneItems - chỉ áp dụng kết quả của
  // lần gọi MỚI NHẤT. Không có cờ này, đổi tab/filter liên tục (VD bấm
  // "Cần xử lý" rồi "Đã xử lý" rồi quay lại rất nhanh) có thể khiến response
  // của lần gọi CŨ về SAU response mới hơn, ghi đè dữ liệu mới bằng dữ liệu cũ.
  const entriesRequestSeqRef = useRef(0);
  const doneRequestSeqRef = useRef(0);

  const loadEntries = async () => {
    const seq = ++entriesRequestSeqRef.current;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const res = await scanApi.getCurrentEntries();
      if (seq !== entriesRequestSeqRef.current) return; // có lần gọi mới hơn đã bắt đầu
      const payload = (res.data as any)?.data ?? res.data;
      setCurrentEntries(Array.isArray(payload) ? payload : []);
    } catch {
      if (seq !== entriesRequestSeqRef.current) return;
      setEntriesError('Không tải được danh sách xe đang trong bãi.');
      setCurrentEntries([]);
    } finally {
      if (seq === entriesRequestSeqRef.current) setEntriesLoading(false);
    }
  };

  // 🐛 FIX: trước đây chỉ tải 1 LẦN DUY NHẤT lúc mount trang - nếu 1 xe rời
  // bãi qua đường khác (VD quẹt thẻ bình thường ở cổng) trong lúc trang này
  // đang mở, danh sách không tự cập nhật, vẫn hiện log VÀO đã có log RA rồi.
  // Tải lại mỗi khi quay về tab "Cần xử lý" để luôn khớp trạng thái thật.
  useEffect(() => {
    if (pageTab === 'pending') loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab]);

  const loadDoneItems = async () => {
    const seq = ++doneRequestSeqRef.current;
    setDoneLoading(true);
    setDoneError(null);
    try {
      const res = await historyApi.get({
        page: donePage,
        pageSize: DONE_PAGE_SIZE,
        direction: 'out',
        manualOnly: true,
        from: doneFromDate ? vnDayStartUtc(doneFromDate) : undefined,
        to: doneToDate ? vnDayEndUtc(doneToDate) : undefined,
        search: debouncedDoneSearch || undefined,
        cardLost: doneCardLostFilter === 'all' ? undefined : doneCardLostFilter === 'lost',
      });
      if (seq !== doneRequestSeqRef.current) return;
      const payload = (res.data as any)?.data ?? res.data;
      setDoneItems(payload?.items ?? []);
      setDoneTotal(payload?.total ?? 0);
    } catch {
      if (seq !== doneRequestSeqRef.current) return;
      setDoneError('Không tải được lịch sử cho ra thủ công.');
      setDoneItems([]);
      setDoneTotal(0);
    } finally {
      if (seq === doneRequestSeqRef.current) setDoneLoading(false);
    }
  };

  useEffect(() => {
    if (pageTab === 'done') loadDoneItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab, donePage, doneFromDate, doneToDate, debouncedDoneSearch, doneCardLostFilter]);

  // Đổi khoảng ngày/từ khóa tìm kiếm/lọc trạng thái thẻ -> quay lại trang 1,
  // tránh đứng ở trang rỗng.
  useEffect(() => {
    setDonePage(1);
  }, [doneFromDate, doneToDate, debouncedDoneSearch, doneCardLostFilter]);

  const doneTotalPages = Math.max(1, Math.ceil(doneTotal / DONE_PAGE_SIZE));

  const [exporting, setExporting] = useState(false);

  // Xuất CSV (mở được trực tiếp bằng Excel, không cần thư viện .xlsx riêng)
  // cho TOÀN BỘ kết quả khớp bộ lọc ngày hiện tại - không chỉ trang đang
  // xem, nên gọi lại API với pageSize đủ lớn thay vì dùng doneItems có sẵn.
  const exportDoneToExcel = async () => {
    setExporting(true);
    try {
      const res = await historyApi.get({
        page: 1,
        pageSize: Math.max(doneTotal, 1),
        direction: 'out',
        manualOnly: true,
        from: doneFromDate ? vnDayStartUtc(doneFromDate) : undefined,
        to: doneToDate ? vnDayEndUtc(doneToDate) : undefined,
        search: debouncedDoneSearch || undefined,
        cardLost: doneCardLostFilter === 'all' ? undefined : doneCardLostFilter === 'lost',
      });
      const payload = (res.data as any)?.data ?? res.data;
      const allItems: HistoryItem[] = payload?.items ?? [];

      const header = ['Log ID', 'Mã thẻ', 'Làn', 'Giờ ra', 'Biển số', 'NV xử lý', 'Trạng thái thẻ', 'Lý do'];
      const rows = allItems.map((item) => {
        const { staffCode, reason, cardLost } = parseManualExitNote(item.note);
        return [
          item.id,
          item.cardCode,
          item.lane,
          formatTime(item.timestamp),
          item.plateNumber || '',
          staffCode,
          cardLost ? 'Bị mất' : 'Không mất',
          reason,
        ];
      });
      const escapeCsvCell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
      // BOM (U+FEFF) đứng đầu file để Excel nhận đúng UTF-8, không lỗi font
      // tiếng Việt - dùng escape ﻿ thay vì gõ ký tự trực tiếp để tránh
      // rủi ro bị lưu sai encoding tùy editor.
      const BOM = '﻿';
      const csvContent =
        BOM + [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cho-ra-thu-cong_${doneFromDate || 'tatca'}_${doneToDate || 'tatca'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDoneError('Không xuất được file. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  };

  const getQuickRange = (preset: QuickPreset): { from: number | null; to: number | null } => {
    const now = new Date();
    switch (preset) {
      case '30m':
        return { from: now.getTime() - 30 * 60 * 1000, to: null };
      case '1h':
        return { from: now.getTime() - 60 * 60 * 1000, to: null };
      case '3h':
        return { from: now.getTime() - 3 * 60 * 60 * 1000, to: null };
      case 'today':
        return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), to: null };
      case 'morning-peak':
        return {
          from: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0).getTime(),
          to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0).getTime(),
        };
      case 'evening-peak':
        return {
          from: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0).getTime(),
          to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0).getTime(),
        };
      default:
        return { from: null, to: null };
    }
  };

  // Chế độ "date": ghép ngày đã chọn (có thể là quá khứ) với giờ tùy chọn -
  // để trống giờ = lấy trọn ngày đó (00:00 -> 23:59:59).
  const getDateRange = (): { from: number | null; to: number | null } => {
    if (!customDate) return { from: null, to: null };
    const [y, mo, d] = customDate.split('-').map(Number);
    const parseTimeOrDefault = (hhmm: string, defaultH: number, defaultM: number) => {
      if (!hhmm) return new Date(y, mo - 1, d, defaultH, defaultM, defaultH === 23 ? 59 : 0).getTime();
      const [h, m] = hhmm.split(':').map(Number);
      return new Date(y, mo - 1, d, h, m).getTime();
    };
    return {
      from: parseTimeOrDefault(customFromTime, 0, 0),
      to: parseTimeOrDefault(customToTime, 23, 59),
    };
  };

  const activeRange = filterMode === 'quick' ? getQuickRange(quickPreset) : getDateRange();
  const trimmedPendingSearch = pendingSearch.trim();
  const filteredEntries = currentEntries.filter((entry) => {
    const t = new Date(entry.timestamp).getTime();
    if (activeRange.from != null && t < activeRange.from) return false;
    if (activeRange.to != null && t > activeRange.to) return false;
    if (laneFilter && entry.lane !== laneFilter) return false;

    if (trimmedPendingSearch) {
      const matchesLogId = String(entry.logId).includes(trimmedPendingSearch);
      const matchesPlate = entry.plateNumber ? isFuzzyPlateMatch(entry.plateNumber, trimmedPendingSearch) : false;
      if (!matchesLogId && !matchesPlate) return false;
    }

    return true;
  });

  // Đổi filter -> quay lại trang 1, tránh đứng ở trang rỗng khi danh sách
  // lọc ra ngắn hơn trang hiện tại.
  useEffect(() => {
    setPage(1);
  }, [filterMode, quickPreset, customDate, customFromTime, customToTime, trimmedPendingSearch, laneFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const pageEntries = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openExitConfirm = (entry: CurrentEntry) => {
    setExitTarget(entry);
    setExitStaffCode('');
    setExitPlateNumber(entry.plateNumber || '');
    setExitDocsChecked(false);
    // Nếu thẻ đã bị báo mất từ trước (VD báo lúc xe còn trong bãi), tick sẵn
    // và không cho bỏ tick - thẻ đã mất thì vẫn mất, không thể "tìm lại"
    // ngay tại bước cho ra.
    setExitCardLost(entry.cardStatus === 'lost');
    setExitNote('');
    setExitError(null);
  };

  const closeExitConfirm = () => {
    if (exiting) return;
    setExitTarget(null);
    setExitError(null);
  };

  // Nút "Xác nhận cho ra" chỉ bật khi đủ cả 4 trường - tránh bảo vệ bấm rồi
  // mới thấy báo thiếu từng trường một, mất công thử lại nhiều lần.
  const exitFormValid =
    exitStaffCode.trim() !== '' &&
    exitPlateNumber.trim() !== '' &&
    exitNote.trim() !== '' &&
    exitDocsChecked;

  const confirmManualExit = async () => {
    if (!exitTarget || !exitFormValid) return;
    setExiting(true);
    setExitError(null);
    try {
      await scanApi.manualExit(exitTarget.logId, {
        note: exitNote.trim(),
        staffCode: exitStaffCode.trim(),
        plateNumber: exitPlateNumber.trim(),
        documentsChecked: exitDocsChecked,
        cardLost: exitCardLost,
      });
      setJustExitedCodes((prev) => new Set(prev).add(exitTarget.cardCode));
      setCurrentEntries((prev) => prev.filter((e) => e.logId !== exitTarget.logId));
      setExitTarget(null);
      showSuccess('Đã cho xe ra thủ công');
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || 'Cho ra thủ công thất bại. Vui lòng thử lại.';
      setExitError(message);
      showError(message);
    } finally {
      setExiting(false);
    }
  };

  return (
    <AdminLayout>
      <ActionToast toast={toast} onDismiss={dismiss} />
      <div className="m-page m-page--manual">
        <header className="m-page__header">
          <div>
            <h1 className="m-page__title">
              <IconArrowUpTray size={22} style={{ verticalAlign: '-3px', marginRight: 8 }} />
              Cho xe ra thủ công
            </h1>
            <p className="m-page__subtitle">
              Đóng 1 lượt VÀO đang mở mà không cần quẹt thẻ - chọn xe bằng <strong>ảnh</strong> và{' '}
              <strong>mã thẻ</strong>, KHÔNG dựa vào biển số (AI đọc có thể sai).
            </p>
          </div>
          {justExitedCodes.size > 0 && (
            <span className="m-badge m-badge--success" style={{ fontSize: '0.8rem' }}>
              Đã xử lý {justExitedCodes.size} xe trong phiên này
            </span>
          )}
        </header>

        <div className="m-filter-tabs" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className="m-filter-tab"
            data-active={pageTab === 'pending'}
            onClick={() => setPageTab('pending')}
          >
            Cần xử lý
          </button>
          <button
            type="button"
            className="m-filter-tab"
            data-active={pageTab === 'done'}
            onClick={() => setPageTab('done')}
          >
            Đã xử lý
          </button>
        </div>

        {pageTab === 'pending' ? (
        <div className="m-page__card">
          <div className="m-filter-panel m-filter-panel--compact">
            {/* Hàng 1: ô tìm kiếm + pill lọc nhanh (tương đối so với hiện tại)
                cùng hàng - cả 2 đều là thao tác "bấm 1 phát ra kết quả ngay". */}
            <div className="m-filter-row-top">
              <div className="m-search" style={{ maxWidth: 280 }}>
                <IconMagnifyingGlass size={16} />
                <input
                  className="m-search__input"
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                />
              </div>

              <div style={{ width: 180 }}>
                <SearchableSelect
                  options={lanes.map((lane) => ({ value: lane.laneCode || String(lane.id), label: lane.name }))}
                  value={laneFilter}
                  onChange={setLaneFilter}
                  placeholder="Tất cả làn"
                  allowClear
                  clearLabel="Tất cả làn"
                />
              </div>

              <div className="m-preset-row m-preset-row--compact">
                {QUICK_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="m-preset-btn m-preset-btn--sm"
                    data-active={filterMode === 'quick' && quickPreset === p.value}
                    onClick={() => {
                      setFilterMode('quick');
                      setQuickPreset(p.value);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hàng 2: chọn ngày cụ thể + khoảng giờ - tách hẳn khỏi pill lọc
                nhanh, đóng khung riêng để dễ nhận ra đây là 1 CÁCH LỌC KHÁC
                (tuyệt đối theo ngày/giờ, cho phép cả ngày quá khứ) chứ không
                phải cùng nhóm với các pill "N phút/giờ qua" ở trên. */}
            <div className="m-date-time-box">
              <span className="m-date-time-box__label">Ngày cụ thể</span>
              <input
                type="date"
                className="m-input m-time-input m-time-input--compact"
                title="Chọn ngày cụ thể (kể cả quá khứ)"
                value={customDate}
                max={toDateInputValue(new Date())}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setFilterMode('date');
                }}
              />
              <span className="m-filter-or">·</span>
              <input
                type="time"
                className="m-input m-time-input m-time-input--compact"
                title="Từ giờ (tùy chọn)"
                value={customFromTime}
                onChange={(e) => {
                  setCustomFromTime(e.target.value);
                  setFilterMode('date');
                }}
              />
              <span className="m-filter-or">-</span>
              <input
                type="time"
                className="m-input m-time-input m-time-input--compact"
                title="Đến giờ (tùy chọn)"
                value={customToTime}
                onChange={(e) => {
                  setCustomToTime(e.target.value);
                  setFilterMode('date');
                }}
              />
              {filterMode === 'date' && (
                <button
                  type="button"
                  className="m-btn m-btn--secondary m-btn--sm"
                  onClick={() => setFilterMode('quick')}
                >
                  Bỏ lọc ngày
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
            {entriesLoading ? (
              <div className="m-table-loading">
                <span className="m-btn__spinner" /> Đang tải danh sách xe trong bãi...
              </div>
            ) : entriesError ? (
              <div className="m-table-empty">
                <IconExclamationTriangle size={28} style={{ opacity: 0.5, color: 'var(--m-color-error)' }} />
                <span>{entriesError}</span>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="m-table-empty">
                <IconDocumentText size={28} style={{ opacity: 0.4 }} />
                <span>
                  {currentEntries.length === 0
                    ? 'Không có xe nào đang trong bãi'
                    : 'Không có xe nào vào trong khoảng giờ đã lọc'}
                </span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {pageEntries.map((entry) => {
                    const hasBothPhotos = (entry.photoUrls?.length || 0) >= 2;
                    return (
                    <div key={entry.logId} className="m-vehicle-card">
                      <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                        {[0, 1].map((i) => {
                          const url = entry.photoUrls?.[i];
                          return (
                            <div
                              key={i}
                              className="m-vehicle-card__photo"
                              style={url ? { cursor: 'zoom-in' } : undefined}
                              onClick={url ? () => setZoomedPhoto(resolvePhotoUrl(url)) : undefined}
                              title={url ? 'Bấm để phóng to' : `Thiếu ảnh cam ${i + 1}`}
                            >
                              {url ? (
                                <img src={resolvePhotoUrl(url)} alt={`Ảnh cam ${i + 1}`} />
                              ) : (
                                <IconCamera size={28} style={{ opacity: 0.3 }} />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="m-vehicle-card__info">
                        {!hasBothPhotos && (
                          <span className="m-badge m-badge--warning" style={{ marginBottom: 4 }}>
                            Thiếu ảnh - chỉ có {entry.photoUrls?.length || 0}/2 camera
                          </span>
                        )}
                        <div className="m-vehicle-card__code">
                          {entry.cardCode}
                          {entry.cardStatus === 'lost' && (
                            <span className="m-badge m-badge--error">Đã báo mất</span>
                          )}
                        </div>
                        <div className="m-vehicle-card__meta">
                          <span className="m-vehicle-card__meta-item">{entry.lane}</span>
                          <span className="m-vehicle-card__meta-item">
                            Vào lúc
                            {(() => {
                              const [datePart, timePart] = formatTime(entry.timestamp).split(' ');
                              return (
                                <span className="m-time-chip-group">
                                  <span className="m-time-chip m-time-chip--date">{datePart}</span>
                                  <span className="m-time-chip m-time-chip--time">{timePart}</span>
                                </span>
                              );
                            })()}
                          </span>
                          {entry.plateNumber && (
                            <span className="m-vehicle-card__meta-item m-table__cell-mono">
                              {entry.plateNumber}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        className="m-btn m-btn--primary"
                        style={{ padding: '0.85rem 1.6rem', fontSize: '1rem', flexShrink: 0 }}
                        onClick={() => openExitConfirm(entry)}
                      >
                        Chọn - Cho ra
                      </button>
                    </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="m-pagination" style={{ marginTop: '1.25rem' }}>
                    <span className="m-pagination__info">
                      Trang {page}/{totalPages} · {filteredEntries.length} xe
                    </span>
                    <div className="m-pagination__controls">
                      <button
                        className="m-pagination__btn"
                        aria-label="Trang trước"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        ‹
                      </button>
                      {getPageNumbers(page, totalPages).map((token, i) =>
                        token === 'ellipsis' ? (
                          <span key={`e${i}`} className="m-pagination__ellipsis">…</span>
                        ) : (
                          <button
                            key={token}
                            className="m-pagination__btn"
                            data-active={page === token}
                            aria-label={`Trang ${token}`}
                            aria-current={page === token ? 'page' : undefined}
                            onClick={() => setPage(token)}
                          >
                            {token}
                          </button>
                        )
                      )}
                      <button
                        className="m-pagination__btn"
                        aria-label="Trang sau"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        ) : (
        <div className="m-page__card">
          <div className="m-filter-panel">
            <div className="m-date-filter-row">
              <div className="m-form-field" style={{ minWidth: 220, flex: '1 1 260px' }}>
                <label className="m-form-label">Tìm biển số</label>
                <div className="m-search">
                  <IconMagnifyingGlass size={16} />
                  <input
                    className="m-search__input"
                    placeholder="VD: 66F1 8756..."
                    value={doneSearch}
                    onChange={(e) => setDoneSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="m-form-field" style={{ minWidth: 160 }}>
                <label className="m-form-label">Trạng thái thẻ</label>
                <select
                  className="m-select"
                  value={doneCardLostFilter}
                  onChange={(e) => setDoneCardLostFilter(e.target.value as 'all' | 'lost' | 'not-lost')}
                >
                  <option value="all">Tất cả</option>
                  <option value="lost">Bị mất</option>
                  <option value="not-lost">Không mất</option>
                </select>
              </div>
              <div className="m-form-field">
                <label className="m-form-label">Từ ngày</label>
                <input
                  type="date"
                  className="m-input m-time-input"
                  value={doneFromDate}
                  max={doneToDate || undefined}
                  onChange={(e) => setDoneFromDate(e.target.value)}
                />
              </div>
              <div className="m-form-field">
                <label className="m-form-label">Đến ngày</label>
                <input
                  type="date"
                  className="m-input m-time-input"
                  value={doneToDate}
                  min={doneFromDate || undefined}
                  onChange={(e) => setDoneToDate(e.target.value)}
                />
              </div>
              {/* <button
                type="button"
                className="m-preset-btn"
                onClick={() => {
                  const now = new Date();
                  setDoneFromDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
                  setDoneToDate(toDateInputValue(now));
                }}
              >
                Tháng này
              </button> */}
              <button
                type="button"
                className="m-btn m-btn--secondary"
                style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}
                onClick={exportDoneToExcel}
                disabled={exporting || doneTotal === 0}
              >
                {exporting ? (
                  <>
                    <span className="m-btn__spinner" /> Đang xuất...
                  </>
                ) : (
                  <>
                    <IconArrowDownTray size={16} /> Xuất Excel ({doneTotal})
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="m-table-wrap">
            {doneLoading ? (
              <div className="m-table-loading">
                <span className="m-btn__spinner" /> Đang tải lịch sử...
              </div>
            ) : doneError ? (
              <div className="m-table-empty">
                <IconExclamationTriangle size={28} style={{ opacity: 0.5, color: 'var(--m-color-error)' }} />
                <span>{doneError}</span>
              </div>
            ) : (
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Log ID</th>
                    <th>Mã thẻ</th>
                    <th>Làn</th>
                    <th>Giờ ra</th>
                    <th>Biển số</th>
                    <th>NV xử lý</th>
                    <th>Trạng thái thẻ</th>
                    <th>Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {doneItems.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="m-table-empty">
                          <IconDocumentText size={28} style={{ opacity: 0.4 }} />
                          <span>Chưa có lượt nào được cho ra thủ công</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    doneItems.map((item) => {
                      const { staffCode, reason, cardLost } = parseManualExitNote(item.note);
                      return (
                        <tr key={item.id}>
                          <td className="m-table__cell-mono m-table__cell-muted">#{item.id}</td>
                          <td style={{ fontWeight: 700 }}>{item.cardCode}</td>
                          <td>{item.lane}</td>
                          <td className="m-table__cell-muted">{formatTime(item.timestamp)}</td>
                          <td className="m-table__cell-mono">{item.plateNumber || '—'}</td>
                          <td>{staffCode}</td>
                          <td>
                            {cardLost ? (
                              <span className="m-badge m-badge--error">Bị mất</span>
                            ) : (
                              <span className="m-badge m-badge--neutral">Không mất</span>
                            )}
                          </td>
                          <td style={{ maxWidth: 260 }}>{reason}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="m-pagination">
            <span className="m-pagination__info">
              {doneTotal === 0 ? 'Không có dữ liệu' : `Trang ${donePage}/${doneTotalPages} · ${doneTotal} lượt`}
            </span>
            <div className="m-pagination__controls">
              <button
                className="m-pagination__btn"
                aria-label="Trang trước"
                disabled={donePage <= 1}
                onClick={() => setDonePage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {getPageNumbers(donePage, doneTotalPages).map((token, i) =>
                token === 'ellipsis' ? (
                  <span key={`e${i}`} className="m-pagination__ellipsis">…</span>
                ) : (
                  <button
                    key={token}
                    className="m-pagination__btn"
                    data-active={donePage === token}
                    aria-label={`Trang ${token}`}
                    aria-current={donePage === token ? 'page' : undefined}
                    onClick={() => setDonePage(token)}
                  >
                    {token}
                  </button>
                )
              )}
              <button
                className="m-pagination__btn"
                aria-label="Trang sau"
                disabled={donePage >= doneTotalPages}
                onClick={() => setDonePage((p) => Math.min(doneTotalPages, p + 1))}
              >
                ›
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Modal xác nhận cho ra thủ công (sau khi đã chọn xe) */}
      {exitTarget && (
        <div className="m-modal-overlay" onClick={closeExitConfirm}>
          <article className="m-modal m-modal--lg" onClick={(e) => e.stopPropagation()}>
            <header className="m-modal__header">
              <h3>Xác nhận cho ra thủ công</h3>
              <button className="m-modal__close" onClick={closeExitConfirm} disabled={exiting} aria-label="Đóng">
                <IconXMark size={20} />
              </button>
            </header>
            <section className="m-modal__body m-modal__body--form">
              <p className="m-confirm-text" style={{ padding: 0, marginBottom: '1rem' }}>
                Cho xe của thẻ <strong>{exitTarget.cardCode}</strong> (vào lúc{' '}
                {formatTime(exitTarget.timestamp)}) ra khỏi bãi mà không cần quẹt thẻ?
              </p>

              <div className="m-form-grid">
                <div className="m-form-field">
                  <label className="m-form-label">Mã nhân viên xử lý</label>
                  <input
                    className="m-input"
                    value={exitStaffCode}
                    onChange={(e) => setExitStaffCode(e.target.value)}
                    placeholder="VD: NV0012"
                  />
                </div>
                <div className="m-form-field">
                  <label className="m-form-label">Biển số xe (quan sát trực tiếp)</label>
                  <input
                    className="m-input"
                    value={exitPlateNumber}
                    onChange={(e) => setExitPlateNumber(e.target.value)}
                    placeholder="VD: 66F1 87656"
                  />
                </div>
                <div className="m-form-field m-form-field--full">
                  <label className="m-form-label">Lý do cho ra thủ công</label>
                  <textarea
                    className="m-input"
                    rows={3}
                    value={exitNote}
                    onChange={(e) => setExitNote(e.target.value)}
                    placeholder="VD: Thẻ đã báo mất lúc 10h, xe cần ra gấp"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
                <div className="m-form-field m-form-field--full">
                  <label className="m-check-row">
                    <input
                      type="checkbox"
                      checked={exitDocsChecked}
                      onChange={(e) => setExitDocsChecked(e.target.checked)}
                    />
                    Tôi đã kiểm tra giấy tờ xe khớp với người/xe đang đứng tại cổng
                  </label>
                </div>
                <div className="m-form-field m-form-field--full">
                  <label
                    className="m-check-row"
                    style={exitCardLost ? { borderColor: 'var(--m-color-error)', background: 'var(--m-color-error-bg)' } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={exitCardLost}
                      disabled={exitTarget?.cardStatus === 'lost'}
                      onChange={(e) => setExitCardLost(e.target.checked)}
                    />
                    Bị mất thẻ
                    {exitTarget?.cardStatus === 'lost' && ' - đã báo mất từ trước'}
                  </label>
                  {exitCardLost && (
                    <p className="m-table__cell-muted" style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>
                      Thẻ sẽ bị khóa vĩnh viễn sau khi cho ra - không thể quẹt vào/ra bằng thẻ này nữa.
                    </p>
                  )}
                </div>
                {exitError && (
                  <div className="m-form-field--full">
                    <span className="m-form-error">{exitError}</span>
                  </div>
                )}
              </div>
            </section>
            <footer className="m-modal__footer">
              <button className="m-btn m-btn--secondary" onClick={closeExitConfirm} disabled={exiting}>
                Hủy
              </button>
              <button
                className="m-btn m-btn--primary"
                onClick={confirmManualExit}
                disabled={exiting || !exitFormValid}
                title={!exitFormValid ? 'Vui lòng điền đầy đủ mã NV, biển số, lý do và tick xác nhận giấy tờ' : undefined}
              >
                {exiting ? (
                  <>
                    <span className="m-btn__spinner" /> Đang xử lý...
                  </>
                ) : (
                  'Xác nhận cho ra'
                )}
              </button>
            </footer>
          </article>
        </div>
      )}

      {/* Lightbox phóng to ảnh - bấm vào bất kỳ ảnh nào trong danh sách xe */}
      {zoomedPhoto && (
        <div
          className="m-modal-overlay"
          onClick={() => setZoomedPhoto(null)}
          style={{ cursor: 'zoom-out', padding: '2rem' }}
        >
          <img
            src={zoomedPhoto}
            alt="Ảnh phóng to"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 'var(--m-r-md)',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="m-modal__close"
            onClick={() => setZoomedPhoto(null)}
            aria-label="Đóng"
            style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.9)' }}
          >
            <IconXMark size={22} />
          </button>
        </div>
      )}

    </AdminLayout>
  );
};

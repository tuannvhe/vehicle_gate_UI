export type PageToken = number | 'ellipsis';

// Sinh danh sách nút số trang kiểu "1 2 3 … 7 8 9" - trước đây các trang
// quản lý (Logs/Cards/Lanes/Cameras/ManualExit) render THẲNG 1 nút cho MỖI
// trang (Array.from({length: totalPages})), với danh sách dài (VD lịch sử
// log hàng nghìn dòng -> hàng trăm trang) sẽ tràn ngang khỏi khung phân
// trang. Rút gọn còn: luôn hiện trang đầu/cuối + vài trang quanh trang hiện
// tại, phần giữa bị lược thành dấu "…".
export function getPageNumbers(current: number, total: number, siblings = 1, boundaries = 1): PageToken[] {
  const range = (start: number, end: number): number[] =>
    start > end ? [] : Array.from({ length: end - start + 1 }, (_, i) => start + i);

  if (total <= 0) return [];

  // Đủ chỗ hiện hết - không cần rút gọn.
  const totalNumbersWhenNoTruncate = siblings * 2 + boundaries * 2 + 3;
  if (total <= totalNumbersWhenNoTruncate) return range(1, total);

  const leftSibling = Math.max(current - siblings, boundaries + 2);
  const rightSibling = Math.min(current + siblings, total - boundaries - 1);

  const showLeftEllipsis = leftSibling > boundaries + 2;
  const showRightEllipsis = rightSibling < total - boundaries - 1;

  const items: PageToken[] = [];
  items.push(...range(1, boundaries));
  items.push(...(showLeftEllipsis ? (['ellipsis'] as PageToken[]) : range(boundaries + 1, leftSibling - 1)));
  items.push(...range(leftSibling, rightSibling));
  items.push(...(showRightEllipsis ? (['ellipsis'] as PageToken[]) : range(rightSibling + 1, total - boundaries)));
  items.push(...range(total - boundaries + 1, total));

  return items;
}

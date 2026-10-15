import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown, IconMagnifyingGlass, IconXMark } from '../../icons/HeroIcons';
import '../../styles/admin.css';

/**
 * Combobox có ô tìm kiếm - thay cho <select> thường ở những nơi danh sách
 * lựa chọn có thể phình to theo dữ liệu (VD chọn Làn, sau này có thể lên
 * hàng chục làn) - kéo 1 <select> dài rất bất tiện, gõ để lọc nhanh hơn
 * nhiều. KHÔNG dùng cho select có số lựa chọn cố định nhỏ (trạng thái...) -
 * ở đó filter chỉ thêm thao tác thừa, không giải quyết vấn đề gì.
 */

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Cho phép bỏ chọn (value rỗng) - dùng cho các bộ lọc kiểu "Tất cả...". */
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = 'Chọn...',
  allowClear = false,
  clearLabel = 'Tất cả',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    // Focus ngay khi mở để gõ được luôn, không cần bấm thêm lần nữa vào ô input.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="m-searchable-select" ref={rootRef}>
      {!open ? (
        <button
          type="button"
          className="m-searchable-select__trigger"
          onClick={openDropdown}
          disabled={disabled}
        >
          <span className={selected ? '' : 'm-searchable-select__placeholder'}>
            {selected ? selected.label : placeholder}
          </span>
          <IconChevronDown size={16} />
        </button>
      ) : (
        <div className="m-searchable-select__input-wrap">
          <IconMagnifyingGlass size={14} />
          <input
            ref={inputRef}
            className="m-searchable-select__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={selected?.label || placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setQuery('');
              } else if (e.key === 'Enter' && filtered.length > 0) {
                pick(filtered[0].value);
              }
            }}
          />
          <button
            type="button"
            className="m-searchable-select__close"
            onClick={() => {
              setOpen(false);
              setQuery('');
            }}
            aria-label="Đóng"
          >
            <IconXMark size={14} />
          </button>
        </div>
      )}

      {open && (
        <div className="m-searchable-select__list">
          {allowClear && (
            <button
              type="button"
              className="m-searchable-select__option m-searchable-select__option--clear"
              onClick={() => pick('')}
            >
              {clearLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="m-searchable-select__empty">Không tìm thấy</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className="m-searchable-select__option"
                data-active={o.value === value}
                onClick={() => pick(o.value)}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

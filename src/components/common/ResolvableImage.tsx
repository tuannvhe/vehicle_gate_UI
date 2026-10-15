import React, { useEffect, useMemo, useState } from 'react';
import { scanApi } from '../../api/endpoints/scan';
import { resolvePhotoUrl, withCacheBust } from '../../utils/photoUrl';
import { IconCamera } from '../../icons/HeroIcons';
import '../../styles/app.css';

interface Props {
  raw?: string | null;
  logId?: number | null;
  index?: number;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

const MAX_RETRIES_PER_CANDIDATE = 5;
const RETRY_DELAY_MS = 1200;

export const ResolvableImage: React.FC<Props> = ({
  raw,
  logId,
  index,
  alt = '',
  className = '',
  loading = 'eager',
}) => {
  const candidates = useMemo<string[]>(() => {
    const list: string[] = [];

    if (raw) {
      const resolved = resolvePhotoUrl(raw);
      if (resolved) list.push(resolved);
    }

    if (logId != null && typeof index === 'number') {
      try {
        const apiPhoto = scanApi.getPhoto(logId, index);
        if (apiPhoto) list.push(resolvePhotoUrl(apiPhoto));
      } catch {
        // ignore
      }
    }

    return Array.from(new Set(list)).filter(Boolean);
  }, [raw, logId, index]);

  const [candidateIdx, setCandidateIdx] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setCandidateIdx(0);
    setRetryCount(0);
    setLoaded(false);
    setExhausted(false);
  }, [raw, logId, index]);

  const baseSrc = candidates[candidateIdx] ?? null;
  const src = baseSrc
    ? retryCount > 0
      ? withCacheBust(baseSrc, retryCount)
      : baseSrc
    : null;

  const handleError = () => {
    if (retryCount < MAX_RETRIES_PER_CANDIDATE) {
      window.setTimeout(() => setRetryCount((c) => c + 1), RETRY_DELAY_MS);
      return;
    }
    if (candidateIdx + 1 < candidates.length) {
      setCandidateIdx((i) => i + 1);
      setRetryCount(0);
    } else {
      setExhausted(true);
    }
  };

  const handleLoad = () => setLoaded(true);

  if (!src || exhausted) {
    return (
      <figure className="m-modal__no-photo" data-state={exhausted ? 'failed' : 'empty'}>
        <IconCamera size={20} />
        <span>{exhausted ? 'Không tải được ảnh' : 'Không có ảnh'}</span>
      </figure>
    );
  }

  return (
    <figure style={{ position: 'relative', width: '100%', height: '100%', minHeight: 90, margin: 0 }}>
      <img
        key={src}
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        onError={handleError}
        onLoad={handleLoad}
        style={{
          opacity: loaded ? 1 : 0,
          transition: 'opacity 150ms ease',
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
          objectPosition: 'center',
          position: loaded ? 'static' : 'absolute',
          inset: 0,
        }}
      />
      {!loaded && (
        <div
          style={{ width: '100%', height: '100%', minHeight: 90, background: '#f1f5f9' }}
        />
      )}
    </figure>
  );
};

export default ResolvableImage;

import { useRef, useEffect, useCallback } from 'react';

/**
 * @param src File âm thanh phát khi có cảnh báo. Nếu file chưa tồn tại (VD
 * chưa có file .mp3 thật), audio.play() sẽ lỗi và tự động rơi về tiếng beep
 * tổng hợp (Web Audio) bên dưới - cứ đặt tên file trước, thả file thật vào
 * public/ sau lúc nào cũng được, không cần sửa code.
 * @param beepFrequency Tần số (Hz) của tiếng beep dự phòng - đặt khác nhau
 * cho từng loại cảnh báo để phân biệt được bằng tai dù chưa có file thật.
 */
export function useAlertSound(src: string = '/canh_bao.mp3', beepFrequency: number = 880) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [src]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      const audio = audioRef.current;
      if (!audio) return;
      audioUnlockedRef.current = true;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {
          audioUnlockedRef.current = false;
        });

      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const playAlertSound = useCallback(async () => {
    try {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        await audio.play();
        return;
      }
    } catch (err) {
      console.warn('playAlertSound: audio.play() failed, falling back to beep.', err);
    }

    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = beepFrequency;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      o.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.warn('playAlertSound: WebAudio beep fallback failed.', err);
    }
  }, [beepFrequency]);

  return { playAlertSound };
}

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface VoicePlayerProps {
  src: string;
  duration?: number;
  isMine: boolean;
  darkMode: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ src, duration = 0, isMine, darkMode }) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    audio.currentTime = percent * audio.duration;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const waveColor = isMine
    ? 'bg-white/40'
    : darkMode
      ? 'bg-gray-400'
      : 'bg-gray-300';
  const activeWaveColor = isMine
    ? 'bg-white'
    : 'bg-orange-500';

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
          isMine
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : darkMode
              ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
        }`}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Waveform / Progress bar */}
      <div className="flex-1 flex flex-col gap-0.5">
        <div
          className="relative h-6 flex items-center cursor-pointer"
          onClick={handleProgressClick}
        >
          {/* Waveform bars */}
          <div className="flex items-center gap-[2px] w-full h-full">
            {Array.from({ length: 28 }).map((_, i) => {
              const barProgress = (i / 28) * 100;
              const isActive = barProgress <= progress;
              const height = Math.max(4, Math.sin(i * 0.5) * 12 + 8 + Math.random() * 6);
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-colors ${
                    isActive ? activeWaveColor : waveColor
                  }`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>
        </div>

        {/* Duration */}
        <div className={`flex justify-between text-[9px] ${
          isMine ? 'text-white/60' : darkMode ? 'text-gray-400' : 'text-gray-400'
        }`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>
    </div>
  );
};

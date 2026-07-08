// ─── Splash Screen with Particles Animation ────────────────────────
// Particles fly in from random positions and converge to form the "N" logo.
// Then the logo glows, scales, and fades out — revealing the app.

import React, { useState, useEffect, useRef } from 'react';

interface Particle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  size: number;
}

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'gathering' | 'forming' | 'glowing' | 'fading'>('gathering');
  const [particles, setParticles] = useState<Particle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate particles that converge toward center
  useEffect(() => {
    const count = 60;
    const centerX = 50; // percentage
    const centerY = 50;
    const newParticles: Particle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const distance = 60 + Math.random() * 40; // start far from center
      newParticles.push({
        id: i,
        startX: centerX + Math.cos(angle) * distance,
        startY: centerY + Math.sin(angle) * distance,
        endX: centerX + (Math.random() - 0.5) * 15, // converge near center
        endY: centerY + (Math.random() - 0.5) * 15,
        delay: Math.random() * 0.3,
        size: 3 + Math.random() * 5,
      });
    }
    setParticles(newParticles);

    // Phase transitions
    const t1 = setTimeout(() => setPhase('forming'), 800);
    const t2 = setTimeout(() => setPhase('glowing'), 1400);
    const t3 = setTimeout(() => setPhase('fading'), 2200);
    const t4 = setTimeout(() => onComplete(), 2800);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete]);

  // Canvas for particle trails
  useEffect(() => {
    if (phase === 'fading') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let animId: number;
    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (phase === 'gathering' || phase === 'forming') {
        particles.forEach(p => {
          const progress = Math.min((frame / 60) - p.delay, 1);
          if (progress < 0) return;
          const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          const x = p.startX + (p.endX - p.startX) * eased;
          const y = p.startY + (p.endY - p.startY) * eased;
          const opacity = progress < 0.8 ? 1 : (1 - (progress - 0.8) / 0.2);

          ctx.beginPath();
          ctx.arc(
            (x / 100) * canvas.width,
            (y / 100) * canvas.height,
            p.size * (1 - eased * 0.5),
            0, Math.PI * 2
          );
          ctx.fillStyle = `rgba(16, 185, 129, ${opacity * 0.8})`;
          ctx.fill();

          // Glow trail
          ctx.beginPath();
          ctx.arc(
            (x / 100) * canvas.width,
            (y / 100) * canvas.height,
            p.size * 2 * (1 - eased * 0.7),
            0, Math.PI * 2
          );
          ctx.fillStyle = `rgba(5, 150, 105, ${opacity * 0.2})`;
          ctx.fill();
        });
      }

      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animId);
  }, [particles, phase]);

  const opacity = phase === 'fading' ? 0 : 1;
  const logoScale = phase === 'gathering' ? 0 : phase === 'forming' ? 0.8 : phase === 'glowing' ? 1 : 1.1;
  const logoOpacity = phase === 'gathering' ? 0 : phase === 'forming' ? 0.5 : phase === 'glowing' ? 1 : 0;
  const glowIntensity = phase === 'glowing' ? 1 : phase === 'fading' ? 0.5 : 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0E14',
        opacity,
        transition: 'opacity 0.6s ease-out',
      }}
    >
      {/* Canvas for particles */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        width={typeof window !== 'undefined' ? window.innerWidth : 400}
        height={typeof window !== 'undefined' ? window.innerHeight : 800}
      />

      {/* Logo "N" */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
        }}
      >
        {/* Glow ring */}
        <div
          style={{
            position: 'absolute',
            inset: -30,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(16, 185, 129, ${glowIntensity * 0.4}) 0%, transparent 70%)`,
            filter: `blur(${20 + glowIntensity * 20}px)`,
            transition: 'filter 0.4s ease',
          }}
        />

        {/* N Logo — circle with gradient (new design: N in circle) */}
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="nawaqesLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Circle background with gradient */}
          <circle
            cx="60" cy="60" r="55"
            fill="url(#nawaqesLogoGradient)"
            filter={glowIntensity > 0 ? 'url(#logoGlow)' : undefined}
          />

          {/* N letter — geometric, white, centered in circle */}
          <path
            d="M38 82 L38 38 L48 38 L68 68 L68 38 L78 38 L78 82 L68 82 L48 52 L48 82 Z"
            fill="white"
            fillOpacity="0.95"
          />

          {/* Accent dot */}
          <circle cx="83" cy="35" r="4" fill="#A7F3D0" />
        </svg>
      </div>

      {/* App name + tagline */}
      <div
        style={{
          position: 'absolute',
          bottom: '18%',
          opacity: phase === 'glowing' || phase === 'fading' ? 1 : 0,
          transition: 'opacity 0.5s ease 0.3s',
          textAlign: 'center',
        }}
      >
        <h1 style={{
          fontSize: '1.8rem',
          fontWeight: 800,
          color: '#10B981',
          margin: 0,
          letterSpacing: '0.05em',
        }}>
          نواقص
        </h1>
        <p style={{
          fontSize: '0.7rem',
          color: '#6B7280',
          margin: '4px 0 8px',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          NAWAQES
        </p>
        <p style={{
          fontSize: '0.75rem',
          color: '#9CA3AF',
          margin: 0,
          fontWeight: 500,
        }}>
          دردشة • سوق • قنوات • بث مباشر
        </p>
      </div>
    </div>
  );
};

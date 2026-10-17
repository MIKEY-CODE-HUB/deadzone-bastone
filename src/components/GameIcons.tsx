import React from 'react';
import { TurretType } from '../game/types';

export const TitleLockupSvg: React.FC = () => (
  <svg
    viewBox="0 0 620 118"
    className="w-full max-w-[540px] h-auto select-none"
    aria-label="Deadzone Bastion"
  >
    <defs>
      <linearGradient id="dzTitleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="65%" stopColor="#E2E8F0" />
        <stop offset="100%" stopColor="#94A3B8" />
      </linearGradient>
      <linearGradient id="dzAmberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#EA580C" />
      </linearGradient>
    </defs>

    {/* Tactical top bracket bar */}
    <path
      d="M4 18 L24 4 L175 4 L185 14 L435 14 L445 4 L596 4 L616 18"
      fill="none"
      stroke="#F59E0B"
      strokeWidth="2"
      strokeOpacity="0.75"
    />

    {/* Left emblem shield / reticle */}
    <g transform="translate(24, 28)">
      <polygon
        points="28,0 56,14 56,46 28,64 0,46 0,14"
        fill="#131B24"
        stroke="#F59E0B"
        strokeWidth="2.5"
      />
      <circle cx="28" cy="31" r="14" fill="none" stroke="#EF4444" strokeWidth="2" />
      <line x1="28" y1="11" x2="28" y2="51" stroke="#F59E0B" strokeWidth="2" />
      <line x1="8" y1="31" x2="48" y2="31" stroke="#F59E0B" strokeWidth="2" />
      <circle cx="28" cy="31" r="4" fill="#F59E0B" />
    </g>

    {/* Main Display Typography Lockup */}
    <text
      x="98"
      y="68"
      fill="url(#dzTitleGrad)"
      fontFamily="'Barlow Condensed', sans-serif"
      fontWeight="700"
      fontSize="58"
      letterSpacing="4"
    >
      DEADZONE
    </text>
    <text
      x="362"
      y="68"
      fill="url(#dzAmberGrad)"
      fontFamily="'Barlow Condensed', sans-serif"
      fontWeight="700"
      fontSize="58"
      letterSpacing="4"
    >
      BASTION
    </text>

    {/* Bottom rule & subtitle coordinates */}
    <line x1="98" y1="82" x2="596" y2="82" stroke="#334155" strokeWidth="1.5" />
    <rect x="98" y="80" width="84" height="4" fill="#F59E0B" />
    <text
      x="98"
      y="104"
      fill="#94A3B8"
      fontFamily="'JetBrains Mono', monospace"
      fontWeight="600"
      fontSize="12"
      letterSpacing="3.2"
    >
      OUTPOST PERIMETER DEFENSE SIMULATION
    </text>
  </svg>
);

export const TurretSvgIcon: React.FC<{ type: TurretType; className?: string }> = ({
  type,
  className = 'w-7 h-7',
}) => {
  if (type === 'VULCAN') {
    return (
      <svg viewBox="0 0 36 36" className={className} fill="none">
        <circle cx="15" cy="18" r="10" fill="#1E293B" stroke="#F59E0B" strokeWidth="2" />
        <rect x="18" y="13" width="14" height="3.5" rx="1" fill="#FBBF24" />
        <rect x="18" y="19.5" width="14" height="3.5" rx="1" fill="#FBBF24" />
        <circle cx="15" cy="18" r="4" fill="#F59E0B" />
      </svg>
    );
  }
  if (type === 'CRYO') {
    return (
      <svg viewBox="0 0 36 36" className={className} fill="none">
        <circle cx="15" cy="18" r="10" fill="#0F172A" stroke="#38BDF8" strokeWidth="2" />
        <polygon points="20,12 32,9 32,27 20,24" fill="#38BDF8" />
        <path d="M15 11 V25 M8 18 H22" stroke="#7DD3FC" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'MORTAR') {
    return (
      <svg viewBox="0 0 36 36" className={className} fill="none">
        <rect
          x="6"
          y="8"
          width="20"
          height="20"
          rx="4"
          fill="#1E293B"
          stroke="#F97316"
          strokeWidth="2"
        />
        <rect
          x="14"
          y="12"
          width="17"
          height="12"
          rx="2"
          fill="#090D14"
          stroke="#FB923C"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (type === 'TESLA') {
    return (
      <svg viewBox="0 0 36 36" className={className} fill="none">
        <circle cx="18" cy="18" r="12" stroke="#A855F7" strokeWidth="2" strokeDasharray="4 2" />
        <circle cx="18" cy="18" r="7.5" stroke="#C084FC" strokeWidth="2" />
        <circle cx="18" cy="18" r="3.5" fill="#F3E8FF" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none">
      <rect
        x="5"
        y="11"
        width="16"
        height="14"
        rx="2"
        fill="#0F172A"
        stroke="#10B981"
        strokeWidth="2"
      />
      <rect x="19" y="13" width="15" height="3" fill="#34D399" />
      <rect x="19" y="20" width="15" height="3" fill="#34D399" />
    </svg>
  );
};

export const ScrapIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <polygon
      points="12,2 21,7 21,17 12,22 3,17 3,7"
      fill="#F59E0B"
      fillOpacity="0.2"
      stroke="#F59E0B"
      strokeWidth="2"
    />
    <circle cx="12" cy="12" r="3.5" fill="#FBBF24" />
  </svg>
);

export const BastionShieldIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path
      d="M12 2L4 5.5V11.5C4 16.8 7.4 21.6 12 23C16.6 21.6 20 16.8 20 11.5V5.5L12 2Z"
      fill="#10B981"
      fillOpacity="0.2"
      stroke="#10B981"
      strokeWidth="2"
    />
    <path d="M9 12H15M12 9V15" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

"use client"

export function FlyingFigure({ className = "", size = 40 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden="true">
      {/* Flying figure with laptop/bag - inspired by soaring developer concept */}
      <g>
        {/* Head */}
        <circle cx="65" cy="25" r="10" />
        {/* Flowing hair */}
        <path d="M55 22 Q40 15 35 25 Q42 20 48 23 Q45 18 55 22" />
        <path d="M55 28 Q38 25 30 35 Q42 28 50 30" />
        {/* Body/torso */}
        <path d="M58 33 L72 45 L65 55 L50 48 Z" />
        {/* Cape/coat flowing back */}
        <path d="M50 40 Q35 50 20 65 Q25 55 28 48 Q32 55 25 70 Q40 55 45 45 L50 48 Z" />
        {/* Extended arm reaching forward */}
        <path d="M72 45 Q82 42 88 48 L85 52 Q78 48 70 50" />
        {/* Laptop/bag in hand */}
        <rect x="82" y="46" width="12" height="9" rx="1" />
        <line
          x1="84"
          y1="51"
          x2="92"
          y2="51"
          stroke="currentColor"
          strokeWidth="1"
          className="fill-none stroke-black dark:stroke-black"
        />
        {/* Legs in flight pose */}
        <path d="M58 52 Q50 65 45 78 L48 80 Q55 68 62 58" />
        <path d="M65 55 Q72 68 78 80 L75 82 Q68 70 62 58" />
        {/* Speed lines behind */}
        <line x1="20" y1="30" x2="10" y2="32" strokeWidth="2" stroke="currentColor" opacity="0.4" />
        <line x1="22" y1="40" x2="8" y2="42" strokeWidth="2" stroke="currentColor" opacity="0.3" />
        <line x1="18" y1="50" x2="5" y2="52" strokeWidth="2" stroke="currentColor" opacity="0.2" />
      </g>
    </svg>
  )
}

// Larger decorative version with more detail
export function FlyingFigureLarge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="currentColor" className={className} aria-hidden="true">
      <g>
        {/* Head */}
        <circle cx="130" cy="50" r="18" />
        {/* Flowing hair - more strands */}
        <path d="M112 45 Q85 30 70 50 Q90 35 100 45 Q88 32 112 45" />
        <path d="M110 55 Q75 50 55 75 Q85 55 105 58" />
        <path d="M115 48 Q95 38 80 55 Q95 45 108 50" />
        {/* Body/torso */}
        <path d="M118 65 L145 90 L132 110 L100 95 Z" />
        {/* Cape/coat flowing dramatically */}
        <path d="M100 80 Q65 100 30 140 Q50 110 55 90 Q60 115 45 150 Q80 105 90 88 L100 95 Z" />
        <path d="M95 85 Q70 95 50 120 Q65 100 75 92" opacity="0.7" />
        {/* Extended arm */}
        <path d="M145 90 Q165 82 178 92 L174 100 Q158 92 142 98" />
        {/* Laptop/device */}
        <rect x="168" y="88" width="22" height="16" rx="2" />
        <rect x="171" y="91" width="16" height="10" rx="1" className="fill-black dark:fill-white" opacity="0.3" />
        {/* Legs in dynamic flight */}
        <path d="M115 105 Q100 135 88 165 L94 168 Q108 138 122 112" />
        <path d="M132 110 Q148 142 162 170 L156 174 Q140 145 126 115" />
        {/* Speed lines */}
        <line x1="40" y1="55" x2="15" y2="60" strokeWidth="3" stroke="currentColor" opacity="0.5" />
        <line x1="45" y1="75" x2="12" y2="80" strokeWidth="3" stroke="currentColor" opacity="0.4" />
        <line x1="35" y1="95" x2="5" y2="100" strokeWidth="3" stroke="currentColor" opacity="0.3" />
        <line x1="40" y1="115" x2="10" y2="120" strokeWidth="2" stroke="currentColor" opacity="0.2" />
      </g>
    </svg>
  )
}

// Cityscape silhouette for decorative use
export function Cityscape({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 80"
      fill="currentColor"
      className={className}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {/* London-inspired skyline simplified */}
      {/* Bridge on left */}
      <path d="M0 80 L0 65 Q10 60 20 65 L20 80 M20 68 L40 68 M40 80 L40 65 Q50 60 60 65 L60 80" opacity="0.5" />
      {/* Big Ben */}
      <rect x="70" y="30" width="12" height="50" />
      <polygon points="76,30 70,35 82,35" />
      <rect x="73" y="20" width="6" height="10" />
      <polygon points="76,15 71,20 81,20" />
      {/* Buildings */}
      <rect x="90" y="45" width="20" height="35" />
      <rect x="115" y="35" width="25" height="45" />
      {/* Dome (St Pauls) */}
      <rect x="150" y="50" width="35" height="30" />
      <ellipse cx="167" cy="50" rx="17" ry="12" />
      <rect x="163" y="35" width="8" height="15" />
      <circle cx="167" cy="33" r="4" />
      {/* Modern towers */}
      <polygon points="200,80 200,25 210,15 220,25 220,80" />
      <rect x="230" y="40" width="15" height="40" />
      {/* Gherkin */}
      <ellipse cx="265" cy="50" rx="12" ry="30" />
      {/* More buildings */}
      <rect x="285" y="50" width="20" height="30" />
      <rect x="310" y="45" width="15" height="35" />
      <rect x="330" y="55" width="25" height="25" />
      {/* Eye */}
      <circle cx="375" cy="55" r="20" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="373" y="35" width="4" height="40" />
      <rect x="390" y="70" width="10" height="10" />
    </svg>
  )
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  FastForward,
  Flame,
  Info,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import {
  BastionShieldIcon,
  ScrapIcon,
  TitleLockupSvg,
  TurretSvgIcon,
} from './components/GameIcons';
import {
  SECTOR_MAPS,
  TURRET_BLUEPRINTS,
  TURRET_ORDER,
  WAVE_SCHEDULE,
  ZOMBIE_BLUEPRINTS,
} from './game/constants';
import { GameEngine } from './game/GameEngine';
import { HudSnapshot, TurretType, ZombieType } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  gameState: 'TITLE_MENU',
  sectorId: SECTOR_MAPS[0].id,
  scrap: SECTOR_MAPS[0].startingScrap,
  bastionHp: SECTOR_MAPS[0].bastionMaxHp,
  bastionMaxHp: SECTOR_MAPS[0].bastionMaxHp,
  waveNumber: 1,
  totalWaves: WAVE_SCHEDULE.length,
  waveInProgress: false,
  waveCountdown: 8,
  enemiesRemaining: 0,
  score: 0,
  totalKills: 0,
  gameSpeed: 1,
  selectedBuildType: 'VULCAN',
  selectedPadId: null,
  selectedTurret: null,
  airstrikeCooldown: 0,
  airstrikeMaxCooldown: 32,
  targetingAirstrike: false,
  overclockCooldown: 0,
  overclockMaxCooldown: 26,
  overclockActiveTimer: 0,
  waveAnnouncement: null,
};

const ENEMY_INTEL_LIST: ZombieType[] = [
  'SHAMBLER',
  'SPRINTER',
  'RIOT_BRUTE',
  'SPITTER',
  'BROOD_CARRIER',
  'APEX_JUGGERNAUT',
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.getMuted());
  const [showIntelModal, setShowIntelModal] = useState<boolean>(false);

  useEffect(() => {
    const engine = new GameEngine((snapshot) => {
      setHud(snapshot);
      setIsMuted(soundEngine.getMuted());
    });
    engineRef.current = engine;

    if (canvasRef.current) {
      engine.mount(canvasRef.current);
    }

    return () => {
      engine.unmount();
      engineRef.current = null;
    };
  }, []);

  const handleToggleMute = () => {
    const next = soundEngine.toggleMute();
    setIsMuted(next);
  };

  const currentSector =
    SECTOR_MAPS.find((s) => s.id === hud.sectorId) || SECTOR_MAPS[0];

  const hpRatio = hud.bastionMaxHp > 0 ? hud.bastionHp / hud.bastionMaxHp : 0;
  const hpStateLabel =
    hpRatio > 0.6 ? 'STABLE' : hpRatio > 0.3 ? 'DAMAGED' : 'CRITICAL';

  const activeBlueprint = hud.selectedBuildType
    ? TURRET_BLUEPRINTS[hud.selectedBuildType]
    : TURRET_BLUEPRINTS.VULCAN;

  const inspectedTurret = hud.selectedTurret;
  const inspectedBp = inspectedTurret
    ? TURRET_BLUEPRINTS[inspectedTurret.type]
    : null;
  const inspectedCurrentTier =
    inspectedTurret && inspectedBp
      ? inspectedBp.tiers[inspectedTurret.level - 1]
      : null;
  const inspectedNextTier =
    inspectedTurret && inspectedBp && inspectedTurret.level < 3
      ? inspectedBp.tiers[inspectedTurret.level]
      : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070A0E] select-none">
      {/* Isolated 60fps Canvas Container */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-crosshair"
        />
      </div>

      {/* ====================================================================
          TITLE SCREEN OVERLAY (Live Battle Simulation Visible on Right 45%)
      ==================================================================== */}
      {hud.gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 md:p-12 bg-gradient-to-r from-[#070A0E]/95 via-[#070A0E]/80 to-transparent">
          {/* Top Bar — Mute & Field Intel Controls */}
          <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
            <div className="text-xs font-mono tracking-wider text-slate-400">
              PERIMETER DEFENSE COMMAND · 15-WAVE SURVIVAL
            </div>
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setShowIntelModal(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#131B24] border border-[#263344] rounded hover:border-[#F59E0B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Field Manual</span>
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#131B24] border border-[#263344] rounded hover:border-slate-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{isMuted ? 'Audio Muted' : 'Audio Active'}</span>
              </button>
            </div>
          </div>

          {/* Center-Left Hero Lockup & Sector Selector */}
          <div className="my-auto w-full max-w-6xl mx-auto">
            <div className="max-w-xl pointer-events-auto">
              <TitleLockupSvg />

              <p className="mt-4 text-sm md:text-base text-slate-300 leading-relaxed max-w-lg">
                Fortify tactical roadblocks, interlock cryo and high-voltage killzones,
                and intercept mutating infected waves before the bastion bulkhead breaches.
              </p>

              {/* Sector Selection Strip */}
              <div className="mt-6">
                <div className="text-xs font-mono text-slate-400 mb-2.5">
                  SELECT DEPLOYMENT SECTOR
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {SECTOR_MAPS.map((sec) => {
                    const active = sec.id === hud.sectorId;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => engineRef.current?.selectSector(sec.id)}
                        className={`text-left p-3 rounded border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#172230] border-[#F59E0B] text-white'
                            : 'bg-[#0F1620] border-[#222E3C] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-amber-400">
                          <span>{sec.code}</span>
                          <span>{sec.startingScrap} SCRAP</span>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-100 truncate">
                          {sec.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                          {sec.difficultyLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Start CTA */}
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => engineRef.current?.startNewGame(hud.sectorId)}
                  className="flex items-center gap-3 px-7 py-3.5 bg-[#F59E0B] hover:bg-[#FBBF24] text-[#090D14] font-display font-bold text-xl tracking-wide rounded transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Start Defense</span>
                </button>
                <div className="text-xs font-mono text-slate-400">
                  Press <span className="text-slate-200 font-semibold">Enter</span> or{' '}
                  <span className="text-slate-200 font-semibold">Space</span> to deploy
                </div>
              </div>
            </div>
          </div>

          {/* Flat Single-Line Control Hint Footer */}
          <div className="w-full max-w-6xl mx-auto pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
            <div>
              WASD Move Pad · Space Action / Next Wave · 1–5 Select Turret · U Upgrade · Esc Pause
            </div>
            <div className="text-slate-500">
              LIVE AUTONOMOUS COMBAT PREVIEW · {currentSector.name.toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          ACTIVE PLAY HUD (Perimeter Clusters · >85% Unobstructed Viewport)
      ==================================================================== */}
      {hud.gameState !== 'TITLE_MENU' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 md:p-4">
          {/* TOP PERIMETER BAR */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Status Cluster: Bastion Integrity, Scrap, Wave */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-4 px-4 py-2.5 bg-[#0F151E] border border-[#263344] rounded">
              {/* Bastion HP */}
              <div className="flex items-center gap-2.5">
                <BastionShieldIcon className="w-5 h-5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>BASTION</span>
                    <span>·</span>
                    <span
                      className={
                        hpRatio > 0.6
                          ? 'text-emerald-400'
                          : hpRatio > 0.3
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }
                    >
                      {hpStateLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-24 h-2 bg-[#090D14] rounded-sm overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-transform duration-150 origin-left ${
                          hpRatio > 0.6
                            ? 'bg-emerald-500'
                            : hpRatio > 0.3
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ transform: `scaleX(${Math.max(0, hpRatio)})` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold tabular-nums text-slate-100">
                      {hud.bastionHp}/{hud.bastionMaxHp}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-[#263344]" />

              {/* Scrap Supply */}
              <div className="flex items-center gap-2">
                <ScrapIcon className="w-5 h-5 shrink-0" />
                <div>
                  <div className="text-[11px] font-mono text-slate-400">SCRAP</div>
                  <div className="text-base font-mono font-bold tabular-nums text-amber-400 leading-tight">
                    {hud.scrap}
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-[#263344]" />

              {/* Wave & Hostiles */}
              <div>
                <div className="text-[11px] font-mono text-slate-400">
                  WAVE <span className="text-slate-200 font-bold tabular-nums">{hud.waveNumber}</span>/{hud.totalWaves}
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-300 mt-0.5">
                  {hud.waveInProgress ? (
                    <span>
                      Hostiles: <strong className="text-red-400">{hud.enemiesRemaining}</strong>
                    </span>
                  ) : (
                    <span>
                      Next in: <strong className="text-amber-400">{hud.waveCountdown}s</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden sm:block h-7 w-px bg-[#263344]" />

              {/* Kills & Score */}
              <div className="hidden sm:block">
                <div className="text-[11px] font-mono text-slate-400">ELIMINATIONS</div>
                <div className="text-xs font-mono tabular-nums text-slate-200 mt-0.5">
                  {hud.totalKills} Kills · {hud.score} Pts
                </div>
              </div>
            </div>

            {/* Top-Right Command Cluster: Wave Call, Speed, Intel, Mute, Pause */}
            <div className="pointer-events-auto flex items-center gap-2">
              {!hud.waveInProgress && hud.gameState === 'PLAYING' && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.callNextWaveEarly()}
                  className="flex items-center gap-2 px-3.5 py-2 bg-[#F59E0B] hover:bg-[#FBBF24] text-[#090D14] font-semibold text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {hud.waveNumber === 1 && hud.totalKills === 0
                      ? 'Start Wave 1 [Space]'
                      : `Call Wave Early (+${Math.max(10, hud.waveCountdown * 4)} Scrap)`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => engineRef.current?.toggleGameSpeed()}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  hud.gameSpeed === 2
                    ? 'bg-[#1E293B] border-[#F59E0B] text-[#F59E0B]'
                    : 'bg-[#0F151E] border-[#263344] text-slate-300 hover:border-slate-500'
                }`}
                title="Toggle Simulation Speed [F]"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span className="tabular-nums">{hud.gameSpeed}x</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setShowIntelModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0F151E] border border-[#263344] text-slate-300 hover:border-slate-500 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Field Manual & Enemy Telegraphs"
              >
                <Info className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span className="hidden md:inline">Intel</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                className="p-2 bg-[#0F151E] border border-[#263344] text-slate-300 hover:border-slate-500 rounded transition-colors cursor-pointer"
                title="Toggle Audio [M]"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0F151E] border border-[#263344] text-slate-200 hover:border-slate-500 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Pause Game [Esc]"
              >
                <Pause className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pause</span>
              </button>
            </div>
          </div>

          {/* CENTER WAVE BANNER CALLOUT (Non-Interactive, Ephemeral) */}
          {hud.waveAnnouncement && (
            <div className="mx-auto my-auto pointer-events-none text-center px-6 py-3 bg-[#090D14]/90 border border-[#263344] rounded">
              <div className="font-display font-bold text-2xl tracking-wider text-amber-400">
                {hud.waveAnnouncement.title}
              </div>
              <div className="text-xs font-mono text-slate-300 mt-0.5">
                {hud.waveAnnouncement.subtitle}
              </div>
            </div>
          )}

          {/* BOTTOM TACTICAL DOCK: Turret Arsenal + Abilities + Contextual Inspector */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3">
            {/* Left/Center Dock: 5 Turrets + 2 Commander Abilities */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-2 bg-[#0F151E] border border-[#263344] rounded">
              {TURRET_ORDER.map((tType) => {
                const bp = TURRET_BLUEPRINTS[tType];
                const isSelected = hud.selectedBuildType === tType && !hud.targetingAirstrike;
                const canAfford = hud.scrap >= bp.baseCost;

                return (
                  <button
                    key={tType}
                    type="button"
                    onClick={() => engineRef.current?.setSelectedBuildType(tType)}
                    className={`group flex items-center gap-2.5 px-3 py-2 rounded border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#182332] border-[#F59E0B]'
                        : 'bg-[#121A24] border-[#222F3E] hover:border-slate-500'
                    }`}
                  >
                    <div className="relative">
                      <TurretSvgIcon type={tType} className="w-8 h-8 shrink-0" />
                      <span className="absolute -top-1 -left-1 px-1 text-[10px] font-mono font-bold bg-[#090D14] text-slate-300 border border-slate-700 rounded-xs">
                        {bp.hotkey}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-100 whitespace-nowrap">
                        {bp.name}
                      </div>
                      <div
                        className={`text-xs font-mono font-bold tabular-nums ${
                          canAfford ? 'text-amber-400' : 'text-red-400'
                        }`}
                      >
                        {bp.baseCost} Scrap
                      </div>
                    </div>
                  </button>
                );
              })}

              <div className="h-9 w-px bg-[#263344] mx-1 hidden sm:block" />

              {/* Commander Tactical Ability 1: Airstrike [Q] */}
              <button
                type="button"
                onClick={() => engineRef.current?.armAirstrike()}
                disabled={hud.airstrikeCooldown > 0}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-colors cursor-pointer ${
                  hud.targetingAirstrike
                    ? 'bg-red-950/80 border-red-500 text-red-200'
                    : hud.airstrikeCooldown > 0
                    ? 'bg-[#111720] border-[#1E293B] text-slate-500 cursor-not-allowed'
                    : 'bg-[#141D28] border-[#263344] hover:border-red-400 text-slate-200'
                }`}
                title="Carpet-bomb target coordinates [Q]"
              >
                <Flame
                  className={`w-5 h-5 shrink-0 ${
                    hud.airstrikeCooldown > 0 ? 'text-slate-600' : 'text-red-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold whitespace-nowrap">
                    Airstrike <span className="font-mono text-[10px] text-slate-400">[Q]</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400">
                    {hud.targetingAirstrike
                      ? 'CLICK MAP'
                      : hud.airstrikeCooldown > 0
                      ? `${hud.airstrikeCooldown}s CD`
                      : 'READY'}
                  </div>
                </div>
              </button>

              {/* Commander Tactical Ability 2: Overclock [E] */}
              <button
                type="button"
                onClick={() => engineRef.current?.triggerOverclock()}
                disabled={hud.overclockCooldown > 0}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-colors cursor-pointer ${
                  hud.overclockActiveTimer > 0
                    ? 'bg-amber-950/70 border-amber-400 text-amber-200'
                    : hud.overclockCooldown > 0
                    ? 'bg-[#111720] border-[#1E293B] text-slate-500 cursor-not-allowed'
                    : 'bg-[#141D28] border-[#263344] hover:border-amber-400 text-slate-200'
                }`}
                title="Boost all turret fire rates by +60% for 8s and purge acid/stun [E]"
              >
                <Zap
                  className={`w-5 h-5 shrink-0 ${
                    hud.overclockCooldown > 0 && hud.overclockActiveTimer === 0
                      ? 'text-slate-600'
                      : 'text-amber-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold whitespace-nowrap">
                    Overclock <span className="font-mono text-[10px] text-slate-400">[E]</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-400">
                    {hud.overclockActiveTimer > 0
                      ? `ACTIVE ${hud.overclockActiveTimer}s`
                      : hud.overclockCooldown > 0
                      ? `${hud.overclockCooldown}s CD`
                      : 'READY'}
                  </div>
                </div>
              </button>
            </div>

            {/* Right Contextual Inspector Panel (Selected Turret OR Selected Empty Pad Blueprint) */}
            <div className="pointer-events-auto flex items-center justify-between gap-4 px-4 py-2.5 bg-[#0F151E] border border-[#263344] rounded min-w-[320px] max-w-xl">
              {inspectedTurret && inspectedBp && inspectedCurrentTier ? (
                <>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <span className="truncate">{inspectedCurrentTier.name}</span>
                      <span className="text-slate-500">·</span>
                      <span className="font-mono text-amber-400 tabular-nums">
                        {inspectedTurret.kills} Kills
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                      DMG {inspectedCurrentTier.damage} · ROF {inspectedCurrentTier.fireRate}/s · RNG{' '}
                      {inspectedCurrentTier.range}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => engineRef.current?.cycleSelectedTurretPriority()}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono bg-[#16202C] hover:bg-[#1E293B] text-sky-300 border border-[#29384B] rounded whitespace-nowrap shrink-0 cursor-pointer"
                      title="Cycle Targeting Priority [T]"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>{inspectedTurret.priority} [T]</span>
                    </button>

                    {inspectedNextTier ? (
                      <button
                        type="button"
                        onClick={() => engineRef.current?.upgradeSelectedTurret()}
                        disabled={hud.scrap < inspectedCurrentTier.upgradeCost}
                        className={`px-3 py-1.5 text-xs font-mono font-bold rounded whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          hud.scrap >= inspectedCurrentTier.upgradeCost
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-[#090D14]'
                            : 'bg-[#18222F] text-slate-500 border border-slate-800 cursor-not-allowed'
                        }`}
                      >
                        Upgrade {inspectedCurrentTier.upgradeCost} [U]
                      </button>
                    ) : (
                      <span className="px-2.5 py-1.5 text-xs font-mono text-emerald-400">
                        MAX TIER
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => engineRef.current?.sellSelectedTurret()}
                      className="px-2.5 py-1.5 text-xs font-mono text-red-300 bg-[#1B161E] hover:bg-red-950/60 border border-red-900/50 rounded whitespace-nowrap shrink-0 cursor-pointer"
                      title="Salvage Turret for 75% Scrap [X]"
                    >
                      Sell +{Math.round(inspectedTurret.totalInvested * 0.75)} [X]
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                      <span>{activeBlueprint.name}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400 font-normal truncate">
                        {activeBlueprint.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {activeBlueprint.tiers[0].description}
                    </div>
                  </div>

                  {hud.selectedPadId && (
                    <button
                      type="button"
                      onClick={() =>
                        engineRef.current?.buildTurretOnPad(
                          hud.selectedPadId!,
                          activeBlueprint.type
                        )
                      }
                      disabled={hud.scrap < activeBlueprint.baseCost}
                      className={`px-3.5 py-2 text-xs font-mono font-bold rounded whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        hud.scrap >= activeBlueprint.baseCost
                          ? 'bg-[#F59E0B] hover:bg-[#FBBF24] text-[#090D14]'
                          : 'bg-[#18222F] text-slate-500 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      Build {activeBlueprint.baseCost} [Enter]
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          PAUSE / VICTORY / GAME OVER MODAL
      ==================================================================== */}
      {(hud.gameState === 'PAUSED' ||
        hud.gameState === 'VICTORY' ||
        hud.gameState === 'GAME_OVER') && (
        <div className="absolute inset-0 bg-[#070A0E]/85 flex items-center justify-center p-4 z-30">
          <div className="w-full max-w-md bg-[#0F151E] border border-[#263344] rounded-md p-6 shadow-2xl">
            <div className="text-xs font-mono text-slate-400">
              {currentSector.code} · {currentSector.name.toUpperCase()}
            </div>

            <h2 className="mt-1 font-display font-bold text-3xl tracking-wide text-white">
              {hud.gameState === 'PAUSED'
                ? 'DEFENSE PAUSED'
                : hud.gameState === 'VICTORY'
                ? 'SECTOR SECURED — VICTORY'
                : 'BASTION BREACHED — DEFEAT'}
            </h2>

            <p className="mt-2 text-sm text-slate-300">
              {hud.gameState === 'PAUSED'
                ? 'Tactical simulation holding. Inspect emplacements or resume wave operations.'
                : hud.gameState === 'VICTORY'
                ? 'All 15 infected assault waves and Apex Juggernauts have been neutralized.'
                : 'The infected horde overwhelmed the inner bulkhead. Reconfigure turret crossfire and try again.'}
            </p>

            {/* Combat Telemetry Summary */}
            <div className="mt-5 grid grid-cols-3 gap-2.5 p-3 bg-[#090D14] border border-[#1E293B] rounded">
              <div>
                <div className="text-[11px] font-mono text-slate-400">WAVE REACHED</div>
                <div className="text-lg font-mono font-bold tabular-nums text-white">
                  {hud.waveNumber}/{hud.totalWaves}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-slate-400">HOSTILES KILLED</div>
                <div className="text-lg font-mono font-bold tabular-nums text-amber-400">
                  {hud.totalKills}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-slate-400">FINAL SCORE</div>
                <div className="text-lg font-mono font-bold tabular-nums text-emerald-400">
                  {hud.score}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {hud.gameState === 'PAUSED' && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.togglePause()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F59E0B] hover:bg-[#FBBF24] text-[#090D14] font-semibold text-sm rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Defense</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => engineRef.current?.startNewGame(hud.sectorId)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 font-semibold text-sm rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  hud.gameState === 'PAUSED'
                    ? 'bg-[#16202C] hover:bg-[#1E293B] text-slate-200 border border-[#29384B]'
                    : 'bg-[#F59E0B] hover:bg-[#FBBF24] text-[#090D14]'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>{hud.gameState === 'PAUSED' ? 'Restart Sector' : 'Play Again'}</span>
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="px-4 py-2.5 bg-[#131B24] hover:bg-[#1A2532] text-slate-300 border border-[#263344] text-sm font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          FIELD MANUAL & ENEMY TELEGRAPH MODAL
      ==================================================================== */}
      {showIntelModal && (
        <div className="absolute inset-0 bg-[#070A0E]/85 flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-2xl bg-[#0F151E] border border-[#263344] rounded-md p-6 shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#263344]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#F59E0B]" />
                <h3 className="font-display font-bold text-2xl tracking-wide text-white">
                  TACTICAL FIELD MANUAL — THREAT TELEGRAPHS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIntelModal(false)}
                className="px-3 py-1 text-xs font-mono bg-[#18222F] hover:bg-[#223042] text-slate-200 rounded cursor-pointer"
              >
                Close [Esc]
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ENEMY_INTEL_LIST.map((zType) => {
                const zb = ZOMBIE_BLUEPRINTS[zType];
                return (
                  <div
                    key={zType}
                    className="p-3 bg-[#090D14] border border-[#1E293B] rounded flex items-start gap-3"
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 mt-1 border"
                      style={{
                        backgroundColor: zb.bodyColor,
                        borderColor: zb.accentColor,
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <span>{zb.name}</span>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono text-amber-400 tabular-nums">
                          HP {zb.hp}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                        {zb.summary}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-[#263344] flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <span>TIP: Cryo Emitters make targets Brittle (+25% damage from all turrets).</span>
              <button
                type="button"
                onClick={() => setShowIntelModal(false)}
                className="px-4 py-2 bg-[#F59E0B] text-[#090D14] font-sans font-semibold rounded cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

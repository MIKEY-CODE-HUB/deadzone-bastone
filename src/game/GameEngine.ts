import { soundEngine } from '../audio/soundEngine';
import {
  SECTOR_MAPS,
  TURRET_BLUEPRINTS,
  TURRET_ORDER,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
  WAVE_SCHEDULE,
  ZOMBIE_BLUEPRINTS,
} from './constants';
import { renderGameWorld, screenToWorld } from './renderer';
import {
  FloatingText,
  GameState,
  GroundDecal,
  HudSnapshot,
  LightningBeam,
  Particle,
  Projectile,
  SectorMap,
  TargetingPriority,
  TurretInstance,
  TurretType,
  Vec2,
  ZombieInstance,
  ZombieType,
} from './types';

interface SpawnTask {
  type: ZombieType;
  laneIndex: number;
  spawnAtWaveTime: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private lastTimestamp: number = 0;

  // Game State
  private gameState: GameState = 'TITLE_MENU';
  private currentMap: SectorMap = SECTOR_MAPS[0];
  private scrap: number = 320;
  private bastionHp: number = 20;
  private bastionMaxHp: number = 20;
  private waveNumber: number = 0;
  private waveInProgress: boolean = false;
  private waveElapsed: number = 0;
  private waveCountdown: number = 12;
  private pendingSpawns: SpawnTask[] = [];
  private score: number = 0;
  private totalKills: number = 0;
  private gameSpeed: 1 | 2 = 1;

  // Entities
  private turrets: TurretInstance[] = [];
  private zombies: ZombieInstance[] = [];
  private projectiles: Projectile[] = [];
  private beams: LightningBeam[] = [];
  private particles: Particle[] = [];
  private decals: GroundDecal[] = [];
  private floatingTexts: FloatingText[] = [];

  // Selection & Abilities
  private selectedBuildType: TurretType | null = 'VULCAN';
  private hoveredPadId: string | null = null;
  private selectedPadId: string | null = null;
  private mouseWorld: Vec2 = { x: VIRTUAL_WIDTH * 0.5, y: VIRTUAL_HEIGHT * 0.5 };

  private airstrikeCooldown: number = 0;
  private readonly airstrikeMaxCooldown: number = 32;
  private targetingAirstrike: boolean = false;
  private pendingAirstrikeBombs: { x: number; y: number; delay: number }[] = [];

  private overclockCooldown: number = 0;
  private readonly overclockMaxCooldown: number = 26;
  private overclockActiveTimer: number = 0;

  // Game Feel: Hitstop & Camera Shake
  private hitstopTimer: number = 0;
  private shakeIntensity: number = 0;
  private simTime: number = 0;
  private demoSpawnTimer: number = 0;

  private waveAnnouncement: { title: string; subtitle: string; timer: number } | null = null;

  // Input Tracking (Held vs JustPressed)
  private heldKeys: Set<string> = new Set();
  private justPressedKeys: Set<string> = new Set();

  // HUD Subscription
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private hudSyncAccumulator: number = 0;
  private idCounter: number = 1;

  constructor(onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.onHudUpdate = onHudUpdate;
    this.setupTitleDemo();
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter}`;
  }

  public mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.handleResize();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });

    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
    this.emitHudSnapshot();
  }

  public unmount() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    }
  }

  private handleResize = () => {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
  };

  private handleWindowBlur = () => {
    this.heldKeys.clear();
    this.justPressedKeys.clear();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (!this.heldKeys.has(code)) {
      this.justPressedKeys.add(code);
    }
    this.heldKeys.add(code);

    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      if (document.activeElement === document.body) {
        e.preventDefault();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouseWorld = screenToWorld(e.clientX, e.clientY, rect);
    this.updateHoveredPad();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouseWorld = screenToWorld(e.clientX, e.clientY, rect);
    this.updateHoveredPad();
    this.handlePrimaryCanvasAction();
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.mouseWorld = screenToWorld(touch.clientX, touch.clientY, rect);
    this.updateHoveredPad();
    this.handlePrimaryCanvasAction();
  };

  private updateHoveredPad() {
    let closestId: string | null = null;
    let bestDist = 30;
    for (const pad of this.currentMap.pads) {
      const dist = Math.hypot(this.mouseWorld.x - pad.x, this.mouseWorld.y - pad.y);
      if (dist <= bestDist) {
        bestDist = dist;
        closestId = pad.id;
      }
    }
    this.hoveredPadId = closestId;
  }

  private handlePrimaryCanvasAction() {
    if (this.gameState !== 'PLAYING') return;

    // 1. Check if deploying tactical Airstrike
    if (this.targetingAirstrike) {
      this.triggerAirstrikeAt(this.mouseWorld.x, this.mouseWorld.y);
      return;
    }

    // 2. Check if clicking a Build Pad
    if (this.hoveredPadId) {
      const clickedPadId = this.hoveredPadId;
      const existingTurret = this.turrets.find((t) => t.padId === clickedPadId);

      if (existingTurret) {
        this.selectedPadId = clickedPadId;
        soundEngine.playUiClick();
        this.emitHudSnapshot();
        return;
      }

      // Empty pad: select it, and if a build turret is active & affordable, build immediately!
      this.selectedPadId = clickedPadId;
      if (this.selectedBuildType) {
        this.buildTurretOnPad(clickedPadId, this.selectedBuildType);
      } else {
        soundEngine.playUiClick();
        this.emitHudSnapshot();
      }
      return;
    }

    // Clicked open ground: deselect pad
    this.selectedPadId = null;
    this.emitHudSnapshot();
  }

  // ============================================================================
  // PUBLIC COMMANDS FOR UI & KEYBOARD
  // ============================================================================

  public selectSector(sectorId: string) {
    const found = SECTOR_MAPS.find((m) => m.id === sectorId);
    if (found) {
      this.currentMap = found;
      if (this.gameState === 'TITLE_MENU') {
        this.setupTitleDemo();
      }
      this.emitHudSnapshot();
    }
  }

  public startNewGame(sectorId?: string) {
    if (sectorId) {
      const found = SECTOR_MAPS.find((m) => m.id === sectorId);
      if (found) this.currentMap = found;
    }
    this.resetWorldState();
    this.gameState = 'PLAYING';
    this.waveNumber = 0;
    this.waveInProgress = false;
    this.waveCountdown = 8.0;
    this.selectedBuildType = 'VULCAN';
    this.selectedPadId = this.currentMap.pads[0]?.id || null;
    this.waveAnnouncement = {
      title: `${this.currentMap.code}: ${this.currentMap.name}`,
      subtitle: 'Deploy turrets on tactical sockets before Wave 1 arrives',
      timer: 3.5,
    };
    soundEngine.playUiClick();
    this.emitHudSnapshot();
  }

  public returnToTitle() {
    this.gameState = 'TITLE_MENU';
    this.setupTitleDemo();
    this.emitHudSnapshot();
  }

  public togglePause() {
    if (this.gameState === 'PLAYING') {
      this.gameState = 'PAUSED';
      soundEngine.playUiClick();
      this.emitHudSnapshot();
    } else if (this.gameState === 'PAUSED') {
      this.gameState = 'PLAYING';
      soundEngine.playUiClick();
      this.emitHudSnapshot();
    }
  }

  public toggleGameSpeed() {
    this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
    soundEngine.playUiClick();
    this.emitHudSnapshot();
  }

  public setSelectedBuildType(type: TurretType | null) {
    this.selectedBuildType = type;
    this.targetingAirstrike = false;
    soundEngine.playUiClick();

    // If an empty pad is already selected via keyboard/mouse, let user build on it
    this.emitHudSnapshot();
  }

  public buildTurretOnPad(padId: string, type: TurretType): boolean {
    if (this.gameState !== 'PLAYING') return false;
    const pad = this.currentMap.pads.find((p) => p.id === padId);
    if (!pad) return false;
    if (this.turrets.some((t) => t.padId === padId)) return false;

    const bp = TURRET_BLUEPRINTS[type];
    if (this.scrap < bp.baseCost) {
      this.spawnFloatingText(pad.x, pad.y - 18, 'INSUFFICIENT SCRAP', '#EF4444', true);
      return false;
    }

    this.scrap -= bp.baseCost;
    const newTurret: TurretInstance = {
      id: this.nextId('turret'),
      padId: pad.id,
      type,
      x: pad.x,
      y: pad.y,
      level: 1,
      totalInvested: bp.baseCost,
      angle: 0,
      targetAngle: 0,
      cooldown: 0.1,
      recoil: 0,
      scaleAnim: 1.32,
      priority: type === 'RAILGUN' || type === 'TESLA' ? 'STRONGEST' : 'FIRST',
      kills: 0,
      totalDamage: 0,
      corrodedTimer: 0,
      stunnedTimer: 0,
      chargeProgress: 0,
      lockedTargetId: null,
    };

    this.turrets.push(newTurret);
    this.selectedPadId = pad.id;
    soundEngine.playTurretBuild();
    this.spawnBurstParticles(pad.x, pad.y, bp.accentColor, 10, 'SPARK');
    this.emitHudSnapshot();
    return true;
  }

  public upgradeSelectedTurret(): boolean {
    if (this.gameState !== 'PLAYING' || !this.selectedPadId) return false;
    const turret = this.turrets.find((t) => t.padId === this.selectedPadId);
    if (!turret || turret.level >= 3) return false;

    const bp = TURRET_BLUEPRINTS[turret.type];
    const currentTier = bp.tiers[turret.level - 1];
    const cost = currentTier.upgradeCost;

    if (this.scrap < cost) {
      this.spawnFloatingText(turret.x, turret.y - 20, 'NEED MORE SCRAP', '#EF4444', true);
      return false;
    }

    this.scrap -= cost;
    turret.level = (turret.level + 1) as 2 | 3;
    turret.totalInvested += cost;
    turret.scaleAnim = 1.35;
    turret.corrodedTimer = 0;

    soundEngine.playTurretUpgrade();
    this.spawnBurstParticles(turret.x, turret.y, bp.accentColor, 16, 'SPARK');
    this.spawnFloatingText(turret.x, turret.y - 24, `MK.${turret.level} UPGRADED`, bp.accentColor, true);
    this.emitHudSnapshot();
    return true;
  }

  public sellSelectedTurret(): boolean {
    if (this.gameState !== 'PLAYING' || !this.selectedPadId) return false;
    const idx = this.turrets.findIndex((t) => t.padId === this.selectedPadId);
    if (idx === -1) return false;

    const turret = this.turrets[idx];
    const refund = Math.round(turret.totalInvested * 0.75);
    this.scrap += refund;
    this.turrets.splice(idx, 1);

    soundEngine.playTurretSell();
    this.spawnFloatingText(turret.x, turret.y - 18, `+${refund} SCRAP`, '#F59E0B', true);
    this.spawnBurstParticles(turret.x, turret.y, '#94A3B8', 10, 'SPARK');
    this.emitHudSnapshot();
    return true;
  }

  public cycleSelectedTurretPriority() {
    if (this.gameState !== 'PLAYING' || !this.selectedPadId) return;
    const turret = this.turrets.find((t) => t.padId === this.selectedPadId);
    if (!turret) return;

    const order: TargetingPriority[] = ['FIRST', 'STRONGEST', 'WEAKEST', 'CLOSEST'];
    const nextIdx = (order.indexOf(turret.priority) + 1) % order.length;
    turret.priority = order[nextIdx];
    soundEngine.playUiClick();
    this.spawnFloatingText(turret.x, turret.y - 22, `TARGET: ${turret.priority}`, '#38BDF8', false);
    this.emitHudSnapshot();
  }

  public armAirstrike() {
    if (this.gameState !== 'PLAYING') return;
    if (this.airstrikeCooldown > 0) return;
    this.targetingAirstrike = !this.targetingAirstrike;
    soundEngine.playUiClick();
    this.emitHudSnapshot();
  }

  public triggerAirstrikeAt(x: number, y: number) {
    if (this.airstrikeCooldown > 0) return;
    this.targetingAirstrike = false;
    this.airstrikeCooldown = this.airstrikeMaxCooldown;

    // Queue 5 staggered heavy carpet bombs around target point
    const offsets = [
      { dx: -75, dy: -20, delay: 0.1 },
      { dx: -35, dy: 15, delay: 0.24 },
      { dx: 0, dy: 0, delay: 0.38 },
      { dx: 40, dy: -15, delay: 0.52 },
      { dx: 80, dy: 18, delay: 0.66 },
    ];
    for (const o of offsets) {
      this.pendingAirstrikeBombs.push({
        x: x + o.dx,
        y: y + o.dy,
        delay: o.delay,
      });
    }
    this.spawnFloatingText(x, y - 28, 'AIRSTRIKE INBOUND', '#EF4444', true);
    this.emitHudSnapshot();
  }

  public triggerOverclock() {
    if (this.gameState !== 'PLAYING') return;
    if (this.overclockCooldown > 0) return;
    this.overclockCooldown = this.overclockMaxCooldown;
    this.overclockActiveTimer = 8.0;
    soundEngine.playTurretUpgrade();
    for (const t of this.turrets) {
      t.corrodedTimer = 0;
      t.stunnedTimer = 0;
      this.spawnBurstParticles(t.x, t.y, '#F59E0B', 8, 'SPARK');
    }
    this.emitHudSnapshot();
  }

  public callNextWaveEarly() {
    if (this.gameState !== 'PLAYING') return;
    if (this.waveInProgress && this.pendingSpawns.length > 0) return;
    if (this.waveNumber >= WAVE_SCHEDULE.length) return;

    // Grant early call bonus scrap if countdown was active
    if (!this.waveInProgress && this.waveCountdown > 1 && this.waveNumber > 0) {
      const earlyBonus = Math.max(10, Math.round(this.waveCountdown * 4));
      this.scrap += earlyBonus;
      this.spawnFloatingText(
        VIRTUAL_WIDTH * 0.5,
        90,
        `EARLY WAVE BONUS +${earlyBonus} SCRAP`,
        '#F59E0B',
        true
      );
    }

    this.startNextWave();
  }

  // ============================================================================
  // INTERNAL SETUP & WAVE MANAGEMENT
  // ============================================================================

  private resetWorldState() {
    this.scrap = this.currentMap.startingScrap;
    this.bastionHp = this.currentMap.bastionMaxHp;
    this.bastionMaxHp = this.currentMap.bastionMaxHp;
    this.turrets = [];
    this.zombies = [];
    this.projectiles = [];
    this.beams = [];
    this.particles = [];
    this.decals = [];
    this.floatingTexts = [];
    this.pendingSpawns = [];
    this.pendingAirstrikeBombs = [];
    this.score = 0;
    this.totalKills = 0;
    this.airstrikeCooldown = 0;
    this.overclockCooldown = 0;
    this.overclockActiveTimer = 0;
    this.targetingAirstrike = false;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;
  }

  private setupTitleDemo() {
    this.resetWorldState();
    // Place an exciting autonomous outpost defense formation for the live background canvas
    const pads = this.currentMap.pads;
    const demoLoadout: { idx: number; type: TurretType; level: 1 | 2 | 3 }[] = [
      { idx: 1, type: 'VULCAN', level: 2 },
      { idx: 2, type: 'CRYO', level: 2 },
      { idx: 3, type: 'MORTAR', level: 2 },
      { idx: 5, type: 'TESLA', level: 2 },
      { idx: 8, type: 'RAILGUN', level: 3 },
      { idx: 9, type: 'VULCAN', level: 3 },
    ];
    for (const item of demoLoadout) {
      const pad = pads[item.idx];
      if (!pad) continue;
      this.turrets.push({
        id: this.nextId('demo_turret'),
        padId: pad.id,
        type: item.type,
        x: pad.x,
        y: pad.y,
        level: item.level,
        totalInvested: 300,
        angle: 0,
        targetAngle: 0,
        cooldown: Math.random() * 0.5,
        recoil: 0,
        scaleAnim: 1,
        priority: 'FIRST',
        kills: 0,
        totalDamage: 0,
        corrodedTimer: 0,
        stunnedTimer: 0,
        chargeProgress: 0,
        lockedTargetId: null,
      });
    }
    // Spawn a few initial zombies along the lane so the Title Screen has instant action
    this.spawnZombie('SHAMBLER', 0, 1.0);
    this.spawnZombie('SPRINTER', 0, 1.0);
    this.spawnZombie('RIOT_BRUTE', 0, 1.0);
  }

  private startNextWave() {
    if (this.waveNumber >= WAVE_SCHEDULE.length) return;
    this.waveNumber += 1;
    const waveDef = WAVE_SCHEDULE[this.waveNumber - 1];
    this.waveInProgress = true;
    this.waveElapsed = 0;
    this.pendingSpawns = [];

    const laneCount = this.currentMap.lanes.length;
    let cursorTime = 0.5;
    let spawnCounter = 0;

    for (const group of waveDef.groups) {
      cursorTime += group.delayBefore;
      for (let i = 0; i < group.count; i++) {
        const laneIndex =
          group.laneIndex !== undefined ? group.laneIndex % laneCount : spawnCounter % laneCount;
        this.pendingSpawns.push({
          type: group.type,
          laneIndex,
          spawnAtWaveTime: cursorTime + i * group.interval,
        });
        spawnCounter++;
      }
      cursorTime += group.count * group.interval * 0.55;
    }

    this.pendingSpawns.sort((a, b) => a.spawnAtWaveTime - b.spawnAtWaveTime);

    this.waveAnnouncement = {
      title: `WAVE ${String(this.waveNumber).padStart(2, '0')} — ${waveDef.title.toUpperCase()}`,
      subtitle: waveDef.threatNote,
      timer: 3.4,
    };

    soundEngine.playWaveHorn();
    this.emitHudSnapshot();
  }

  private spawnZombie(type: ZombieType, laneIndex: number, hpMultiplier = 1.0, customPos?: Vec2, waypointIdx = 1) {
    const bp = ZOMBIE_BLUEPRINTS[type];
    const lane = this.currentMap.lanes[laneIndex % this.currentMap.lanes.length];
    const startPos = customPos || lane[0];
    const jitterY = customPos ? 0 : (Math.random() - 0.5) * 20;

    // Smooth wave HP scaling
    const scaledHp = Math.round(bp.hp * hpMultiplier);

    const zombie: ZombieInstance = {
      id: this.nextId('z'),
      type,
      laneIndex: laneIndex % this.currentMap.lanes.length,
      waypointIndex: waypointIdx,
      x: startPos.x,
      y: startPos.y + jitterY,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: scaledHp,
      maxHp: scaledHp,
      armor: bp.armor,
      baseSpeed: bp.speed * (0.94 + Math.random() * 0.12),
      radius: bp.radius,
      scrapReward: bp.scrap,
      breachDamage: bp.breachDamage,
      distanceTraveled: 0,
      gaitPhase: Math.random() * Math.PI * 2,
      hitFlashTimer: 0,
      slowTimer: 0,
      slowAmount: 0,
      brittleTimer: 0,
      abilityCooldown: 2.2 + Math.random() * 2.0,
      windupTimer: 0,
      windupMax: 0.8,
      windupType: 'NONE',
      sprintBoostTimer: 0,
      isBoss: type === 'APEX_JUGGERNAUT',
    };

    this.zombies.push(zombie);
  }

  // ============================================================================
  // MAIN 60FPS GAME LOOP
  // ============================================================================

  private loop = (timestamp: number) => {
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Mandatory clamp to 0.05s to prevent tunneling on tab switch
    const clampedDt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.processEdgeInputs();

    if (this.gameState === 'PLAYING' || this.gameState === 'TITLE_MENU') {
      const speedMult = this.gameState === 'PLAYING' ? this.gameSpeed : 1;
      const effectiveDt = clampedDt * speedMult;

      // Hitstop pauses simulation entities briefly on heavy impacts while keeping shake active
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - clampedDt);
        this.shakeIntensity = Math.max(0, this.shakeIntensity - clampedDt * 28);
      } else {
        this.updateSimulation(effectiveDt);
      }
    }

    this.justPressedKeys.clear();
    this.renderFrame();

    this.hudSyncAccumulator += clampedDt;
    if (this.hudSyncAccumulator >= 0.08) {
      this.hudSyncAccumulator = 0;
      this.emitHudSnapshot();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private processEdgeInputs() {
    if (this.justPressedKeys.size === 0) return;

    // Title / Game Over / Victory start shortcut
    if (this.gameState === 'TITLE_MENU') {
      if (this.justPressedKeys.has('Space') || this.justPressedKeys.has('Enter')) {
        this.startNewGame();
        return;
      }
    }

    if (this.gameState === 'GAME_OVER' || this.gameState === 'VICTORY') {
      if (this.justPressedKeys.has('Space') || this.justPressedKeys.has('Enter')) {
        this.startNewGame();
        return;
      }
    }

    if (this.justPressedKeys.has('Escape')) {
      if (this.targetingAirstrike) {
        this.targetingAirstrike = false;
        this.emitHudSnapshot();
      } else if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') {
        this.togglePause();
      }
      return;
    }

    if (this.justPressedKeys.has('KeyM')) {
      soundEngine.toggleMute();
      this.emitHudSnapshot();
    }

    if (this.gameState !== 'PLAYING') return;

    // Hotkeys 1-5 for Turret Selection
    const hotkeyMap: Record<string, TurretType> = {
      Digit1: 'VULCAN',
      Digit2: 'CRYO',
      Digit3: 'MORTAR',
      Digit4: 'TESLA',
      Digit5: 'RAILGUN',
    };

    for (const [code, tType] of Object.entries(hotkeyMap)) {
      if (this.justPressedKeys.has(code)) {
        this.setSelectedBuildType(tType);
        // If an empty pad is currently selected, build on it if pressed twice or with Enter
      }
    }

    // WASD / Arrow Keys pad navigation so keyboard-only play is effortless
    if (
      this.justPressedKeys.has('KeyW') ||
      this.justPressedKeys.has('ArrowUp') ||
      this.justPressedKeys.has('KeyS') ||
      this.justPressedKeys.has('ArrowDown') ||
      this.justPressedKeys.has('KeyA') ||
      this.justPressedKeys.has('ArrowLeft') ||
      this.justPressedKeys.has('KeyD') ||
      this.justPressedKeys.has('ArrowRight')
    ) {
      this.navigatePadByDirection(
        this.justPressedKeys.has('KeyD') || this.justPressedKeys.has('ArrowRight')
          ? 1
          : this.justPressedKeys.has('KeyA') || this.justPressedKeys.has('ArrowLeft')
          ? -1
          : 0,
        this.justPressedKeys.has('KeyS') || this.justPressedKeys.has('ArrowDown')
          ? 1
          : this.justPressedKeys.has('KeyW') || this.justPressedKeys.has('ArrowUp')
          ? -1
          : 0
      );
    }

    if (this.justPressedKeys.has('KeyU')) {
      this.upgradeSelectedTurret();
    }
    if (this.justPressedKeys.has('KeyX') || this.justPressedKeys.has('Backspace')) {
      this.sellSelectedTurret();
    }
    if (this.justPressedKeys.has('KeyT')) {
      this.cycleSelectedTurretPriority();
    }
    if (this.justPressedKeys.has('KeyQ')) {
      this.armAirstrike();
    }
    if (this.justPressedKeys.has('KeyE')) {
      this.triggerOverclock();
    }
    if (this.justPressedKeys.has('KeyF')) {
      this.toggleGameSpeed();
    }
    if (this.justPressedKeys.has('Space')) {
      // If selected pad is empty and we have enough scrap, Space can either launch wave or build
      if (!this.waveInProgress) {
        this.callNextWaveEarly();
      } else if (this.selectedPadId && this.selectedBuildType) {
        const occupied = this.turrets.some((t) => t.padId === this.selectedPadId);
        if (!occupied) {
          this.buildTurretOnPad(this.selectedPadId, this.selectedBuildType);
        }
      }
    }
    if (this.justPressedKeys.has('Enter') && this.selectedPadId && this.selectedBuildType) {
      const occupied = this.turrets.some((t) => t.padId === this.selectedPadId);
      if (!occupied) {
        this.buildTurretOnPad(this.selectedPadId, this.selectedBuildType);
      } else {
        this.upgradeSelectedTurret();
      }
    }
  }

  private navigatePadByDirection(dx: number, dy: number) {
    const pads = this.currentMap.pads;
    if (pads.length === 0) return;
    const current = pads.find((p) => p.id === this.selectedPadId) || pads[0];

    let bestPad = current;
    let bestScore = Infinity;

    for (const p of pads) {
      if (p.id === current.id) continue;
      const vx = p.x - current.x;
      const vy = p.y - current.y;
      const dot = vx * dx + vy * dy;
      if (dot <= 0) continue;
      const dist = Math.hypot(vx, vy);
      const anglePenalty = Math.abs(vx * dy - vy * dx) * 1.4;
      const score = dist + anglePenalty;
      if (score < bestScore) {
        bestScore = score;
        bestPad = p;
      }
    }

    this.selectedPadId = bestPad.id;
    soundEngine.playUiClick();
    this.emitHudSnapshot();
  }

  // ============================================================================
  // SIMULATION STEP
  // ============================================================================

  private updateSimulation(dt: number) {
    this.simTime += dt;
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 24);

    if (this.waveAnnouncement) {
      this.waveAnnouncement.timer -= dt;
      if (this.waveAnnouncement.timer <= 0) {
        this.waveAnnouncement = null;
      }
    }

    // Cooldowns
    this.airstrikeCooldown = Math.max(0, this.airstrikeCooldown - dt);
    this.overclockCooldown = Math.max(0, this.overclockCooldown - dt);
    this.overclockActiveTimer = Math.max(0, this.overclockActiveTimer - dt);

    // Pending Airstrike Bombs
    for (let i = this.pendingAirstrikeBombs.length - 1; i >= 0; i--) {
      const b = this.pendingAirstrikeBombs[i];
      b.delay -= dt;
      if (b.delay <= 0) {
        this.detonateExplosion(b.x, b.y, 290, 125, true);
        this.pendingAirstrikeBombs.splice(i, 1);
      }
    }

    // Title Screen Continuous Demo Spawner
    if (this.gameState === 'TITLE_MENU') {
      this.demoSpawnTimer -= dt;
      if (this.demoSpawnTimer <= 0 && this.zombies.length < 18) {
        const types: ZombieType[] = ['SHAMBLER', 'SPRINTER', 'RIOT_BRUTE', 'SPITTER', 'BROOD_CARRIER'];
        const pick = types[Math.floor(Math.random() * types.length)];
        this.spawnZombie(pick, 0, 0.85);
        this.demoSpawnTimer = 1.1;
      }
    } else if (this.gameState === 'PLAYING') {
      this.updateWaveProgression(dt);
    }

    this.updateZombies(dt);
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    this.updateEffects(dt);
  }

  private updateWaveProgression(dt: number) {
    if (!this.waveInProgress) {
      this.waveCountdown -= dt;
      if (this.waveCountdown <= 0) {
        this.startNextWave();
      }
      return;
    }

    this.waveElapsed += dt;

    // Spawn due zombies
    while (
      this.pendingSpawns.length > 0 &&
      this.pendingSpawns[0].spawnAtWaveTime <= this.waveElapsed
    ) {
      const task = this.pendingSpawns.shift()!;
      const waveScale = 1 + (this.waveNumber - 1) * 0.14;
      this.spawnZombie(task.type, task.laneIndex, waveScale);
    }

    // Check if wave cleared
    if (this.pendingSpawns.length === 0 && this.zombies.length === 0) {
      this.waveInProgress = false;
      const completedWave = WAVE_SCHEDULE[this.waveNumber - 1];
      const reward = completedWave ? completedWave.rewardScrap : 100;
      this.scrap += reward;
      this.score += reward * 10;

      if (this.waveNumber >= WAVE_SCHEDULE.length) {
        this.gameState = 'VICTORY';
        soundEngine.playTurretUpgrade();
        this.emitHudSnapshot();
      } else {
        this.waveCountdown = 11.0;
        this.waveAnnouncement = {
          title: `WAVE ${String(this.waveNumber).padStart(2, '0')} CLEARED`,
          subtitle: `+${reward} Scrap Secured · Next wave in 11s`,
          timer: 2.8,
        };
        soundEngine.playTurretUpgrade();
        this.emitHudSnapshot();
      }
    }
  }

  private updateZombies(dt: number) {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.hitFlashTimer = Math.max(0, z.hitFlashTimer - dt);
      z.slowTimer = Math.max(0, z.slowTimer - dt);
      z.brittleTimer = Math.max(0, z.brittleTimer - dt);
      z.sprintBoostTimer = Math.max(0, z.sprintBoostTimer - dt);
      z.abilityCooldown -= dt;

      // Process Windup Telegraphs
      if (z.windupType !== 'NONE') {
        z.windupTimer -= dt;
        if (z.windupTimer <= 0) {
          this.executeZombieWindupAction(z);
          z.windupType = 'NONE';
        } else {
          // While winding up Acid Spit or Seismic Slam, zombie halts movement
          if (z.windupType === 'ACID_SPIT' || z.windupType === 'SEISMIC_SLAM') {
            continue;
          }
        }
      } else if (z.abilityCooldown <= 0) {
        this.tryStartZombieWindup(z);
      }

      // Compute current movement speed
      let speed = z.baseSpeed;
      if (z.sprintBoostTimer > 0) speed *= 2.05;
      if (z.slowTimer > 0) speed *= 1 - z.slowAmount;

      const lane = this.currentMap.lanes[z.laneIndex];
      const targetWp = lane[z.waypointIndex];
      if (!targetWp) continue;

      const dx = targetWp.x - z.x;
      const dy = targetWp.y - z.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= speed * dt) {
        z.x = targetWp.x;
        z.y = targetWp.y;
        z.distanceTraveled += dist;
        z.waypointIndex += 1;

        // Reached Bastion Gate!
        if (z.waypointIndex >= lane.length) {
          this.handleZombieBreach(z, i);
          continue;
        }
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        z.vx = nx * speed;
        z.vy = ny * speed;
        z.x += z.vx * dt;
        z.y += z.vy * dt;
        z.angle = Math.atan2(ny, nx);
        z.distanceTraveled += speed * dt;
        z.gaitPhase += dt * (speed * 0.18);
      }
    }
  }

  private tryStartZombieWindup(z: ZombieInstance) {
    if (z.type === 'SPRINTER') {
      z.windupType = 'SPRINT_LUNGE';
      z.windupMax = 0.42;
      z.windupTimer = 0.42;
      z.abilityCooldown = 4.5 + Math.random() * 1.5;
    } else if (z.type === 'SPITTER') {
      // Find closest turret within 225px
      let bestTurret: TurretInstance | null = null;
      let bestDist = 225;
      for (const t of this.turrets) {
        const d = Math.hypot(t.x - z.x, t.y - z.y);
        if (d < bestDist) {
          bestDist = d;
          bestTurret = t;
        }
      }
      if (bestTurret) {
        z.windupType = 'ACID_SPIT';
        z.windupMax = 0.85;
        z.windupTimer = 0.85;
        z.windupTargetPadId = bestTurret.padId;
        z.angle = Math.atan2(bestTurret.y - z.y, bestTurret.x - z.x);
        z.abilityCooldown = 5.2;
      } else {
        z.abilityCooldown = 1.2;
      }
    } else if (z.type === 'BROOD_CARRIER') {
      z.windupType = 'SPORE_PULSE';
      z.windupMax = 0.75;
      z.windupTimer = 0.75;
      z.abilityCooldown = 5.0;
    } else if (z.type === 'APEX_JUGGERNAUT') {
      z.windupType = 'SEISMIC_SLAM';
      z.windupMax = 1.15;
      z.windupTimer = 1.15;
      z.abilityCooldown = 7.0;
    } else {
      z.abilityCooldown = 99;
    }
  }

  private executeZombieWindupAction(z: ZombieInstance) {
    if (z.windupType === 'SPRINT_LUNGE') {
      z.sprintBoostTimer = 1.65;
      this.spawnBurstParticles(z.x, z.y, '#F87171', 6, 'SPARK');
    } else if (z.windupType === 'ACID_SPIT' && z.windupTargetPadId) {
      const targetTurret = this.turrets.find((t) => t.padId === z.windupTargetPadId);
      if (targetTurret) {
        this.projectiles.push({
          id: this.nextId('acid'),
          kind: 'ACID_GLOB',
          x: z.x,
          y: z.y,
          startX: z.x,
          startY: z.y,
          targetX: targetTurret.x,
          targetY: targetTurret.y,
          vx: 0,
          vy: 0,
          progress: 0,
          flightDuration: 0.55,
          damage: 0,
          splashRadius: 28,
          color: '#A3E635',
          targetPadId: targetTurret.padId,
        });
      }
    } else if (z.windupType === 'SPORE_PULSE') {
      // Heal nearby infected within 95px
      for (const other of this.zombies) {
        if (Math.hypot(other.x - z.x, other.y - z.y) <= 95) {
          other.hp = Math.min(other.maxHp, other.hp + Math.round(other.maxHp * 0.14));
        }
      }
      this.particles.push({
        x: z.x,
        y: z.y,
        vx: 0,
        vy: 0,
        size: 10,
        color: '#FB923C',
        alpha: 0.85,
        life: 0.35,
        maxLife: 0.35,
        kind: 'SHOCKWAVE',
        rotation: 0,
        vRot: 0,
        maxRadius: 95,
      });
    } else if (z.windupType === 'SEISMIC_SLAM') {
      // Stun turrets within 155px for 1.8s + heavy shake & hitstop!
      const slamRadius = 155;
      for (const t of this.turrets) {
        if (Math.hypot(t.x - z.x, t.y - z.y) <= slamRadius) {
          t.stunnedTimer = 2.0;
          this.spawnFloatingText(t.x, t.y - 18, 'SHOCKED!', '#EF4444', true);
        }
      }
      this.triggerHitstop(0.055, 9.5);
      soundEngine.playExplosion(true);
      this.particles.push({
        x: z.x,
        y: z.y,
        vx: 0,
        vy: 0,
        size: 12,
        color: '#EF4444',
        alpha: 0.95,
        life: 0.42,
        maxLife: 0.42,
        kind: 'SHOCKWAVE',
        rotation: 0,
        vRot: 0,
        maxRadius: slamRadius,
      });
    }
  }

  private handleZombieBreach(z: ZombieInstance, index: number) {
    this.zombies.splice(index, 1);

    if (this.gameState === 'TITLE_MENU') {
      // In Title demo, respawn loop seamlessly
      return;
    }

    this.bastionHp = Math.max(0, this.bastionHp - z.breachDamage);
    this.triggerHitstop(0.045, 8.0);
    soundEngine.playBaseBreach();
    this.spawnFloatingText(
      z.x - 25,
      z.y - 20,
      `-${z.breachDamage} BASTION HP`,
      '#EF4444',
      true
    );

    if (this.bastionHp <= 0) {
      this.gameState = 'GAME_OVER';
      this.emitHudSnapshot();
    }
  }

  // ============================================================================
  // TURRET TARGETING & FIRING
  // ============================================================================

  private updateTurrets(dt: number) {
    const overclockMult = this.overclockActiveTimer > 0 ? 1.6 : 1.0;

    for (const t of this.turrets) {
      t.recoil = Math.max(0, t.recoil - dt * 6.5);
      t.scaleAnim = 1 + (t.scaleAnim - 1) * Math.pow(0.001, dt * 4);
      t.corrodedTimer = Math.max(0, t.corrodedTimer - dt);
      t.stunnedTimer = Math.max(0, t.stunnedTimer - dt);

      if (t.stunnedTimer > 0) {
        t.chargeProgress = 0;
        continue;
      }

      const bp = TURRET_BLUEPRINTS[t.type];
      const tier = bp.tiers[t.level - 1];
      const rateMult = (t.corrodedTimer > 0 ? 0.65 : 1.0) * overclockMult;
      t.cooldown -= dt * rateMult;

      const target = this.acquireTarget(t, tier.range);
      t.lockedTargetId = target ? target.id : null;

      if (target) {
        const desiredAngle = Math.atan2(target.y - t.y, target.x - t.x);
        t.angle = this.lerpAngle(t.angle, desiredAngle, Math.min(1, dt * 16));

        // Railgun shows visible targeting laser telegraph before firing
        if (t.type === 'RAILGUN') {
          if (t.cooldown <= 0.38 && t.cooldown > 0) {
            t.chargeProgress = 1 - t.cooldown / 0.38;
          } else if (t.cooldown <= 0) {
            t.chargeProgress = 0;
            this.fireTurret(t, target);
            t.cooldown = 1 / tier.fireRate;
          }
        } else if (t.cooldown <= 0) {
          this.fireTurret(t, target);
          t.cooldown = 1 / tier.fireRate;
        }
      } else {
        t.chargeProgress = 0;
      }
    }
  }

  private acquireTarget(t: TurretInstance, range: number): ZombieInstance | null {
    let best: ZombieInstance | null = null;
    let bestMetric = -Infinity;

    for (const z of this.zombies) {
      const dist = Math.hypot(z.x - t.x, z.y - t.y);
      if (dist > range) continue;

      let metric = 0;
      if (t.priority === 'FIRST') {
        metric = z.distanceTraveled;
      } else if (t.priority === 'STRONGEST') {
        metric = z.hp * 1000 + z.distanceTraveled;
      } else if (t.priority === 'WEAKEST') {
        metric = -z.hp * 1000 + z.distanceTraveled;
      } else if (t.priority === 'CLOSEST') {
        metric = -dist;
      }

      if (metric > bestMetric) {
        bestMetric = metric;
        best = z;
      }
    }
    return best;
  }

  private fireTurret(t: TurretInstance, target: ZombieInstance) {
    const bp = TURRET_BLUEPRINTS[t.type];
    const tier = bp.tiers[t.level - 1];
    t.recoil = 1.0;

    const muzzleX = t.x + Math.cos(t.angle) * 20;
    const muzzleY = t.y + Math.sin(t.angle) * 20;

    if (t.type === 'VULCAN') {
      soundEngine.playVulcanShot();
      // Eject brass shell casing particle
      const ejectAngle = t.angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4;
      this.particles.push({
        x: t.x,
        y: t.y,
        vx: Math.cos(ejectAngle) * (55 + Math.random() * 35),
        vy: Math.sin(ejectAngle) * (55 + Math.random() * 35),
        size: 2,
        color: '#FBBF24',
        alpha: 1,
        life: 0.45,
        maxLife: 0.45,
        kind: 'SHELL_CASING',
        rotation: Math.random() * Math.PI,
        vRot: 12,
      });

      const speed = 780;
      const angle = Math.atan2(target.y - muzzleY, target.x - muzzleX);
      this.projectiles.push({
        id: this.nextId('proj'),
        kind: 'BULLET',
        x: muzzleX,
        y: muzzleY,
        startX: muzzleX,
        startY: muzzleY,
        targetX: target.x,
        targetY: target.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        progress: 0,
        flightDuration: 0,
        damage: tier.damage,
        splashRadius: 0,
        color: '#FBBF24',
        sourceTurretId: t.id,
      });
    } else if (t.type === 'CRYO') {
      soundEngine.playCryoPulse();
      // Area cryo nova / cone affecting all zombies in range
      this.particles.push({
        x: t.x,
        y: t.y,
        vx: 0,
        vy: 0,
        size: 8,
        color: '#38BDF8',
        alpha: 0.75,
        life: 0.28,
        maxLife: 0.28,
        kind: 'SHOCKWAVE',
        rotation: 0,
        vRot: 0,
        maxRadius: tier.range,
      });

      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        if (Math.hypot(z.x - t.x, z.y - t.y) <= tier.range) {
          z.slowTimer = Math.max(z.slowTimer, tier.slowDuration || 2.6);
          z.slowAmount = Math.max(z.slowAmount, tier.slowFactor || 0.4);
          z.brittleTimer = Math.max(z.brittleTimer, tier.slowDuration || 2.6);
          z.sprintBoostTimer = 0; // strips Sprinter lunge
          this.applyDamageToZombie(z, tier.damage, t, true);
        }
      }
    } else if (t.type === 'MORTAR') {
      soundEngine.playMortarLaunch();
      this.spawnBurstParticles(muzzleX, muzzleY, '#F97316', 7, 'SMOKE');
      // Lead moving target slightly
      const leadX = target.x + target.vx * 0.35;
      const leadY = target.y + target.vy * 0.35;
      this.projectiles.push({
        id: this.nextId('mortar'),
        kind: 'MORTAR_SHELL',
        x: muzzleX,
        y: muzzleY,
        startX: muzzleX,
        startY: muzzleY,
        targetX: leadX,
        targetY: leadY,
        vx: 0,
        vy: 0,
        progress: 0,
        flightDuration: 0.58,
        damage: tier.damage,
        splashRadius: tier.splashRadius || 80,
        color: '#F97316',
        sourceTurretId: t.id,
        isHeavy: t.level >= 2,
      });
    } else if (t.type === 'TESLA') {
      soundEngine.playTeslaZap();
      const maxChain = tier.chainTargets || 3;
      const hitIds = new Set<string>([target.id]);
      const chainPoints: Vec2[] = [{ x: muzzleX, y: muzzleY }, { x: target.x, y: target.y }];

      this.applyDamageToZombie(target, tier.damage, t, true);
      let currentZ = target;

      for (let c = 1; c < maxChain; c++) {
        let nextZ: ZombieInstance | null = null;
        let bestDist = 115;
        for (const cand of this.zombies) {
          if (hitIds.has(cand.id)) continue;
          const d = Math.hypot(cand.x - currentZ.x, cand.y - currentZ.y);
          if (d < bestDist) {
            bestDist = d;
            nextZ = cand;
          }
        }
        if (!nextZ) break;
        hitIds.add(nextZ.id);
        chainPoints.push({ x: nextZ.x, y: nextZ.y });
        this.applyDamageToZombie(nextZ, Math.round(tier.damage * Math.pow(0.85, c)), t, true);
        currentZ = nextZ;
      }

      this.beams.push({
        id: this.nextId('arc'),
        points: chainPoints,
        color: '#C084FC',
        alpha: 1.0,
        width: 3 + t.level,
      });
    } else if (t.type === 'RAILGUN') {
      soundEngine.playRailgunShot();
      // Piercing line raycast across the map along firing angle
      const rayLen = tier.range + 60;
      const endX = muzzleX + Math.cos(t.angle) * rayLen;
      const endY = muzzleY + Math.sin(t.angle) * rayLen;

      this.beams.push({
        id: this.nextId('rail'),
        points: [
          { x: muzzleX, y: muzzleY },
          { x: endX, y: endY },
        ],
        color: '#10B981',
        alpha: 1.0,
        width: 5 + t.level * 1.5,
      });

      let pierced = 0;
      const maxPierce = tier.pierceCount || 4;
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        if (pierced >= maxPierce) break;
        const z = this.zombies[i];
        const distToRay = this.pointToSegmentDistance(
          z.x,
          z.y,
          muzzleX,
          muzzleY,
          endX,
          endY
        );
        if (distToRay <= z.radius + 10) {
          pierced += 1;
          this.applyDamageToZombie(z, tier.damage, t, true, true);
        }
      }

      // Weighty hitstop & camera shake on Railgun fire
      this.triggerHitstop(0.038, 5.5);
    }
  }

  // ============================================================================
  // PROJECTILES & DAMAGE RESOLUTION
  // ============================================================================

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.kind === 'BULLET') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (
          p.x < -50 ||
          p.x > VIRTUAL_WIDTH + 50 ||
          p.y < -50 ||
          p.y > VIRTUAL_HEIGHT + 50
        ) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Check collision with any zombie
        let hit = false;
        for (let j = this.zombies.length - 1; j >= 0; j--) {
          const z = this.zombies[j];
          if (Math.hypot(z.x - p.x, z.y - p.y) <= z.radius + 5) {
            const sourceTurret = this.turrets.find((t) => t.id === p.sourceTurretId);
            this.applyDamageToZombie(z, p.damage, sourceTurret, false);
            hit = true;
            break;
          }
        }
        if (hit) {
          this.projectiles.splice(i, 1);
        }
      } else if (p.kind === 'MORTAR_SHELL') {
        p.progress += dt / p.flightDuration;
        p.x = p.startX + (p.targetX - p.startX) * p.progress;
        p.y = p.startY + (p.targetY - p.startY) * p.progress;

        if (p.progress >= 1) {
          const sourceTurret = this.turrets.find((t) => t.id === p.sourceTurretId);
          this.detonateExplosion(
            p.targetX,
            p.targetY,
            p.damage,
            p.splashRadius,
            Boolean(p.isHeavy),
            sourceTurret
          );
          this.projectiles.splice(i, 1);
        }
      } else if (p.kind === 'ACID_GLOB') {
        p.progress += dt / p.flightDuration;
        p.x = p.startX + (p.targetX - p.startX) * p.progress;
        p.y = p.startY + (p.targetY - p.startY) * p.progress;

        if (p.progress >= 1) {
          const targetTurret = this.turrets.find((t) => t.padId === p.targetPadId);
          if (targetTurret) {
            targetTurret.corrodedTimer = 5.0;
            this.spawnFloatingText(
              targetTurret.x,
              targetTurret.y - 18,
              'ACID CORROSION',
              '#A3E635',
              false
            );
          }
          this.spawnBurstParticles(p.targetX, p.targetY, '#A3E635', 10, 'SPARK');
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  private detonateExplosion(
    x: number,
    y: number,
    damage: number,
    radius: number,
    heavy: boolean,
    sourceTurret?: TurretInstance
  ) {
    soundEngine.playExplosion(heavy);
    this.triggerHitstop(heavy ? 0.045 : 0.025, heavy ? 7.0 : 4.2);

    // Scorch decal on road
    this.addDecal(x, y, radius * 0.42, 'rgba(15, 23, 42, 0.65)', 'SCORCH');

    // Expanding blast wave particle
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size: 10,
      color: '#F97316',
      alpha: 0.9,
      life: 0.32,
      maxLife: 0.32,
      kind: 'SHOCKWAVE',
      rotation: 0,
      vRot: 0,
      maxRadius: radius,
    });

    this.spawnBurstParticles(x, y, '#F97316', heavy ? 22 : 14, 'SPARK');

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const dist = Math.hypot(z.x - x, z.y - y);
      if (dist <= radius + z.radius) {
        const falloff = Math.max(0.45, 1 - (dist / (radius + z.radius)) * 0.5);
        this.applyDamageToZombie(z, Math.round(damage * falloff), sourceTurret, true);
      }
    }
  }

  private applyDamageToZombie(
    z: ZombieInstance,
    rawDamage: number,
    sourceTurret?: TurretInstance,
    bypassesArmor = false,
    isCrit = false
  ) {
    let dmg = rawDamage;
    if (!bypassesArmor && z.armor > 0) {
      dmg = Math.max(1, Math.round(dmg * (1 - z.armor)));
      // Ricochet spark on Riot shield
      this.spawnBurstParticles(z.x, z.y, '#E2E8F0', 3, 'SPARK');
    }

    if (z.brittleTimer > 0) {
      dmg = Math.round(dmg * 1.25);
    }

    z.hp -= dmg;
    z.hitFlashTimer = 0.085;

    if (sourceTurret) {
      sourceTurret.totalDamage += dmg;
    }

    if (isCrit || dmg >= 140) {
      this.spawnFloatingText(
        z.x + (Math.random() - 0.5) * 12,
        z.y - z.radius - 6,
        `${dmg}!`,
        '#34D399',
        true
      );
    }

    if (z.hp <= 0) {
      const idx = this.zombies.findIndex((item) => item.id === z.id);
      if (idx !== -1) {
        this.killZombie(z, idx, sourceTurret);
      }
    }
  }

  private killZombie(z: ZombieInstance, index: number, sourceTurret?: TurretInstance) {
    this.zombies.splice(index, 1);

    if (sourceTurret) {
      sourceTurret.kills += 1;
    }

    // Blood decal & splatter burst
    this.addDecal(z.x, z.y, z.radius * 0.95, 'rgba(153, 27, 27, 0.55)', 'BLOOD');
    this.spawnBurstParticles(z.x, z.y, '#DC2626', z.isBoss ? 28 : 9, 'BLOOD');
    soundEngine.playZombieDeath(Boolean(z.isBoss));

    // Brood Carrier splits into 3 fast Crawlers on death!
    if (z.type === 'BROOD_CARRIER') {
      const waveScale = Math.max(1, 1 + (this.waveNumber - 1) * 0.12);
      for (let c = 0; c < 3; c++) {
        const offset = {
          x: z.x + (Math.random() - 0.5) * 26,
          y: z.y + (Math.random() - 0.5) * 26,
        };
        this.spawnZombie('CRAWLER', z.laneIndex, waveScale, offset, z.waypointIndex);
      }
    }

    if (this.gameState === 'PLAYING') {
      this.scrap += z.scrapReward;
      this.totalKills += 1;
      this.score += z.scrapReward * 5;
      if (z.isBoss) {
        this.triggerHitstop(0.065, 11.0);
        this.spawnFloatingText(z.x, z.y - 25, `+${z.scrapReward} BOSS BOUNTY`, '#F59E0B', true);
      }
    }
  }

  private updateEffects(dt: number) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.alpha -= dt * 4.5;
      if (b.alpha <= 0) this.beams.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.rotation += pt.vRot * dt;
      pt.alpha = pt.life / pt.maxLife;
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.alpha -= dt * 0.04;
      if (d.alpha <= 0) this.decals.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.alpha = Math.min(1, ft.life * 2.2);
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  // ============================================================================
  // HELPERS & RENDERING DISPATCH
  // ============================================================================

  private triggerHitstop(durationSec: number, shake: number) {
    this.hitstopTimer = Math.max(this.hitstopTimer, durationSec);
    this.shakeIntensity = Math.min(14, Math.max(this.shakeIntensity, shake));
  }

  private spawnBurstParticles(
    x: number,
    y: number,
    color: string,
    count: number,
    kind: Particle['kind']
  ) {
    if (this.particles.length > 260) {
      this.particles.splice(0, count);
    }
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 140;
      const life = 0.22 + Math.random() * 0.28;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 2.5,
        color,
        alpha: 1,
        life,
        maxLife: life,
        kind,
        rotation: 0,
        vRot: 0,
      });
    }
  }

  private addDecal(
    x: number,
    y: number,
    radius: number,
    color: string,
    kind: GroundDecal['kind']
  ) {
    if (this.decals.length > 90) {
      this.decals.shift();
    }
    this.decals.push({ x, y, radius, color, alpha: 0.65, kind });
  }

  private spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    isCrit = false
  ) {
    if (this.gameState === 'TITLE_MENU') return;
    if (this.floatingTexts.length > 30) {
      this.floatingTexts.shift();
    }
    this.floatingTexts.push({
      x,
      y,
      vy: -28,
      text,
      color,
      alpha: 1,
      life: 0.85,
      isCrit,
    });
  }

  private lerpAngle(a: number, b: number, t: number): number {
    const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + diff * t;
  }

  private pointToSegmentDistance(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  private renderFrame() {
    if (!this.ctx || !this.canvas) return;
    const shakeOffset: Vec2 =
      this.shakeIntensity > 0.1
        ? {
            x: (Math.random() - 0.5) * 2 * this.shakeIntensity,
            y: (Math.random() - 0.5) * 2 * this.shakeIntensity,
          }
        : { x: 0, y: 0 };

    renderGameWorld(this.ctx, this.canvas.width, this.canvas.height, {
      map: this.currentMap,
      turrets: this.turrets,
      zombies: this.zombies,
      projectiles: this.projectiles,
      beams: this.beams,
      particles: this.particles,
      decals: this.decals,
      floatingTexts: this.floatingTexts,
      hoveredPadId: this.hoveredPadId,
      selectedPadId: this.selectedPadId,
      selectedBuildType: this.selectedBuildType,
      scrap: this.scrap,
      bastionHp: this.bastionHp,
      bastionMaxHp: this.bastionMaxHp,
      overclockActiveTimer: this.overclockActiveTimer,
      targetingAirstrike: this.targetingAirstrike,
      mouseWorld: this.mouseWorld,
      time: this.simTime,
      isTitleDemo: this.gameState === 'TITLE_MENU',
      shakeOffset,
    });
  }

  public emitHudSnapshot() {
    const selectedTurret = this.selectedPadId
      ? this.turrets.find((t) => t.padId === this.selectedPadId) || null
      : null;

    this.onHudUpdate({
      gameState: this.gameState,
      sectorId: this.currentMap.id,
      scrap: this.scrap,
      bastionHp: this.bastionHp,
      bastionMaxHp: this.bastionMaxHp,
      waveNumber: Math.max(1, this.waveNumber),
      totalWaves: WAVE_SCHEDULE.length,
      waveInProgress: this.waveInProgress,
      waveCountdown: Math.ceil(Math.max(0, this.waveCountdown)),
      enemiesRemaining: this.zombies.length + this.pendingSpawns.length,
      score: this.score,
      totalKills: this.totalKills,
      gameSpeed: this.gameSpeed,
      selectedBuildType: this.selectedBuildType,
      selectedPadId: this.selectedPadId,
      selectedTurret: selectedTurret ? { ...selectedTurret } : null,
      airstrikeCooldown: Math.ceil(this.airstrikeCooldown),
      airstrikeMaxCooldown: this.airstrikeMaxCooldown,
      targetingAirstrike: this.targetingAirstrike,
      overclockCooldown: Math.ceil(this.overclockCooldown),
      overclockMaxCooldown: this.overclockMaxCooldown,
      overclockActiveTimer: Math.ceil(this.overclockActiveTimer),
      waveAnnouncement: this.waveAnnouncement ? { ...this.waveAnnouncement } : null,
    });
  }
}

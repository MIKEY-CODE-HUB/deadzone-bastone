export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export type TurretType = 'VULCAN' | 'CRYO' | 'MORTAR' | 'TESLA' | 'RAILGUN';

export type TargetingPriority = 'FIRST' | 'STRONGEST' | 'WEAKEST' | 'CLOSEST';

export type ZombieType =
  | 'SHAMBLER'
  | 'SPRINTER'
  | 'RIOT_BRUTE'
  | 'SPITTER'
  | 'BROOD_CARRIER'
  | 'CRAWLER'
  | 'APEX_JUGGERNAUT';

export interface Vec2 {
  x: number;
  y: number;
}

export interface BuildPad {
  id: string;
  x: number;
  y: number;
  elevated?: boolean;
}

export interface SectorMap {
  id: string;
  name: string;
  code: string;
  subtitle: string;
  difficultyLabel: string;
  startingScrap: number;
  bastionMaxHp: number;
  lanes: Vec2[][];
  pads: BuildPad[];
  props: {
    x: number;
    y: number;
    kind: 'HUMVEE' | 'BARRIER' | 'FLOODLIGHT' | 'CRATE' | 'BIO_VATS';
    rotation: number;
  }[];
}

export interface TurretTierStats {
  level: 1 | 2 | 3;
  name: string;
  damage: number;
  fireRate: number; // shots per second
  range: number;
  upgradeCost: number;
  splashRadius?: number;
  slowFactor?: number;
  slowDuration?: number;
  chainTargets?: number;
  pierceCount?: number;
  description: string;
}

export interface TurretBlueprint {
  type: TurretType;
  hotkey: string;
  name: string;
  role: string;
  baseCost: number;
  accentColor: string;
  secondaryColor: string;
  tiers: [TurretTierStats, TurretTierStats, TurretTierStats];
}

export interface TurretInstance {
  id: string;
  padId: string;
  type: TurretType;
  x: number;
  y: number;
  level: 1 | 2 | 3;
  totalInvested: number;
  angle: number;
  targetAngle: number;
  cooldown: number;
  recoil: number;
  scaleAnim: number;
  priority: TargetingPriority;
  kills: number;
  totalDamage: number;
  corrodedTimer: number; // from Spitter acid
  stunnedTimer: number; // from Boss seismic slam
  chargeProgress: number; // used for Railgun windup laser telegraph
  lockedTargetId: string | null;
}

export interface ZombieInstance {
  id: string;
  type: ZombieType;
  laneIndex: number;
  waypointIndex: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  armor: number; // 0 to 0.65 damage reduction against frontal kinetic
  baseSpeed: number;
  radius: number;
  scrapReward: number;
  breachDamage: number;
  distanceTraveled: number;
  gaitPhase: number;
  hitFlashTimer: number;
  slowTimer: number;
  slowAmount: number;
  brittleTimer: number; // +25% bonus damage taken when cryo'd
  // Telegraph & special behavior state
  abilityCooldown: number;
  windupTimer: number;
  windupMax: number;
  windupType: 'NONE' | 'SPRINT_LUNGE' | 'ACID_SPIT' | 'SHIELD_RAM' | 'SPORE_PULSE' | 'SEISMIC_SLAM';
  windupTargetPadId?: string;
  sprintBoostTimer: number;
  isBoss?: boolean;
}

export interface Projectile {
  id: string;
  kind: 'BULLET' | 'MORTAR_SHELL' | 'ACID_GLOB';
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  progress: number; // 0..1 for arcing mortar/acid
  flightDuration: number;
  damage: number;
  splashRadius: number;
  color: string;
  sourceTurretId?: string;
  targetPadId?: string;
  isHeavy?: boolean;
}

export interface LightningBeam {
  id: string;
  points: Vec2[];
  color: string;
  alpha: number;
  width: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'SPARK' | 'BLOOD' | 'SMOKE' | 'FROST' | 'SHELL_CASING' | 'SHOCKWAVE';
  rotation: number;
  vRot: number;
  maxRadius?: number;
}

export interface GroundDecal {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  kind: 'BLOOD' | 'SCORCH' | 'ACID';
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  alpha: number;
  life: number;
  isCrit?: boolean;
}

export interface WaveSpawnGroup {
  type: ZombieType;
  count: number;
  interval: number;
  delayBefore: number;
  laneIndex?: number;
}

export interface WaveDefinition {
  waveNumber: number;
  title: string;
  threatNote: string;
  rewardScrap: number;
  groups: WaveSpawnGroup[];
}

export interface HudSnapshot {
  gameState: GameState;
  sectorId: string;
  scrap: number;
  bastionHp: number;
  bastionMaxHp: number;
  waveNumber: number;
  totalWaves: number;
  waveInProgress: boolean;
  waveCountdown: number;
  enemiesRemaining: number;
  score: number;
  totalKills: number;
  gameSpeed: 1 | 2;
  selectedBuildType: TurretType | null;
  selectedPadId: string | null;
  selectedTurret: TurretInstance | null;
  airstrikeCooldown: number;
  airstrikeMaxCooldown: number;
  targetingAirstrike: boolean;
  overclockCooldown: number;
  overclockMaxCooldown: number;
  overclockActiveTimer: number;
  waveAnnouncement: { title: string; subtitle: string; timer: number } | null;
}

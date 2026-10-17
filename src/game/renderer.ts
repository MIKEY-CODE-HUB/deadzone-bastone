import {
  SECTOR_MAPS,
  TURRET_BLUEPRINTS,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
  ZOMBIE_BLUEPRINTS,
} from './constants';
import {
  BuildPad,
  FloatingText,
  GroundDecal,
  LightningBeam,
  Particle,
  Projectile,
  SectorMap,
  TurretInstance,
  TurretType,
  Vec2,
  ZombieInstance,
} from './types';

export interface RenderContextState {
  map: SectorMap;
  turrets: TurretInstance[];
  zombies: ZombieInstance[];
  projectiles: Projectile[];
  beams: LightningBeam[];
  particles: Particle[];
  decals: GroundDecal[];
  floatingTexts: FloatingText[];
  hoveredPadId: string | null;
  selectedPadId: string | null;
  selectedBuildType: TurretType | null;
  scrap: number;
  bastionHp: number;
  bastionMaxHp: number;
  overclockActiveTimer: number;
  targetingAirstrike: boolean;
  mouseWorld: Vec2;
  time: number;
  isTitleDemo: boolean;
  shakeOffset: Vec2;
}

export function renderGameWorld(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  state: RenderContextState
) {
  ctx.save();

  // Fill deep obsidian void outside letterbox
  ctx.fillStyle = '#070A0E';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Calculate uniform scale to fit 1280x720 virtual space
  const scaleX = canvasWidth / VIRTUAL_WIDTH;
  const scaleY = canvasHeight / VIRTUAL_HEIGHT;
  const scale = Math.max(scaleX, scaleY); // Cover viewport cleanly
  const offsetX = (canvasWidth - VIRTUAL_WIDTH * scale) * 0.5;
  const offsetY = (canvasHeight - VIRTUAL_HEIGHT * scale) * 0.5;

  ctx.translate(offsetX + state.shakeOffset.x * scale, offsetY + state.shakeOffset.y * scale);
  ctx.scale(scale, scale);

  // Subtle slow camera pan during Title Screen Demo
  if (state.isTitleDemo) {
    const panX = Math.sin(state.time * 0.25) * 18;
    const panY = Math.cos(state.time * 0.18) * 10;
    ctx.translate(panX, panY);
  }

  // 1. Base terrain & tactical grid
  drawTerrainAndGrid(ctx, state.map, state.time);

  // 2. Environmental props (humvees, bio-vats, crates)
  drawMapProps(ctx, state.map, state.time);

  // 3. Roads / Breach Corridors
  drawLanes(ctx, state.map, state.time);

  // 4. Persistent ground decals (blood, scorch craters, acid pools)
  drawDecals(ctx, state.decals);

  // 5. Bastion Fortress Gate at lane terminus
  drawBastionGate(ctx, state.map, state.bastionHp, state.bastionMaxHp, state.time);

  // 6. Tactical Build Pads & Range Previews
  drawBuildPads(ctx, state);

  // 7. Zombies & Visible Windup Telegraphs
  drawZombies(ctx, state.zombies, state.turrets, state.time);

  // 8. Turrets & Railgun Laser Sight Telegraphs
  drawTurrets(ctx, state.turrets, state.zombies, state.overclockActiveTimer, state.time);

  // 9. Projectiles & Chain Lightning Beams
  drawProjectilesAndBeams(ctx, state.projectiles, state.beams, state.time);

  // 10. Pooled Particles (sparks, brass casings, frost shards, shockwaves)
  drawParticles(ctx, state.particles);

  // 11. Floating Combat Readouts
  drawFloatingTexts(ctx, state.floatingTexts);

  // 12. Airstrike Targeting Reticle if active
  if (state.targetingAirstrike && !state.isTitleDemo) {
    drawAirstrikeReticle(ctx, state.mouseWorld, state.time);
  }

  // 13. Subtle atmospheric edge vignette
  drawTacticalVignette(ctx);

  ctx.restore();
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect
): Vec2 {
  const scaleX = rect.width / VIRTUAL_WIDTH;
  const scaleY = rect.height / VIRTUAL_HEIGHT;
  const scale = Math.max(scaleX, scaleY);
  const offsetX = (rect.width - VIRTUAL_WIDTH * scale) * 0.5;
  const offsetY = (rect.height - VIRTUAL_HEIGHT * scale) * 0.5;

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;

  return {
    x: (localX - offsetX) / scale,
    y: (localY - offsetY) / scale,
  };
}

function drawTerrainAndGrid(ctx: CanvasRenderingContext2D, map: SectorMap, time: number) {
  // Base dark military slate terrain
  const grad = ctx.createRadialGradient(
    VIRTUAL_WIDTH * 0.5,
    VIRTUAL_HEIGHT * 0.5,
    80,
    VIRTUAL_WIDTH * 0.5,
    VIRTUAL_HEIGHT * 0.5,
    VIRTUAL_WIDTH * 0.75
  );
  if (map.id === 'sector_overpass') {
    grad.addColorStop(0, '#121922');
    grad.addColorStop(1, '#090D12');
  } else if (map.id === 'sector_crossroads') {
    grad.addColorStop(0, '#111A1E');
    grad.addColorStop(1, '#080C10');
  } else {
    grad.addColorStop(0, '#16161D');
    grad.addColorStop(1, '#090A0F');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(-60, -60, VIRTUAL_WIDTH + 120, VIRTUAL_HEIGHT + 120);

  // Subtle tactical surveyor grid (64px)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= VIRTUAL_WIDTH; x += 64) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIRTUAL_HEIGHT);
  }
  for (let y = 0; y <= VIRTUAL_HEIGHT; y += 64) {
    ctx.moveTo(0, y);
    ctx.lineTo(VIRTUAL_WIDTH, y);
  }
  ctx.stroke();

  // Elevated tactical plateau contours around elevated pads
  for (const pad of map.pads) {
    if (pad.elevated) {
      ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(pad.x - 42, pad.y - 42, 84, 84, 10);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Danger spawn zone hazard stripes on left border
  for (const lane of map.lanes) {
    const start = lane[0];
    const pulse = 0.45 + 0.25 * Math.sin(time * 3.5);
    const spawnGlow = ctx.createRadialGradient(10, start.y, 5, 10, start.y, 85);
    spawnGlow.addColorStop(0, `rgba(239, 68, 68, ${0.28 * pulse})`);
    spawnGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = spawnGlow;
    ctx.beginPath();
    ctx.arc(10, start.y, 85, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLanes(ctx: CanvasRenderingContext2D, map: SectorMap, time: number) {
  for (const lane of map.lanes) {
    if (lane.length < 2) continue;

    // Outer road shoulder / concrete curb
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 66;
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) {
      ctx.lineTo(lane[i].x, lane[i].y);
    }
    ctx.stroke();

    // Inner weathered asphalt surface
    ctx.strokeStyle = '#0F151D';
    ctx.lineWidth = 56;
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) {
      ctx.lineTo(lane[i].x, lane[i].y);
    }
    ctx.stroke();

    // Tire wear tracks
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.lineWidth = 34;
    ctx.stroke();

    // Animated tactical flow chevrons / dashed highway centerline
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 18]);
    ctx.lineDashOffset = -time * 24;
    ctx.beginPath();
    ctx.moveTo(lane[0].x, lane[0].y);
    for (let i = 1; i < lane.length; i++) {
      ctx.lineTo(lane[i].x, lane[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawMapProps(ctx: CanvasRenderingContext2D, map: SectorMap, time: number) {
  for (const prop of map.props) {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.rotation);

    if (prop.kind === 'HUMVEE') {
      // Abandoned military transport
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-26, -13, 56, 30);
      ctx.fillStyle = '#27342B';
      ctx.strokeStyle = '#3F5245';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-28, -15, 56, 30, 4);
      ctx.fill();
      ctx.stroke();
      // Windshield & roof hatch
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(4, -12, 12, 24);
      ctx.strokeStyle = '#475569';
      ctx.beginPath();
      ctx.arc(-6, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (prop.kind === 'BIO_VATS') {
      // Glowing containment tanks
      for (const offset of [-18, 18]) {
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(offset, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const glow = 0.5 + 0.3 * Math.sin(time * 2.5 + offset);
        ctx.fillStyle = `rgba(16, 185, 129, ${0.35 * glow})`;
        ctx.beginPath();
        ctx.arc(offset, 0, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (prop.kind === 'CRATE') {
      ctx.fillStyle = '#1E2631';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-16, -12, 32, 24);
      ctx.strokeRect(-16, -12, 32, 24);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-12, -2, 8, 4);
    } else if (prop.kind === 'FLOODLIGHT') {
      // Light cone sweep
      const coneGrad = ctx.createRadialGradient(0, 0, 5, 80, 0, 150);
      coneGrad.addColorStop(0, 'rgba(248, 250, 252, 0.14)');
      coneGrad.addColorStop(1, 'rgba(248, 250, 252, 0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 150, -0.45, 0.45);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#94A3B8';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawDecals(ctx: CanvasRenderingContext2D, decals: GroundDecal[]) {
  for (const d of decals) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, d.alpha);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBastionGate(
  ctx: CanvasRenderingContext2D,
  map: SectorMap,
  hp: number,
  maxHp: number,
  time: number
) {
  const lastLane = map.lanes[0];
  const gatePos = lastLane[lastLane.length - 1];
  const gx = gatePos.x;
  const gy = gatePos.y;
  const hpRatio = Math.max(0, hp / maxHp);

  ctx.save();
  ctx.translate(gx, gy);

  // Subtle defense perimeter aura
  const auraColor = hpRatio > 0.5 ? 'rgba(16, 185, 129, 0.16)' : hpRatio > 0.25 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(239, 68, 68, 0.28)';
  const grad = ctx.createRadialGradient(0, 0, 12, 0, 0, 75);
  grad.addColorStop(0, auraColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 75, 0, Math.PI * 2);
  ctx.fill();

  // Armored Bastion Bulkhead
  ctx.fillStyle = '#151E29';
  ctx.strokeStyle = hpRatio > 0.35 ? '#38BDF8' : '#EF4444';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(-24, -46, 48, 92, 6);
  ctx.fill();
  ctx.stroke();

  // Hazard chevrons on gate
  ctx.fillStyle = '#F59E0B';
  for (let y = -34; y <= 28; y += 16) {
    ctx.fillRect(-18, y, 6, 8);
    ctx.fillRect(12, y, 6, 8);
  }

  // Core reactor beacon
  const beaconPulse = 0.65 + 0.35 * Math.sin(time * 5);
  ctx.fillStyle = hpRatio > 0.35 ? `rgba(56, 189, 248, ${beaconPulse})` : `rgba(239, 68, 68, ${beaconPulse})`;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  // Gate HP bar directly above bulkhead
  ctx.fillStyle = '#090D14';
  ctx.fillRect(-28, -60, 56, 7);
  ctx.fillStyle = hpRatio > 0.5 ? '#10B981' : hpRatio > 0.25 ? '#F59E0B' : '#EF4444';
  ctx.fillRect(-27, -59, 54 * hpRatio, 5);

  ctx.restore();
}

function drawBuildPads(ctx: CanvasRenderingContext2D, state: RenderContextState) {
  const occupiedPadIds = new Set(state.turrets.map((t) => t.padId));

  for (const pad of state.map.pads) {
    const isOccupied = occupiedPadIds.has(pad.id);
    const isHovered = state.hoveredPadId === pad.id;
    const isSelected = state.selectedPadId === pad.id;

    // Range preview circle when hovering or selecting a pad/turret
    if ((isHovered || isSelected) && !state.isTitleDemo) {
      const existingTurret = state.turrets.find((t) => t.padId === pad.id);
      let range = 0;
      let color = '#F59E0B';

      if (existingTurret) {
        const bp = TURRET_BLUEPRINTS[existingTurret.type];
        range = bp.tiers[existingTurret.level - 1].range;
        color = bp.accentColor;
      } else if (state.selectedBuildType) {
        const bp = TURRET_BLUEPRINTS[state.selectedBuildType];
        range = bp.tiers[0].range;
        color = state.scrap >= bp.baseCost ? bp.accentColor : '#EF4444';
      }

      if (range > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, range, 0, Math.PI * 2);
        ctx.fillStyle = `${color}14`;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `${color}88`;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Pad foundation socket
    ctx.save();
    ctx.translate(pad.x, pad.y);

    const size = 22;
    ctx.fillStyle = isOccupied ? '#131B24' : isHovered ? '#1E293B' : '#111822';
    ctx.strokeStyle = isSelected
      ? '#F59E0B'
      : isHovered
      ? '#94A3B8'
      : pad.elevated
      ? '#334155'
      : '#1E293B';
    ctx.lineWidth = isSelected || isHovered ? 2 : 1.5;

    ctx.beginPath();
    ctx.roundRect(-size, -size, size * 2, size * 2, 5);
    ctx.fill();
    ctx.stroke();

    // Corner mounting brackets
    const b = 15;
    ctx.strokeStyle = isHovered || isSelected ? '#F59E0B' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // top-left
    ctx.moveTo(-b, -b + 5);
    ctx.lineTo(-b, -b);
    ctx.lineTo(-b + 5, -b);
    // top-right
    ctx.moveTo(b - 5, -b);
    ctx.lineTo(b, -b);
    ctx.lineTo(b, -b + 5);
    // bottom-left
    ctx.moveTo(-b, b - 5);
    ctx.lineTo(-b, b);
    ctx.lineTo(-b + 5, b);
    // bottom-right
    ctx.moveTo(b - 5, b);
    ctx.lineTo(b, b);
    ctx.lineTo(b, b - 5);
    ctx.stroke();

    // Center crosshair on empty pads
    if (!isOccupied) {
      ctx.strokeStyle = isHovered && state.selectedBuildType ? '#F59E0B' : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.moveTo(0, -5);
      ctx.lineTo(0, 5);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawTurrets(
  ctx: CanvasRenderingContext2D,
  turrets: TurretInstance[],
  zombies: ZombieInstance[],
  overclockTimer: number,
  time: number
) {
  for (const t of turrets) {
    const bp = TURRET_BLUEPRINTS[t.type];

    // If Railgun is charging a shot, draw laser sight telegraph line toward locked target
    if (t.type === 'RAILGUN' && t.chargeProgress > 0 && t.lockedTargetId) {
      const target = zombies.find((z) => z.id === t.lockedTargetId);
      if (target) {
        ctx.save();
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.25 + t.chargeProgress * 0.7})`;
        ctx.lineWidth = 1 + t.chargeProgress * 2.5;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(t.x, t.y);

    // Squash & stretch scale animation on placement/upgrade
    const s = t.scaleAnim;
    ctx.scale(s, s);

    // Overclock golden aura ring
    if (overclockTimer > 0) {
      ctx.strokeStyle = `rgba(245, 158, 11, ${0.5 + 0.3 * Math.sin(time * 12)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Turret rotary base ring
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = bp.accentColor;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.arc(0, 0, 15 + (t.level - 1) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rotate turret head and apply firing recoil offset
    ctx.rotate(t.angle);
    const recoilOffset = -t.recoil * 5.5;
    ctx.translate(recoilOffset, 0);

    if (t.type === 'VULCAN') {
      // Twin/Quad rotary barrels
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(4, -6, 16 + t.level * 2, 3.5);
      ctx.fillRect(4, 2.5, 16 + t.level * 2, 3.5);
      if (t.level === 3) {
        ctx.fillRect(6, -10, 14, 2.5);
        ctx.fillRect(6, 7.5, 14, 2.5);
      }
      // Gun housing
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = bp.accentColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-10, -9, 18, 18, 3);
      ctx.fill();
      ctx.stroke();
    } else if (t.type === 'CRYO') {
      // Cryo nozzle + pressurized tank
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.moveTo(6, -7);
      ctx.lineTo(19, -11);
      ctx.lineTo(19, 11);
      ctx.lineTo(6, 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (t.type === 'MORTAR') {
      // Wide siege artillery tube
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#F97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-11, -11, 22, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#090D14';
      ctx.fillRect(-4, -7, 19, 14);
      ctx.strokeStyle = '#F97316';
      ctx.strokeRect(-4, -7, 19, 14);
    } else if (t.type === 'TESLA') {
      // Copper/plasma induction coils
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 2;
      for (let r = 12; r >= 5; r -= 3.5) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#E9D5FF';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === 'RAILGUN') {
      // Long electromagnetic accelerator rails
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-10, -8, 18, 16);
      ctx.strokeRect(-10, -8, 18, 16);

      ctx.fillStyle = '#10B981';
      ctx.fillRect(6, -5.5, 21 + t.level * 2, 3);
      ctx.fillRect(6, 2.5, 21 + t.level * 2, 3);
    }

    ctx.restore();

    // Level pips at bottom of pad
    ctx.save();
    ctx.translate(t.x, t.y);
    for (let i = 0; i < t.level; i++) {
      const px = -((t.level - 1) * 4) + i * 8;
      ctx.fillStyle = bp.accentColor;
      ctx.fillRect(px - 2, 16, 4, 3);
    }

    // Corroded (Spitter acid) or Stunned status indicator on turret
    if (t.stunnedTimer > 0) {
      ctx.fillStyle = '#EF4444';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STUNNED', 0, -20);
    } else if (t.corrodedTimer > 0) {
      ctx.strokeStyle = '#A3E635';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawZombies(
  ctx: CanvasRenderingContext2D,
  zombies: ZombieInstance[],
  turrets: TurretInstance[],
  time: number
) {
  for (const z of zombies) {
    const bp = ZOMBIE_BLUEPRINTS[z.type];

    // 1. Render Active Windup Telegraphs underneath/around the zombie
    if (z.windupType !== 'NONE' && z.windupTimer > 0) {
      const progress = 1 - z.windupTimer / z.windupMax;
      ctx.save();

      if (z.windupType === 'ACID_SPIT' && z.windupTargetPadId) {
        const targetTurret = turrets.find((t) => t.padId === z.windupTargetPadId);
        if (targetTurret) {
          // Dashed toxic trajectory line to target turret
          ctx.strokeStyle = 'rgba(163, 230, 53, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.lineTo(targetTurret.x, targetTurret.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Target lock warning ring on the threatened turret
          ctx.strokeStyle = '#A3E635';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(targetTurret.x, targetTurret.y, 20 * (1 - progress * 0.3), 0, Math.PI * 2);
          ctx.stroke();
        }

        // Expanding green charge ring around Spitter
        ctx.fillStyle = 'rgba(163, 230, 53, 0.22)';
        ctx.strokeStyle = '#A3E635';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius + 8 * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (z.windupType === 'SPRINT_LUNGE') {
        // Crimson lunge vector telegraph
        ctx.strokeStyle = '#F87171';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius + 6, 0, Math.PI * 2 * progress);
        ctx.stroke();
      } else if (z.windupType === 'SPORE_PULSE') {
        // Orange healing spore radius telegraph
        const sporeRadius = 95;
        ctx.fillStyle = `rgba(251, 146, 60, ${0.08 + 0.12 * progress})`;
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, sporeRadius * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (z.windupType === 'SEISMIC_SLAM') {
        // Boss seismic slam danger zone telegraph (155px radius)
        const slamRadius = 155;
        ctx.fillStyle = `rgba(239, 68, 68, ${0.1 + 0.18 * progress})`;
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, slamRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(z.x, z.y, slamRadius * progress, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // 2. Render Zombie Body with gait wobble
    ctx.save();
    ctx.translate(z.x, z.y);
    const wobble = Math.sin(z.gaitPhase) * 0.14;
    ctx.rotate(z.angle + wobble);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(2, 3, z.radius, 0, Math.PI * 2);
    ctx.fill();

    // Extended arms reaching forward
    ctx.strokeStyle = z.hitFlashTimer > 0 ? '#FFFFFF' : bp.bodyColor;
    ctx.lineWidth = Math.max(3, z.radius * 0.32);
    ctx.lineCap = 'round';
    const armReach = z.radius * 0.95;
    const armSwing = Math.sin(z.gaitPhase) * 3;
    ctx.beginPath();
    ctx.moveTo(2, -z.radius * 0.65);
    ctx.lineTo(armReach + armSwing, -z.radius * 0.45);
    ctx.moveTo(2, z.radius * 0.65);
    ctx.lineTo(armReach - armSwing, z.radius * 0.45);
    ctx.stroke();

    // Main torso circle
    ctx.fillStyle = z.hitFlashTimer > 0 ? '#FFFFFF' : z.slowTimer > 0 ? '#0284C7' : bp.bodyColor;
    ctx.strokeStyle = z.brittleTimer > 0 ? '#38BDF8' : bp.accentColor;
    ctx.lineWidth = z.isBoss ? 3 : 1.75;
    ctx.beginPath();
    ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Archetype visual details
    if (z.type === 'RIOT_BRUTE') {
      // Heavy ballistic riot shield in front
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(0, 0, z.radius + 3, -0.85, 0.85);
      ctx.stroke();
    } else if (z.type === 'SPITTER') {
      // Glowing toxic dorsal sacs
      ctx.fillStyle = '#A3E635';
      ctx.beginPath();
      ctx.arc(-4, -5, 4.5, 0, Math.PI * 2);
      ctx.arc(-4, 5, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.type === 'BROOD_CARRIER') {
      // Pulsing orange spore pustules
      const p = 1 + 0.15 * Math.sin(time * 8);
      ctx.fillStyle = '#FB923C';
      ctx.beginPath();
      ctx.arc(-5, -6, 5 * p, 0, Math.PI * 2);
      ctx.arc(-6, 5, 4.5 * p, 0, Math.PI * 2);
      ctx.arc(2, 0, 4 * p, 0, Math.PI * 2);
      ctx.fill();
    } else if (z.type === 'APEX_JUGGERNAUT') {
      // Heavy chitin shoulder plates & glowing core
      ctx.fillStyle = '#E879F9';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing infected eyes
    ctx.fillStyle = z.type === 'APEX_JUGGERNAUT' ? '#F0ABFC' : '#F87171';
    ctx.beginPath();
    ctx.arc(z.radius * 0.45, -3.5, 2, 0, Math.PI * 2);
    ctx.arc(z.radius * 0.45, 3.5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 3. Health Bar (always shown for damaged zombies or bosses)
    if (z.hp < z.maxHp || z.isBoss) {
      const barW = z.isBoss ? 54 : 26;
      const barH = z.isBoss ? 6 : 4;
      const bx = z.x - barW * 0.5;
      const by = z.y - z.radius - 11;
      const ratio = Math.max(0, z.hp / z.maxHp);

      ctx.fillStyle = 'rgba(9, 13, 20, 0.85)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = z.isBoss ? '#D946EF' : ratio > 0.5 ? '#10B981' : ratio > 0.25 ? '#F59E0B' : '#EF4444';
      ctx.fillRect(bx, by, barW * ratio, barH);
    }
  }
}

function drawProjectilesAndBeams(
  ctx: CanvasRenderingContext2D,
  projectiles: Projectile[],
  beams: LightningBeam[],
  _time: number
) {
  // Lightning & Railgun beams
  for (const b of beams) {
    if (b.points.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, b.alpha);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(b.points[0].x, b.points[0].y);
    for (let i = 1; i < b.points.length; i++) {
      ctx.lineTo(b.points[i].x, b.points[i].y);
    }
    ctx.stroke();

    // Bright white core
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1, b.width * 0.4);
    ctx.stroke();
    ctx.restore();
  }

  // Projectiles
  for (const p of projectiles) {
    ctx.save();
    if (p.kind === 'BULLET') {
      const angle = Math.atan2(p.vy, p.vx);
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-7, -1.8, 14, 3.6);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(2, -1, 5, 2);
    } else if (p.kind === 'MORTAR_SHELL' || p.kind === 'ACID_GLOB') {
      // Parabolic arc height visualization
      const arcHeight = Math.sin(p.progress * Math.PI) * (p.kind === 'MORTAR_SHELL' ? 68 : 36);
      const scale = 1 + Math.sin(p.progress * Math.PI) * 0.45;

      // Ground target reticle for mortar shells
      if (p.kind === 'MORTAR_SHELL') {
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.targetX, p.targetY, p.splashRadius * (0.3 + 0.7 * p.progress), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Elevated shell
      ctx.translate(p.x, p.y - arcHeight);
      ctx.scale(scale, scale);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.kind === 'MORTAR_SHELL' ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const pt of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.alpha);

    if (pt.kind === 'SHOCKWAVE') {
      const progress = 1 - pt.life / pt.maxLife;
      const radius = (pt.maxRadius || 80) * progress;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = Math.max(1, 4 * (1 - progress));
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pt.kind === 'SHELL_CASING') {
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rotation);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-2.5, -1, 5, 2);
    } else {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]) {
  for (const ft of texts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.alpha);
    ctx.font = ft.isCrit
      ? '700 14px "JetBrains Mono", monospace'
      : '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#090D14';
    ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

function drawAirstrikeReticle(ctx: CanvasRenderingContext2D, pos: Vec2, time: number) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.strokeStyle = '#EF4444';
  ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.rotate(time * 1.5);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI * 0.5);
    ctx.beginPath();
    ctx.moveTo(95, 0);
    ctx.lineTo(120, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTacticalVignette(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createRadialGradient(
    VIRTUAL_WIDTH * 0.5,
    VIRTUAL_HEIGHT * 0.5,
    VIRTUAL_WIDTH * 0.36,
    VIRTUAL_WIDTH * 0.5,
    VIRTUAL_HEIGHT * 0.5,
    VIRTUAL_WIDTH * 0.65
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(5, 8, 12, 0.52)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
}

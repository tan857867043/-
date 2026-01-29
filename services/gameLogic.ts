
import { Vector2D, Entity, Player, Enemy, Projectile, GameStateEnum, EnemyType, WeaponType, VisualEffect } from "../types";
import { WORLD_WIDTH, WORLD_HEIGHT, WEAPON_DEFAULTS, ENEMY_SPAWN_DISTANCE } from "../constants";

// Basic Vector Math
export const getDistance = (v1: Vector2D, v2: Vector2D): number => {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return Math.sqrt(dx * dx + dy * dy);
};

export const normalizeVector = (v: Vector2D): Vector2D => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
};

export const checkCollision = (e1: Entity, e2: Entity): boolean => {
    const dist = getDistance(e1.pos, e2.pos);
    return dist < (e1.radius + e2.radius);
};

// Advanced Spawning Logic
export const spawnEnemy = (playerPos: Vector2D, specificType?: EnemyType, isElite: boolean = false): Enemy => {
    const angle = Math.random() * Math.PI * 2;
    // Spawn just outside the view distance (approx 700px)
    const distance = ENEMY_SPAWN_DISTANCE + (Math.random() * 200); 
    
    let x = playerPos.x + Math.cos(angle) * distance;
    let y = playerPos.y + Math.sin(angle) * distance;

    // Clamp to World Bounds
    x = Math.max(50, Math.min(WORLD_WIDTH - 50, x));
    y = Math.max(50, Math.min(WORLD_HEIGHT - 50, y));

    // Determine type if not specified
    let type = specificType || EnemyType.PEASANT;
    if (!specificType) {
        const rand = Math.random();
        if (rand > 0.95) type = EnemyType.CHARGER;
        else if (rand > 0.90) type = EnemyType.ARCHER;
        else if (rand > 0.70) type = EnemyType.CULTIST;
    }

    // --- REBALANCED HP VALUES (Lowered for better early game flow) ---
    let hp = 30;  // Peasant (Crit kills instantly, normal ~2 hits)
    let speed = 2;
    let radius = 22; 
    let damage = 5;

    if (type === EnemyType.CULTIST) {
        hp = 80; speed = 2.5; radius = 25; damage = 10; 
    } else if (type === EnemyType.CHARGER) {
        hp = 160; speed = 1.5; radius = 30; damage = 15; // Tanky but manageable
    } else if (type === EnemyType.ARCHER) {
        hp = 45; speed = 3; radius = 20; damage = 10; // Squishy
    } else if (type === EnemyType.BOSS) {
        hp = 4000; speed = 3.5; radius = 70; damage = 30; // Boss HP halved from 8000
    }

    // Elite Modifiers
    if (isElite && type !== EnemyType.BOSS) {
        hp *= 3.5; // Multiplier
        damage *= 1.5;
        radius *= 1.3;
        speed *= 1.1;
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        pos: { x, y },
        type,
        hp,
        maxHp: hp,
        speed,
        radius,
        damage,
        rotation: 0,
        state: 'CHASING',
        stateTimer: 0,
        isElite,
        flashTimer: 0
    };
};

/**
 * Updates AI behavior for enemies
 * Returns an array of NEW projectiles fired by enemies this frame
 */
export const updateEnemyBehavior = (enemy: Enemy, player: Player, visualEffects: VisualEffect[]): Projectile[] => {
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const dir = normalizeVector({ x: dx, y: dy });
    const newProjectiles: Projectile[] = [];

    // Default Orientation
    if (dx < 0) enemy.rotation = Math.PI;
    else enemy.rotation = 0;

    // --- BOSS AI ---
    if (enemy.type === EnemyType.BOSS) {
        // Cooldown for shockwave
        if (!enemy.stateTimer) enemy.stateTimer = 180; // 3 seconds
        enemy.stateTimer--;

        if (enemy.stateTimer <= 0) {
            // Earthquake Attack
            enemy.stateTimer = 240; // Reset 4s
            visualEffects.push({
                id: Math.random().toString(),
                x: enemy.pos.x, y: enemy.pos.y,
                type: 'SHOCKWAVE',
                life: 40,
                maxLife: 40,
                radius: 10
            });
            // Spawn shockwave projectile (short life, big area)
            newProjectiles.push({
                id: Math.random().toString(),
                pos: { ...enemy.pos },
                radius: 120,
                damage: enemy.damage * 1.5,
                velocity: { x: 0, y: 0 },
                duration: 20, // instant blast
                pierce: 999,
                hitIds: new Set(),
                owner: 'ENEMY',
                rotation: 0,
                trail: [],
                visualType: 'SHOCKWAVE'
            });
        }
        
        // Standard Chase
        enemy.pos.x += dir.x * enemy.speed;
        enemy.pos.y += dir.y * enemy.speed;
    }
    // --- CHARGER AI ---
    else if (enemy.type === EnemyType.CHARGER) {
        if (enemy.state === 'CHASING') {
            // Move slowly towards player
            enemy.pos.x += dir.x * enemy.speed;
            enemy.pos.y += dir.y * enemy.speed;
            
            // Trigger charge if close enough but not too close
            if (dist < 300 && dist > 100 && Math.random() < 0.02) {
                enemy.state = 'PREPARING';
                enemy.stateTimer = 40; // 0.6s warning
                // Add warning line
                visualEffects.push({
                    id: Math.random().toString(),
                    x: enemy.pos.x, y: enemy.pos.y,
                    type: 'WARNING_LINE',
                    life: 40,
                    maxLife: 40,
                    rotation: Math.atan2(dy, dx),
                    length: 400,
                    width: 30
                });
                enemy.targetPos = { ...player.pos }; // Lock target pos
            }
        } else if (enemy.state === 'PREPARING') {
            enemy.stateTimer = (enemy.stateTimer || 0) - 1;
            // Shake effect logic handled in renderer via state
            if ((enemy.stateTimer || 0) <= 0) {
                enemy.state = 'CHARGING';
                enemy.stateTimer = 30; // 0.5s dash
            }
        } else if (enemy.state === 'CHARGING') {
            // Rush towards locked target position
            const chargeDx = (enemy.targetPos?.x || player.pos.x) - enemy.pos.x;
            const chargeDy = (enemy.targetPos?.y || player.pos.y) - enemy.pos.y;
            const chargeDir = normalizeVector({ x: chargeDx, y: chargeDy });
            
            enemy.pos.x += chargeDir.x * 12; // Very fast
            enemy.pos.y += chargeDir.y * 12;
            
            enemy.stateTimer = (enemy.stateTimer || 0) - 1;
            if ((enemy.stateTimer || 0) <= 0) {
                enemy.state = 'COOLDOWN';
                enemy.stateTimer = 60; // 1s cooldown
            }
        } else if (enemy.state === 'COOLDOWN') {
            enemy.stateTimer = (enemy.stateTimer || 0) - 1;
            if ((enemy.stateTimer || 0) <= 0) enemy.state = 'CHASING';
        }
    } 
    // --- ARCHER AI ---
    else if (enemy.type === EnemyType.ARCHER) {
        const preferredDist = 350;
        
        if (dist < 200) {
            // Run away
            enemy.pos.x -= dir.x * enemy.speed;
            enemy.pos.y -= dir.y * enemy.speed;
        } else if (dist > 400) {
            // Chase
            enemy.pos.x += dir.x * enemy.speed;
            enemy.pos.y += dir.y * enemy.speed;
        } else {
            // Circle strafe (perpendicular)
            enemy.pos.x += -dir.y * enemy.speed * 0.5;
            enemy.pos.y += dir.x * enemy.speed * 0.5;
        }

        // Shoot logic
        if (!enemy.stateTimer) enemy.stateTimer = 100 + Math.random() * 60;
        enemy.stateTimer--;
        
        if (enemy.stateTimer <= 0) {
            newProjectiles.push({
                id: Math.random().toString(),
                pos: { ...enemy.pos },
                radius: 8,
                damage: enemy.damage,
                velocity: { x: dir.x * 6, y: dir.y * 6 },
                duration: 120,
                pierce: 1,
                hitIds: new Set(),
                owner: 'ENEMY',
                rotation: Math.atan2(dir.y, dir.x),
                trail: [],
                visualType: 'ARROW'
            });
            enemy.stateTimer = 180; // Reset cooldown
        }
    }
    // --- MELEE AI ---
    else {
        enemy.pos.x += dir.x * enemy.speed;
        enemy.pos.y += dir.y * enemy.speed;
    }

    return newProjectiles;
};

export const createProjectile = (player: Player, weaponType: WeaponType, enemies: Enemy[]): Projectile[] => {
    const projectiles: Projectile[] = [];
    const weapon = player.weapons.find(w => w.type === weaponType);
    if (!weapon) return [];

    // --- DAMAGE CALCULATION ---
    let mightMultiplier = player.stats.might;
    if (player.isFrenzy) mightMultiplier *= 1.5; // 50% Damage Bonus in Frenzy

    const damage = weapon.damage * mightMultiplier;

    if (weaponType === WeaponType.PALM_STRIKE) {
        const angle = Math.random() * Math.PI * 2;
        projectiles.push({
            id: Math.random().toString(),
            pos: { ...player.pos },
            radius: 35 * weapon.area, // Larger visual radius for Palm
            damage,
            velocity: {
                x: Math.cos(angle) * 8,
                y: Math.sin(angle) * 8
            },
            duration: 60,
            pierce: 999, // Palm hits everything in path
            hitIds: new Set(),
            rotation: angle,
            owner: 'PLAYER',
            trail: [],
            visualType: 'PALM'
        });
    } else if (weaponType === WeaponType.SWORD_AURA) {
        // CHANGED: Reduced initial count. Now 1 sword at level 1.
        const count = weapon.level;
        for (let i = 0; i < count; i++) {
            projectiles.push({
                id: Math.random().toString(),
                pos: { ...player.pos },
                radius: 12,
                damage,
                velocity: { x: 0, y: 0 },
                duration: 180,
                pierce: 999,
                hitIds: new Set(),
                isOrbiting: true,
                orbitAngle: (Math.PI * 2 / count) * i,
                orbitDistance: 100 * weapon.area,
                rotation: 0,
                owner: 'PLAYER',
                trail: [],
                visualType: 'SWORD'
            });
        }
    } else if (weaponType === WeaponType.SPIRIT_DAGGER) {
        // Fires at nearest enemy, but now stores TARGET ID for continuous tracking
        let nearest: Enemy | null = null;
        let minD = 600; // Search range
        
        for (const e of enemies) {
            const d = getDistance(player.pos, e.pos);
            if (d < minD) {
                minD = d;
                nearest = e;
            }
        }

        // Even if no enemy, fire in random direction, it will try to find one later if we implemented dynamic retargeting,
        // but for now let's fire in moving direction or random if idle
        let startDx = 0;
        let startDy = 0;
        let targetId = undefined;

        if (nearest) {
            targetId = nearest.id;
            const dx = nearest.pos.x - player.pos.x;
            const dy = nearest.pos.y - player.pos.y;
            const v = normalizeVector({x: dx, y: dy});
            startDx = v.x;
            startDy = v.y;
        } else {
            // Fire in facing direction
            const rot = player.rotation || 0;
            startDx = Math.cos(rot);
            startDy = Math.sin(rot);
        }

        const speed = WEAPON_DEFAULTS[WeaponType.SPIRIT_DAGGER].speed;
        
        projectiles.push({
            id: Math.random().toString(),
            pos: { ...player.pos },
            radius: 8,
            damage: damage,
            velocity: { x: startDx * speed, y: startDy * speed },
            duration: 90, // Increased duration for chasing
            pierce: 1,
            hitIds: new Set(),
            rotation: Math.atan2(startDy, startDx), 
            owner: 'PLAYER',
            trail: [],
            visualType: 'DAGGER',
            targetId: targetId // Assign tracking target
        });
    } 
    // --- NEW WEAPONS ---
    else if (weaponType === WeaponType.KUNAI) {
        let targetAngle = player.rotation;
        
        // Try to find nearest enemy to lock on if not moving
        if (enemies.length > 0) {
             let nearest: Enemy | null = null;
             let minD = 400;
             for (const e of enemies) {
                 const d = getDistance(player.pos, e.pos);
                 if (d < minD) { minD = d; nearest = e; }
             }
             if (nearest) {
                 targetAngle = Math.atan2(nearest.pos.y - player.pos.y, nearest.pos.x - player.pos.x);
             }
        }

        const count = 3;
        const spread = 0.3; // Radians
        const speed = WEAPON_DEFAULTS[WeaponType.KUNAI].speed;

        for (let i = 0; i < count; i++) {
             const angle = targetAngle - spread + (spread * i);
             projectiles.push({
                id: Math.random().toString(),
                pos: { ...player.pos },
                radius: 6,
                damage: damage * 0.8, 
                velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
                duration: 40, 
                pierce: 1,
                hitIds: new Set(),
                rotation: angle, 
                owner: 'PLAYER',
                trail: [],
                visualType: 'KUNAI'
             });
        }
    } else if (weaponType === WeaponType.BLADE) {
        // Massive slow moving slash in front
        const angle = player.rotation === Math.PI ? Math.PI : 0;
        const speed = WEAPON_DEFAULTS[WeaponType.BLADE].speed;
        
        projectiles.push({
            id: Math.random().toString(),
            pos: { x: player.pos.x + (Math.cos(angle) * 30), y: player.pos.y },
            radius: 40 * weapon.area,
            damage: damage * 1.5,
            velocity: { x: Math.cos(angle) * speed, y: 0 },
            duration: 25, 
            pierce: 999,
            hitIds: new Set(),
            rotation: angle, // For blade, rotation aligns with movement direction (0 or PI)
            owner: 'PLAYER',
            trail: [],
            visualType: 'SLASH'
        });
    } else if (weaponType === WeaponType.GUQIN) {
        // Drops stationary "mines" (Notes) randomly nearby
        const count = 2;
        for(let i=0; i<count; i++) {
            const range = 150 * weapon.area;
            const rx = (Math.random() - 0.5) * range;
            const ry = (Math.random() - 0.5) * range;
            
            projectiles.push({
                id: Math.random().toString(),
                pos: { x: player.pos.x + rx, y: player.pos.y + ry },
                radius: 30, // Area size
                damage: damage,
                velocity: { x: 0, y: 0 },
                duration: WEAPON_DEFAULTS[WeaponType.GUQIN].duration,
                pierce: 3, 
                hitIds: new Set(),
                rotation: 0,
                owner: 'PLAYER',
                visualType: 'NOTE'
            });
        }
    } else if (weaponType === WeaponType.STAFF) {
        // Large orbiting stick, slow
        const dist = 60 * weapon.area;
        projectiles.push({
             id: Math.random().toString(),
             pos: { ...player.pos },
             radius: 15,
             damage: damage,
             velocity: { x: 0, y: 0 },
             duration: WEAPON_DEFAULTS[WeaponType.STAFF].duration,
             pierce: 999,
             hitIds: new Set(),
             isOrbiting: true,
             orbitAngle: 0,
             orbitDistance: dist,
             rotation: 0,
             owner: 'PLAYER',
             trail: [],
             visualType: 'STAFF'
        });
        // Opposite end of staff
        projectiles.push({
             id: Math.random().toString(),
             pos: { ...player.pos },
             radius: 15,
             damage: damage,
             velocity: { x: 0, y: 0 },
             duration: WEAPON_DEFAULTS[WeaponType.STAFF].duration,
             pierce: 999,
             hitIds: new Set(),
             isOrbiting: true,
             orbitAngle: Math.PI,
             orbitDistance: dist,
             rotation: 0,
             owner: 'PLAYER',
             trail: [],
             visualType: 'STAFF'
        });
    }


    return projectiles;
};


import { Vector2D, Entity, Player, Enemy, Projectile, GameStateEnum, EnemyType, WeaponType, VisualEffect } from "../types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, WEAPON_DEFAULTS } from "../constants";

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
    const distance = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) / 1.5 + 50; 
    
    const x = playerPos.x + Math.cos(angle) * distance;
    const y = playerPos.y + Math.sin(angle) * distance;

    // Determine type if not specified
    let type = specificType || EnemyType.PEASANT;
    if (!specificType) {
        const rand = Math.random();
        if (rand > 0.95) type = EnemyType.CHARGER;
        else if (rand > 0.90) type = EnemyType.ARCHER;
        else if (rand > 0.70) type = EnemyType.CULTIST;
    }

    let hp = 30; 
    let speed = 2;
    let radius = 22; 
    let damage = 5;

    if (type === EnemyType.CULTIST) {
        hp = 60; speed = 2.5; radius = 25; damage = 10;
    } else if (type === EnemyType.CHARGER) {
        hp = 80; speed = 1.5; radius = 30; damage = 15; // Slow normal speed, fast charge
    } else if (type === EnemyType.ARCHER) {
        hp = 40; speed = 3; radius = 20; damage = 10;
    } else if (type === EnemyType.BOSS) {
        hp = 1200; speed = 3.5; radius = 60; damage = 30;
    }

    // Elite Modifiers
    if (isElite && type !== EnemyType.BOSS) {
        hp *= 4;
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
        isElite
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
                rotation: 0
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
                rotation: Math.atan2(dir.y, dir.x)
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

    const damage = weapon.damage * player.stats.might;

    if (weaponType === WeaponType.PALM_STRIKE) {
        const angle = Math.random() * Math.PI * 2;
        projectiles.push({
            id: Math.random().toString(),
            pos: { ...player.pos },
            radius: 25 * weapon.area,
            damage,
            velocity: {
                x: Math.cos(angle) * 8,
                y: Math.sin(angle) * 8
            },
            duration: 60,
            pierce: 1,
            hitIds: new Set(),
            rotation: angle,
            owner: 'PLAYER'
        });
    } else if (weaponType === WeaponType.SWORD_AURA) {
        const count = 3 + weapon.level;
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
                owner: 'PLAYER'
            });
        }
    } else if (weaponType === WeaponType.SPIRIT_DAGGER) {
        // Fires at nearest enemy
        let nearest: Enemy | null = null;
        let minD = 500; // range
        
        for (const e of enemies) {
            const d = getDistance(player.pos, e.pos);
            if (d < minD) {
                minD = d;
                nearest = e;
            }
        }

        if (nearest) {
            const dx = nearest.pos.x - player.pos.x;
            const dy = nearest.pos.y - player.pos.y;
            const v = normalizeVector({x: dx, y: dy});
            const speed = WEAPON_DEFAULTS[WeaponType.SPIRIT_DAGGER].speed;
            
            projectiles.push({
                id: Math.random().toString(),
                pos: { ...player.pos },
                radius: 8,
                damage: damage,
                velocity: { x: v.x * speed, y: v.y * speed },
                duration: 60,
                pierce: 1,
                hitIds: new Set(),
                rotation: Math.atan2(v.y, v.x) + Math.PI/4,
                owner: 'PLAYER'
            });
        }
    }

    return projectiles;
};


import { Vector2D, Entity, Player, Enemy, Projectile, GameStateEnum, EnemyType, WeaponType } from "../types";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../constants";

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

// Spawning Logic
export const spawnEnemy = (playerPos: Vector2D, type: EnemyType = EnemyType.PEASANT): Enemy => {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) / 1.5 + 50; // Spawn just off-screen
    
    const x = playerPos.x + Math.cos(angle) * distance;
    const y = playerPos.y + Math.sin(angle) * distance;

    // Increased sizes
    let hp = 30; // Slightly more HP since they are easier to hit
    let speed = 2;
    let radius = 22; // Was 15
    let damage = 5;

    if (type === EnemyType.CULTIST) {
        hp = 60;
        speed = 2.5;
        radius = 30; // Was 20
        damage = 10;
    } else if (type === EnemyType.BOSS) {
        hp = 1200;
        speed = 3.5;
        radius = 60; // Was 40 - Big BOSS
        damage = 30;
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
        rotation: 0
    };
};

export const createProjectile = (player: Player, weaponType: WeaponType): Projectile[] => {
    const projectiles: Projectile[] = [];
    const weapon = player.weapons.find(w => w.type === weaponType);
    if (!weapon) return [];

    const damage = weapon.damage * player.stats.might;

    if (weaponType === WeaponType.PALM_STRIKE) {
        // Shoot nearest enemy direction or random
        const angle = Math.random() * Math.PI * 2;
        projectiles.push({
            id: Math.random().toString(),
            pos: { ...player.pos },
            radius: 25 * weapon.area, // Was 20
            damage,
            velocity: {
                x: Math.cos(angle) * 8,
                y: Math.sin(angle) * 8
            },
            duration: 60, // 1 sec
            pierce: 1,
            hitIds: new Set(),
            rotation: angle
        });
    } else if (weaponType === WeaponType.SWORD_AURA) {
        // Create orbiting swords
        const count = 3 + weapon.level; // More swords at higher level
        for (let i = 0; i < count; i++) {
            projectiles.push({
                id: Math.random().toString(),
                pos: { ...player.pos }, // Position updated in loop
                radius: 12, // Was 10
                damage,
                velocity: { x: 0, y: 0 },
                duration: 180, // 3 seconds
                pierce: 999,
                hitIds: new Set(),
                isOrbiting: true,
                orbitAngle: (Math.PI * 2 / count) * i,
                orbitDistance: 100 * weapon.area, // Increased from 80
                rotation: 0
            });
        }
    }

    return projectiles;
};

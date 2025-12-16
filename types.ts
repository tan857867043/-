
// Game States
export enum GameStateEnum {
    MENU = 'MENU',
    PLAYING = 'PLAYING',
    PAUSED = 'PAUSED',
    LEVEL_UP = 'LEVEL_UP',
    GAME_OVER = 'GAME_OVER',
    ASSET_GEN = 'ASSET_GEN'
}

// Art Styles
export enum ArtStyle {
    INK = 'INK',
    ANIME = 'ANIME',
    PIXEL = 'PIXEL',
    OIL = 'OIL'
}

// Vector Utility
export interface Vector2D {
    x: number;
    y: number;
}

// Entities
export interface Entity {
    id: string;
    pos: Vector2D;
    radius: number;
    color?: string; // Fallback color
    sprite?: string; // Base64 image
    rotation: number;
}

export interface Player extends Entity {
    hp: number;
    maxHp: number;
    speed: number;
    exp: number;
    level: number;
    nextLevelExp: number;
    bloodEssence: number; // For Frenzy
    maxBloodEssence: number;
    isFrenzy: boolean;
    frenzyTimer: number;
    stats: PlayerStats;
    weapons: Weapon[];
}

export interface PlayerStats {
    might: number; // Damage multiplier
    cooldown: number; // Cooldown reduction
    area: number; // Area of effect
    speed: number; // Move speed
    magnet: number; // Pickup range
}

export enum EnemyType {
    PEASANT = 'PEASANT', // Weak
    CULTIST = 'CULTIST', // Medium
    BOSS = 'BOSS' // Hard
}

export interface Enemy extends Entity {
    type: EnemyType;
    hp: number;
    maxHp: number;
    damage: number;
    speed: number;
}

export interface Projectile extends Entity {
    damage: number;
    velocity: Vector2D;
    duration: number; // Frames remaining
    pierce: number; // How many enemies it can hit
    hitIds: Set<string>; // IDs of enemies already hit
    isOrbiting?: boolean; // For rotating shields/swords
    orbitAngle?: number;
    orbitDistance?: number;
}

export interface Drop extends Entity {
    value: number; // XP amount
    type: 'BLOOD' | 'HEALTH' | 'CHEST';
}

// Skills & Weapons
export enum WeaponType {
    SWORD_AURA = 'SWORD_AURA', // Orbiting swords
    PALM_STRIKE = 'PALM_STRIKE', // Projectile forward
    SOUND_WAVE = 'SOUND_WAVE', // Area pulse
}

export interface Weapon {
    type: WeaponType;
    level: number;
    cooldownTimer: number;
    baseCooldown: number;
    damage: number;
    area: number;
}

export interface UpgradeOption {
    id: string;
    name: string;
    description: string;
    rarity: 'COMMON' | 'RARE' | 'LEGENDARY';
    type: 'WEAPON' | 'STAT';
    weaponType?: WeaponType;
    statType?: keyof PlayerStats;
    value?: number;
    icon?: string;
}

// Visual Effects
export interface DamageText {
    id: string;
    x: number;
    y: number;
    damage: number;
    life: number; // Frames to live
    maxLife: number;
    velocity: Vector2D;
    isCrit: boolean;
}

export interface VisualEffect {
    id: string;
    x: number;
    y: number;
    type: 'DASH_GHOST' | 'HIT_SPARK';
    life: number;
    rotation?: number;
    sprite?: string;
    scaleX?: number;
}

// Asset Generation
export interface GeneratedAssets {
    currentStyle: ArtStyle; // Track style for rendering modes
    player: string | null;
    enemyPeasant: string | null;
    enemyBoss: string | null;
    background: string | null;
    projectileSword: string | null;
}

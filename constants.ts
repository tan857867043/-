
import { WeaponType, GeneratedAssets, ArtStyle } from "./types";
import { DEFAULT_STYLES } from "./assets/defaultAssets";

export const CANVAS_WIDTH = 800; // Deprecated for logic, kept for ref if needed
export const CANVAS_HEIGHT = 1200;

export const WORLD_WIDTH = 5000; // Massive Game World
export const WORLD_HEIGHT = 5000;

export const PLAYER_BASE_SPEED = 5; 
export const PLAYER_BASE_HP = 100;
export const PLAYER_PICKUP_RANGE = 160; 
export const PLAYER_DASH_COOLDOWN = 60; 

// Spawn logic needs to be relative to view. Increased for full screen support.
export const ENEMY_SPAWN_DISTANCE = 1200; // Increased from 700 to 1200
export const ENEMY_SPAWN_RATE = 20; 
export const MAX_ENEMIES = 300; 

export const FRENZY_THRESHOLD = 100;
export const FRENZY_DRAIN_RATE = 0.5; 
export const FRENZY_DURATION = 600; 

export const WEAPON_DEFAULTS = {
    [WeaponType.SWORD_AURA]: {
        cooldown: 60,
        damage: 15,
        area: 1,
        duration: 120
    },
    [WeaponType.PALM_STRIKE]: {
        cooldown: 45,
        damage: 30,
        area: 1,
        speed: 8
    },
    [WeaponType.SOUND_WAVE]: {
        cooldown: 120,
        damage: 10,
        area: 150
    },
    [WeaponType.GOLDEN_BELL]: {
        cooldown: 0, 
        damage: 5,
        area: 100, 
        tickRate: 15 
    },
    [WeaponType.SPIRIT_DAGGER]: {
        cooldown: 30, 
        damage: 20,
        area: 1,
        speed: 12
    },
    [WeaponType.KUNAI]: {
        cooldown: 40,
        damage: 12,
        area: 1,
        speed: 15
    },
    [WeaponType.GUQIN]: {
        cooldown: 90,
        damage: 40, 
        area: 1,
        duration: 300 
    },
    [WeaponType.BLADE]: {
        cooldown: 50,
        damage: 50, 
        area: 1,
        speed: 6 
    },
    [WeaponType.STAFF]: {
        cooldown: 80,
        damage: 25,
        area: 1,
        duration: 60 
    }
};

export const COLORS = {
    inkBlack: '#1a1a1a',
    paper: '#f5f5f0',
    bloodRed: '#991b1b',
    gold: '#d97706',
    uiBg: 'rgba(0,0,0,0.85)'
};

// Define the type for the asset library structure
export type AssetLibrary = Record<string, GeneratedAssets>;

// Export the full library
export const ASSET_LIBRARY: AssetLibrary = DEFAULT_STYLES as unknown as AssetLibrary;

// Default start is INK
export const DEFAULT_ASSETS: GeneratedAssets = ASSET_LIBRARY[ArtStyle.INK];

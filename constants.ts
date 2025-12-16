
import { WeaponType, GeneratedAssets, ArtStyle } from "./types";

export const CANVAS_WIDTH = 800; // Virtual resolution
export const CANVAS_HEIGHT = 1200;

export const PLAYER_BASE_SPEED = 4;
export const PLAYER_BASE_HP = 100;
export const PLAYER_PICKUP_RANGE = 100;

export const ENEMY_SPAWN_RATE = 30; // Frames between spawns (lowered dynamically)
export const MAX_ENEMIES = 120; // Reduced from 300 to avoid overcrowding with larger sprites

export const FRENZY_THRESHOLD = 100;
export const FRENZY_DRAIN_RATE = 0.5; // HP drained per frame in frenzy
export const FRENZY_DURATION = 600; // Frames (10 seconds)

export const WEAPON_DEFAULTS = {
    [WeaponType.SWORD_AURA]: {
        cooldown: 60,
        damage: 15,
        area: 1,
        duration: 120
    },
    [WeaponType.PALM_STRIKE]: {
        cooldown: 40,
        damage: 25,
        area: 1,
        speed: 8
    },
    [WeaponType.SOUND_WAVE]: {
        cooldown: 120,
        damage: 10,
        area: 150
    }
};

export const COLORS = {
    inkBlack: '#1a1a1a',
    paper: '#f5f5f0',
    bloodRed: '#991b1b',
    gold: '#d97706',
    uiBg: 'rgba(0,0,0,0.85)'
};

// Default Ink Style SVG Assets (Converted to Data URIs)
const SVG_PLAYER = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cstyle%3E.ink{fill:%231a1a1a;filter:url(%23blur);}.white{fill:%23f5f5f5;}%3C/style%3E%3Cdefs%3E%3Cfilter id='blur'%3E%3CfeGaussianBlur stdDeviation='0.5'/%3E%3C/filter%3E%3C/defs%3E%3C!-- Body --%3E%3Cpath class='white' d='M30,80 Q20,90 40,95 L60,95 Q80,90 70,80 Q75,40 50,30 Q25,40 30,80 Z' /%3E%3C!-- Ink Robe Outline --%3E%3Cpath class='ink' d='M45,30 Q20,40 25,85 L35,85 Q30,50 45,40 Z' opacity='0.8'/%3E%3Cpath class='ink' d='M55,30 Q80,40 75,85 L65,85 Q70,50 55,40 Z' opacity='0.8'/%3E%3C!-- Head --%3E%3Ccircle cx='50' cy='25' r='12' class='white' /%3E%3C!-- Hair --%3E%3Cpath class='ink' d='M38,20 Q50,5 62,20 Q65,30 62,35 Q50,40 38,35 Q35,30 38,20 Z' /%3E%3C!-- Headband --%3E%3Cpath fill='%232563eb' d='M38,20 Q50,18 62,20 L62,24 Q50,22 38,24 Z' /%3E%3C!-- Sword --%3E%3Cpath fill='%2394a3b8' d='M70,40 L90,10 L95,15 L75,45 Z' /%3E%3Cpath fill='%231a1a1a' d='M72,42 L68,48 L74,52 L78,46 Z' /%3E%3C/svg%3E`;

const SVG_ENEMY = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3Cfilter id='rough'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.1' numOctaves='2' result='noise'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='noise' scale='5' /%3E%3C/filter%3E%3C/defs%3E%3Cg filter='url(%23rough)'%3E%3C!-- Body --%3E%3Cpath fill='%231a1a1a' d='M40,40 Q20,50 30,90 L70,90 Q80,50 60,40 Q50,30 40,40 Z' /%3E%3C!-- Mask/Face --%3E%3Ccircle cx='50' cy='35' r='15' fill='%23f5f5f5' /%3E%3Ccircle cx='45' cy='32' r='3' fill='%23ef4444' /%3E%3Ccircle cx='55' cy='32' r='3' fill='%23ef4444' /%3E%3Cpath d='M45,42 Q50,45 55,42' stroke='%231a1a1a' stroke-width='2' fill='none'/%3E%3C/g%3E%3C/svg%3E`;

const SVG_BOSS = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3Cfilter id='glow'%3E%3CfeGaussianBlur stdDeviation='2' result='coloredBlur'/%3E%3CfeMerge%3E%3CfeMergeNode in='coloredBlur'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3C!-- Aura --%3E%3Ccircle cx='50' cy='50' r='45' fill='%237f1d1d' opacity='0.3' filter='url(%23glow)' /%3E%3C!-- Armor --%3E%3Cpath fill='%23450a0a' d='M20,90 L30,40 L15,30 L35,25 L50,10 L65,25 L85,30 L70,40 L80,90 Z' /%3E%3C!-- Eyes --%3E%3Cpath fill='%23fbbf24' d='M40,35 L45,40 L40,45 Z' /%3E%3Cpath fill='%23fbbf24' d='M60,35 L55,40 L60,45 Z' /%3E%3C!-- Weapon --%3E%3Crect x='80' y='20' width='10' height='80' fill='%23525252' transform='rotate(15 85 60)' /%3E%3C/svg%3E`;

const SVG_BG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect width='100%25' height='100%25' fill='%23f0f0eb'/%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' result='noise'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.1 0' in='noise' result='coloredNoise'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E`;

const SVG_SWORD = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cfilter id='glow'%3E%3CfeGaussianBlur stdDeviation='2' result='coloredBlur'/%3E%3CfeMerge%3E%3CfeMergeNode in='coloredBlur'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3Cg transform='rotate(45 50 50)'%3E%3Crect x='45' y='10' width='10' height='60' fill='%23e0f2fe' filter='url(%23glow)' /%3E%3Crect x='48' y='10' width='4' height='60' fill='%2338bdf8' /%3E%3Crect x='40' y='70' width='20' height='5' fill='%231e293b' /%3E%3Crect x='47' y='75' width='6' height='15' fill='%231e293b' /%3E%3C/g%3E%3C/svg%3E`;

export const DEFAULT_ASSETS: GeneratedAssets = {
    currentStyle: ArtStyle.INK,
    player: SVG_PLAYER,
    enemyPeasant: SVG_ENEMY,
    enemyBoss: SVG_BOSS,
    background: SVG_BG,
    projectileSword: SVG_SWORD
};

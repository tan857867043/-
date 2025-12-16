
import { WeaponType, GeneratedAssets, ArtStyle } from "./types";

export const CANVAS_WIDTH = 800; // Virtual resolution
export const CANVAS_HEIGHT = 1200;

export const PLAYER_BASE_SPEED = 4;
export const PLAYER_BASE_HP = 100;
export const PLAYER_PICKUP_RANGE = 100;
export const PLAYER_DASH_COOLDOWN = 60; // Frames (1 second)

export const ENEMY_SPAWN_RATE = 30; // Frames between spawns (lowered dynamically)
export const MAX_ENEMIES = 150; // Increased limit slightly

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
        cooldown: 0, // Persistent, damage ticks handled internally
        damage: 5,
        area: 100, // Radius
        tickRate: 15 // Frames between damage ticks
    },
    [WeaponType.SPIRIT_DAGGER]: {
        cooldown: 30, // Fast fire rate
        damage: 20,
        area: 1,
        speed: 12
    }
};

export const COLORS = {
    inkBlack: '#1a1a1a',
    paper: '#f5f5f0',
    bloodRed: '#991b1b',
    gold: '#d97706',
    uiBg: 'rgba(0,0,0,0.85)'
};

// --- PROCEDURAL SVG ASSETS (SIMULATED AI INK STYLE) ---

// Smoother ink filter, less noise, more flow
const INK_FILTER = `<filter id='ink' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='0.02' numOctaves='2' result='noise'/><feDisplacementMap in='SourceGraphic' in2='noise' scale='4'/></filter>`;

const GLOW_FILTER = `<filter id='glow' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='4' result='coloredBlur'/><feMerge><feMergeNode in='coloredBlur'/><feMergeNode in='SourceGraphic'/></feMerge></filter>`;

// Player: White Robe Swordsman with Straw Hat (2 Frames)
const SVG_PLAYER = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Cdefs%3E${INK_FILTER}%3C/defs%3E%3C!-- Frame 1: Standing --%3E%3Cg filter='url(%23ink)'%3E%3C!-- Robe Bottom --%3E%3Cpath d='M70,140 Q60,180 50,195 L150,195 Q140,180 130,140 Z' fill='%23e5e5e5' stroke='%231a1a1a' stroke-width='2'/%3E%3C!-- Torso --%3E%3Cpath d='M80,60 Q70,140 70,140 L130,140 Q130,140 120,60 Z' fill='%23f5f5f5' stroke='%231a1a1a' stroke-width='2'/%3E%3C!-- Blue Sash --%3E%3Cpath d='M75,110 L125,110 L130,125 L70,125 Z' fill='%231e3a8a'/%3E%3C!-- Flowing Scarf --%3E%3Cpath d='M90,60 Q50,60 30,80' stroke='%23e5e5e5' stroke-width='6' fill='none'/%3E%3C!-- Hat (Cone) --%3E%3Cpath d='M60,55 L140,55 L100,25 Z' fill='%23262626' stroke='%23000' stroke-width='2'/%3E%3C!-- Sword Handle --%3E%3Cpath d='M130,80 L160,50' stroke='%23525252' stroke-width='4'/%3E%3C/g%3E%3C!-- Frame 2: Running (Leaning forward, robe flowing) --%3E%3Cg transform='translate(200, 0)' filter='url(%23ink)'%3E%3C!-- Robe Bottom (Wider stance) --%3E%3Cpath d='M60,140 Q40,180 30,190 L160,195 Q170,180 140,140 Z' fill='%23e5e5e5' stroke='%231a1a1a' stroke-width='2'/%3E%3C!-- Torso (Leaning) --%3E%3Cpath d='M85,65 Q70,140 60,140 L140,140 Q150,140 125,65 Z' fill='%23f5f5f5' stroke='%231a1a1a' stroke-width='2'/%3E%3C!-- Blue Sash --%3E%3Cpath d='M70,115 L135,115 L135,125 L65,125 Z' fill='%231e3a8a'/%3E%3C!-- Flowing Scarf (Higher) --%3E%3Cpath d='M95,65 Q50,50 20,60' stroke='%23e5e5e5' stroke-width='6' fill='none'/%3E%3C!-- Hat --%3E%3Cpath d='M65,60 L145,60 L105,30 Z' fill='%23262626' stroke='%23000' stroke-width='2'/%3E%3C!-- Sword Handle --%3E%3Cpath d='M135,85 L165,55' stroke='%23525252' stroke-width='4'/%3E%3C/g%3E%3C/svg%3E`;

// Enemy 1: Peasant - Blood Puppet (Hunched, ragged, sickle)
const SVG_ENEMY_PEASANT = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Cdefs%3E${INK_FILTER}%3C/defs%3E%3C!-- Frame 1 --%3E%3Cg filter='url(%23ink)'%3E%3Cpath d='M80,80 Q60,130 70,190 L130,190 Q140,130 120,80 Q100,60 80,80' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='70' r='25' fill='%231a1a1a'/%3E%3Ccircle cx='92' cy='70' r='3' fill='%23dc2626'/%3E%3Ccircle cx='108' cy='70' r='3' fill='%23dc2626'/%3E%3Cpath d='M80,100 L50,140' stroke='%231a1a1a' stroke-width='8' stroke-linecap='round'/%3E%3Cpath d='M120,100 L150,140' stroke='%231a1a1a' stroke-width='8' stroke-linecap='round'/%3E%3Cpath d='M150,140 Q170,120 160,110' stroke='%237f1d1d' stroke-width='4' fill='none'/%3E%3C/g%3E%3C!-- Frame 2 --%3E%3Cg transform='translate(200, 0)' filter='url(%23ink)'%3E%3Cpath d='M80,85 Q60,135 70,195 L130,195 Q140,135 120,85 Q100,65 80,85' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='75' r='25' fill='%231a1a1a'/%3E%3Ccircle cx='92' cy='75' r='3' fill='%23dc2626'/%3E%3Ccircle cx='108' cy='75' r='3' fill='%23dc2626'/%3E%3Cpath d='M80,105 L40,135' stroke='%231a1a1a' stroke-width='8' stroke-linecap='round'/%3E%3Cpath d='M120,105 L160,135' stroke='%231a1a1a' stroke-width='8' stroke-linecap='round'/%3E%3Cpath d='M160,135 Q180,115 170,105' stroke='%237f1d1d' stroke-width='4' fill='none'/%3E%3C/g%3E%3C/svg%3E`;

// Enemy 2: Cultist - Tall hat, robes, staff (Tall and thin)
const SVG_ENEMY_CULTIST = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Cdefs%3E${INK_FILTER}%3C/defs%3E%3C!-- Frame 1 --%3E%3Cg filter='url(%23ink)'%3E%3Cpath d='M80,70 L60,190 L140,190 L120,70 Z' fill='%234c1d95'/%3E%3Cpath d='M85,50 L115,10 L145,50 Z' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='60' r='20' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='60' r='8' fill='%23a855f7'/%3E%3Cpath d='M130,80 L160,120 L160,40' stroke='%231a1a1a' stroke-width='4' fill='none'/%3E%3C/g%3E%3C!-- Frame 2 --%3E%3Cg transform='translate(200, 0)' filter='url(%23ink)'%3E%3Cpath d='M80,75 L55,195 L145,195 L120,75 Z' fill='%234c1d95'/%3E%3Cpath d='M85,55 L115,15 L145,55 Z' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='65' r='20' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='65' r='8' fill='%23a855f7'/%3E%3Cpath d='M130,85 L160,125 L160,45' stroke='%231a1a1a' stroke-width='4' fill='none'/%3E%3C/g%3E%3C/svg%3E`;

// Enemy 3: Charger - Beast/Boar like, bulky, low to ground
const SVG_ENEMY_CHARGER = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Cdefs%3E${INK_FILTER}%3C/defs%3E%3C!-- Frame 1 --%3E%3Cg filter='url(%23ink)'%3E%3Cellipse cx='100' cy='130' rx='60' ry='40' fill='%233f3f46'/%3E%3Cpath d='M150,130 L180,140 L160,110 Z' fill='%23e5e5e5'/%3E%3Ccircle cx='140' cy='110' r='5' fill='%23dc2626'/%3E%3Cpath d='M60,160 L50,190' stroke='%231a1a1a' stroke-width='8'/%3E%3Cpath d='M140,160 L150,190' stroke='%231a1a1a' stroke-width='8'/%3E%3C/g%3E%3C!-- Frame 2 --%3E%3Cg transform='translate(200, 0)' filter='url(%23ink)'%3E%3Cellipse cx='100' cy='135' rx='60' ry='40' fill='%233f3f46'/%3E%3Cpath d='M150,135 L180,145 L160,115 Z' fill='%23e5e5e5'/%3E%3Ccircle cx='140' cy='115' r='5' fill='%23dc2626'/%3E%3Cpath d='M60,165 L70,190' stroke='%231a1a1a' stroke-width='8'/%3E%3Cpath d='M140,165 L130,190' stroke='%231a1a1a' stroke-width='8'/%3E%3C/g%3E%3C/svg%3E`;

// Enemy 4: Archer - Lean, holding bow
const SVG_ENEMY_ARCHER = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Cdefs%3E${INK_FILTER}%3C/defs%3E%3C!-- Frame 1 --%3E%3Cg filter='url(%23ink)'%3E%3Cpath d='M80,80 L70,180 L130,180 L120,80 Z' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='60' r='20' fill='%231a1a1a'/%3E%3Cpath d='M140,60 Q180,100 140,140' stroke='%2378350f' stroke-width='4' fill='none'/%3E%3Cpath d='M140,60 L140,140' stroke='%23d1d5db' stroke-width='1'/%3E%3Cpath d='M100,80 L140,100' stroke='%231a1a1a' stroke-width='6'/%3E%3C/g%3E%3C!-- Frame 2 --%3E%3Cg transform='translate(200, 0)' filter='url(%23ink)'%3E%3Cpath d='M80,85 L75,185 L125,185 L120,85 Z' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='65' r='20' fill='%231a1a1a'/%3E%3Cpath d='M140,65 Q180,105 140,145' stroke='%2378350f' stroke-width='4' fill='none'/%3E%3Cpath d='M140,65 L140,145' stroke='%23d1d5db' stroke-width='1'/%3E%3Cpath d='M100,85 L150,105' stroke='%231a1a1a' stroke-width='6'/%3E%3C/g%3E%3C/svg%3E`;

// Boss: Demon General (Bulky Armor)
const SVG_BOSS = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='300' viewBox='0 0 600 300'%3E%3Cdefs%3E${INK_FILTER}${GLOW_FILTER}%3C/defs%3E%3C!-- Frame 1 --%3E%3Cg%3E%3C!-- Aura --%3E%3Ccircle cx='150' cy='150' r='110' fill='%23450a0a' opacity='0.4' filter='url(%23glow)'/%3E%3Cg filter='url(%23ink)'%3E%3C!-- Cape --%3E%3Cpath d='M80,100 L60,280 L240,280 L220,100' fill='%23262626'/%3E%3C!-- Body Armor --%3E%3Cpath d='M100,100 L200,100 L180,250 L120,250 Z' fill='%231a1a1a' stroke='%237f1d1d' stroke-width='2'/%3E%3C!-- Shoulder Pads --%3E%3Cpath d='M80,110 L110,80 L120,110 Z' fill='%237f1d1d'/%3E%3Cpath d='M220,110 L190,80 L180,110 Z' fill='%237f1d1d'/%3E%3C!-- Head (Helmet) --%3E%3Cpath d='M125,50 L175,50 L175,90 L125,90 Z' fill='%231a1a1a'/%3E%3Cpath d='M135,40 L145,10 L155,40' fill='%23f59e0b'/%3E%3C!-- Eyes --%3E%3Ccircle cx='140' cy='70' r='5' fill='%23f59e0b' filter='url(%23glow)'/%3E%3Ccircle cx='160' cy='70' r='5' fill='%23f59e0b' filter='url(%23glow)'/%3E%3C!-- Weapon (Greatsword) --%3E%3Cpath d='M220,100 L260,20 L270,30 L240,250' fill='%23404040'/%3E%3C/g%3E%3C/g%3E%3C!-- Frame 2 --%3E%3Cg transform='translate(300, 0)'%3E%3C!-- Aura --%3E%3Ccircle cx='150' cy='150' r='115' fill='%237f1d1d' opacity='0.5' filter='url(%23glow)'/%3E%3Cg filter='url(%23ink)'%3E%3C!-- Cape (Moved) --%3E%3Cpath d='M70,100 L50,285 L250,285 L230,100' fill='%23262626'/%3E%3C!-- Body Armor --%3E%3Cpath d='M100,105 L200,105 L180,255 L120,255 Z' fill='%231a1a1a' stroke='%237f1d1d' stroke-width='2'/%3E%3C!-- Shoulder Pads --%3E%3Cpath d='M80,115 L110,85 L120,115 Z' fill='%237f1d1d'/%3E%3Cpath d='M220,115 L190,85 L180,115 Z' fill='%237f1d1d'/%3E%3C!-- Head --%3E%3Cpath d='M125,55 L175,55 L175,95 L125,95 Z' fill='%231a1a1a'/%3E%3Cpath d='M135,45 L145,15 L155,45' fill='%23f59e0b'/%3E%3C!-- Eyes --%3E%3Ccircle cx='140' cy='75' r='5' fill='%23f59e0b' filter='url(%23glow)'/%3E%3Ccircle cx='160' cy='75' r='5' fill='%23f59e0b' filter='url(%23glow)'/%3E%3C!-- Weapon --%3E%3Cpath d='M220,105 L260,25 L270,35 L240,255' fill='%23404040'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E`;

// Background: Paper Texture with Ink Mountains
const SVG_BG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' result='noise'/%3E%3CfeDiffuseLighting in='noise' lighting-color='%23e5e5e0' surfaceScale='2'%3E%3CfeDistantLight azimuth='45' elevation='60'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3Cg opacity='0.1'%3E%3Cpath d='M0,400 Q100,300 200,450 T400,380 T512,420 V512 H0 Z' fill='%23000' filter='url(%23paper)'/%3E%3Cpath d='M200,300 Q300,200 400,350 T512,300 V512 H200 Z' fill='%23000' filter='url(%23paper)'/%3E%3C/g%3E%3C/svg%3E`;

// Projectile: Flying Sword
// FIXED: Added width='100' height='100'
const SVG_SWORD = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cdefs%3E${GLOW_FILTER}%3C/defs%3E%3Cg transform='rotate(45 50 50)'%3E%3C!-- Glow --%3E%3Crect x='42' y='10' width='16' height='80' fill='%230ea5e9' opacity='0.5' filter='url(%23glow)'/%3E%3C!-- Blade --%3E%3Cpath d='M48,10 L52,10 L52,70 L48,70 Z' fill='%23e0f2fe'/%3E%3C!-- Handle --%3E%3Crect x='45' y='70' width='10' height='5' fill='%231e293b'/%3E%3Crect x='48' y='75' width='4' height='10' fill='%231e293b'/%3E%3C/g%3E%3C/svg%3E`;

export const DEFAULT_ASSETS: GeneratedAssets = {
    currentStyle: ArtStyle.INK,
    player: SVG_PLAYER,
    enemyPeasant: SVG_ENEMY_PEASANT,
    enemyCultist: SVG_ENEMY_CULTIST,
    enemyCharger: SVG_ENEMY_CHARGER,
    enemyArcher: SVG_ENEMY_ARCHER,
    enemyBoss: SVG_BOSS,
    background: SVG_BG,
    projectileSword: SVG_SWORD
};

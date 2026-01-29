
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameStateEnum, Player, Enemy, Projectile, Drop, Vector2D, WeaponType, GeneratedAssets, EnemyType, DamageText, VisualEffect, ArtStyle } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_BASE_SPEED, ENEMY_SPAWN_RATE, MAX_ENEMIES, WEAPON_DEFAULTS, FRENZY_THRESHOLD, FRENZY_DRAIN_RATE, PLAYER_PICKUP_RANGE, PLAYER_DASH_COOLDOWN } from '../constants';
import { spawnEnemy, createProjectile, checkCollision, normalizeVector, getDistance, updateEnemyBehavior } from '../services/gameLogic';
import Joystick from './Joystick';
import { audioManager } from '../services/audioService';

interface GameCanvasProps {
    gameState: GameStateEnum;
    setGameState: (state: GameStateEnum) => void;
    onLevelUp: (player: Player) => void;
    onGameOver: (score: number) => void;
    assets: GeneratedAssets;
    playerRef: React.MutableRefObject<Player>; // Shared ref for UI updates
    isTouchDevice: boolean;
    onChestPickup: () => void;
}

// Helper to manage loaded images
const useImagePreloader = (assets: GeneratedAssets) => {
    const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});

    useEffect(() => {
        const images: Record<string, HTMLImageElement> = {};
        const keys: (keyof GeneratedAssets)[] = [
            'player', 
            'enemyPeasant', 
            'enemyCultist', 
            'enemyCharger',
            'enemyArcher',
            'enemyBoss', 
            'background', 
            'projectileSword'
        ];
        
        keys.forEach(key => {
            const src = assets[key];
            if (src) {
                const img = new Image();
                img.src = src;
                images[key] = img;
            }
        });
        setLoadedImages(images);
    }, [assets]);

    return loadedImages;
};

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, setGameState, onLevelUp, onGameOver, assets, playerRef, isTouchDevice, onChestPickup }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const loadedImages = useImagePreloader(assets);
    
    // Dynamic Screen Dimensions
    const [screenDimensions, setScreenDimensions] = useState({ 
        width: window.innerWidth, 
        height: window.innerHeight 
    });

    // Game Entities Refs (Mutable for performance)
    const enemiesRef = useRef<Enemy[]>([]);
    const projectilesRef = useRef<Projectile[]>([]);
    const dropsRef = useRef<Drop[]>([]);
    
    // Visual Effects Refs
    const damageTextsRef = useRef<DamageText[]>([]);
    const visualEffectsRef = useRef<VisualEffect[]>([]);
    const screenShakeRef = useRef<number>(0);
    const hitStopRef = useRef<number>(0); // Hit stop timer

    // Cache the background pattern
    const bgPatternRef = useRef<CanvasPattern | null>(null);
    
    // Input Refs
    const joystickRef = useRef<Vector2D>({ x: 0, y: 0 });
    const keysRef = useRef<{ [key: string]: boolean }>({});
    
    // Logic Timers
    const frameCountRef = useRef(0);
    const scoreRef = useRef(0);

    // Resize Handler
    useEffect(() => {
        const handleResize = () => {
            setScreenDimensions({ width: window.innerWidth, height: window.innerHeight });
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Create pattern when background asset changes
    useEffect(() => {
        if (loadedImages.background && canvasRef.current) {
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                const tileSize = 512; 
                const offscreen = document.createElement('canvas');
                offscreen.width = tileSize;
                offscreen.height = tileSize;
                const offCtx = offscreen.getContext('2d');
                if (offCtx) {
                    offCtx.drawImage(loadedImages.background, 0, 0, tileSize, tileSize);
                    bgPatternRef.current = ctx.createPattern(offscreen, 'repeat');
                }
            }
        }
    }, [loadedImages.background]);

    // Initial Setup
    useEffect(() => {
        if (gameState === GameStateEnum.MENU) {
            // Reset game - Start in Middle of Massive World
            playerRef.current = {
                id: 'hero',
                pos: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
                radius: 25, 
                rotation: 0,
                hp: 100,
                maxHp: 100,
                speed: PLAYER_BASE_SPEED,
                exp: 0,
                level: 1,
                nextLevelExp: 30, 
                bloodEssence: 0,
                maxBloodEssence: 100,
                isFrenzy: false,
                frenzyTimer: 0,
                stats: { 
                    might: 1, 
                    cooldown: 1, 
                    area: 1, 
                    speed: 1, 
                    magnet: 1,
                    dodgeChance: 0,
                    frenzyEfficiency: 1,
                    expMultiplier: 1
                },
                weapons: [{ 
                    type: WeaponType.SWORD_AURA, 
                    level: 1, 
                    cooldownTimer: 0,
                    baseCooldown: WEAPON_DEFAULTS[WeaponType.SWORD_AURA].cooldown,
                    damage: WEAPON_DEFAULTS[WeaponType.SWORD_AURA].damage,
                    area: 1
                }],
                dashTimer: 0,
                maxDashTimer: PLAYER_DASH_COOLDOWN
            };
            enemiesRef.current = [];
            projectilesRef.current = [];
            dropsRef.current = [];
            damageTextsRef.current = [];
            visualEffectsRef.current = [];
            scoreRef.current = 0;
            screenShakeRef.current = 0;
            hitStopRef.current = 0;
        }
    }, [gameState]);

    // Input Event Listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameState !== GameStateEnum.PLAYING) return;
            keysRef.current[e.code] = true;
            
            if (e.code === 'Space' || e.code === 'KeyE') {
                handleDash();
            }
            if (e.code === 'Escape') {
                setGameState(GameStateEnum.PAUSED);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            keysRef.current[e.code] = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [gameState]);

    const getCombinedInputVector = (): Vector2D => {
        // Keyboard input
        let kx = 0;
        let ky = 0;
        if (keysRef.current['KeyW'] || keysRef.current['ArrowUp']) ky -= 1;
        if (keysRef.current['KeyS'] || keysRef.current['ArrowDown']) ky += 1;
        if (keysRef.current['KeyA'] || keysRef.current['ArrowLeft']) kx -= 1;
        if (keysRef.current['KeyD'] || keysRef.current['ArrowRight']) kx += 1;

        // Normalize keyboard vector if active
        if (kx !== 0 || ky !== 0) {
            const len = Math.sqrt(kx*kx + ky*ky);
            kx /= len;
            ky /= len;
            return { x: kx, y: ky };
        }

        // Fallback to joystick
        return joystickRef.current;
    };

    const spawnDamageText = (x: number, y: number, damage: number, isCrit: boolean, textOverride?: string) => {
        // Limit total text objects to prevent lag
        if (damageTextsRef.current.length > 30) damageTextsRef.current.shift();

        damageTextsRef.current.push({
            id: Math.random().toString(),
            x: x + (Math.random() * 20 - 10),
            y: y - 50, // Spawn higher up to clear HP bars
            damage: Math.round(damage),
            life: 60,
            maxLife: 60,
            velocity: { x: (Math.random() - 0.5) * 1.5, y: -3 }, // Pop up faster
            isCrit,
            text: textOverride
        });
    };

    const spawnParticles = (x: number, y: number, count: number, type: 'BLOOD' | 'SPARK') => {
        // Reduced particle count for performance
        const actualCount = count > 5 ? 5 : count;
        
        for (let i = 0; i < actualCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            let speed = Math.random() * 2 + 1;
            let life = 20 + Math.random() * 15; // Shorter life
            let color = '#b91c1c'; // default blood
            let friction = 0.9;
            let gravity = 0.3; // Liquid gravity

            if (type === 'SPARK') {
                speed = Math.random() * 6 + 4; // Fast explode
                life = 10 + Math.random() * 10; // Very short life
                color = Math.random() > 0.5 ? '#fbbf24' : '#fef3c7'; // Gold/White
                friction = 0.85; // Slow down fast
                gravity = 0; // Sparks fly straightish
            } else {
                // Blood/Ink
                color = Math.random() > 0.7 ? '#991b1b' : '#7f1d1d'; // Varied reds
            }

            visualEffectsRef.current.push({
                id: Math.random().toString(),
                x, y,
                type: 'PARTICLE',
                life,
                maxLife: life,
                color: color,
                velocity: {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                },
                radius: Math.random() * 3 + 1,
                friction,
                gravity
            });
        }
        
        // Limit total visual effects
        if (visualEffectsRef.current.length > 100) {
            visualEffectsRef.current.splice(0, 20);
        }
    };

    const updateGame = () => {
        if (gameState !== GameStateEnum.PLAYING) return;

        // --- HIT STOP LOGIC ---
        // While hit stop is active, we skip PHYSICS updates but still render
        if (hitStopRef.current > 0) {
            hitStopRef.current--;
            // Even during hit stop, screen shake should decay
            if (screenShakeRef.current > 0) {
                 screenShakeRef.current -= 1.0; 
                 if (screenShakeRef.current < 0) screenShakeRef.current = 0;
            }
            return; 
        }

        frameCountRef.current++;
        const player = playerRef.current;
        const enemies = enemiesRef.current;
        const projectiles = projectilesRef.current;
        const drops = dropsRef.current;

        // --- 0. Systems Update ---
        // PERFORMANCE & FEEL: Linear decay for shake (faster settlement, less floaty)
        if (screenShakeRef.current > 0) {
            screenShakeRef.current -= 0.5; 
            if (screenShakeRef.current < 0) screenShakeRef.current = 0;
        }
        if (player.dashTimer > 0) player.dashTimer--;

        // --- 1. Player Movement ---
        const moveVec = getCombinedInputVector();
        
        if (moveVec.x !== 0 || moveVec.y !== 0) {
            // Apply speed stat and frenzy bonus
            let currentSpeed = player.speed * player.stats.speed;
            if (player.isFrenzy) currentSpeed *= 1.3;

            player.pos.x += moveVec.x * currentSpeed;
            player.pos.y += moveVec.y * currentSpeed;

            // Boundaries (using WORLD dimensions)
            player.pos.x = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.pos.x));
            player.pos.y = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.pos.y));

            // Face Left or Right
            if (moveVec.x < 0) player.rotation = Math.PI;
            else if (moveVec.x > 0) player.rotation = 0;
        }

        // --- 2. Spawning Enemies ---
        // Normal Spawns
        const spawnRate = Math.max(5, ENEMY_SPAWN_RATE - Math.floor(scoreRef.current / 500));
        if (frameCountRef.current % spawnRate === 0 && enemies.length < MAX_ENEMIES) {
            const isBoss = scoreRef.current > 0 && scoreRef.current % 1500 === 0 && !enemies.some(e => e.type === EnemyType.BOSS);
            // Spawn logic now handles world coords
            enemies.push(spawnEnemy(player.pos, isBoss ? EnemyType.BOSS : undefined, false));
        }

        // Elite Spawns (Every 30 seconds ~ 1800 frames)
        if (frameCountRef.current % 1800 === 0 && scoreRef.current > 100) {
             // Spawn a guaranteed Elite
             enemies.push(spawnEnemy(player.pos, undefined, true));
             // Visual warning (Relative to player start)
             visualEffectsRef.current.push({
                 id: Math.random().toString(),
                 x: player.pos.x, y: player.pos.y - 100,
                 type: 'HIT_SPARK', // Reuse for now
                 life: 60,
                 maxLife: 60
             });
        }

        // --- 3. Enemy Logic (AI) ---
        enemies.forEach(enemy => {
            // Decrement flash timer
            if (enemy.flashTimer && enemy.flashTimer > 0) enemy.flashTimer--;

            // Handle movement, state changes, and shooting
            const prevProjectilesLen = projectiles.length;
            const enemyProjectiles = updateEnemyBehavior(enemy, player, visualEffectsRef.current);
            projectiles.push(...enemyProjectiles);
            
            // If BOSS created shockwave, shake screen (Reduced magnitude)
            if (enemy.type === EnemyType.BOSS && projectiles.length > prevProjectilesLen && projectiles[projectiles.length-1].radius > 50) {
                 screenShakeRef.current = 10; // Reduced from 15
            }

            // Collision with Player (Contact Damage)
            if (checkCollision(player, enemy)) {
                if (frameCountRef.current % 30 === 0) { 
                    // Dodge Logic
                    if (Math.random() < player.stats.dodgeChance) {
                        spawnDamageText(player.pos.x, player.pos.y - 20, 0, true, "闪避!");
                        // Visual effect for dodge
                        visualEffectsRef.current.push({
                            id: Math.random().toString(),
                            x: player.pos.x, y: player.pos.y,
                            type: 'DASH_GHOST',
                            life: 15,
                            maxLife: 15,
                            scaleX: player.rotation === Math.PI ? -1 : 1
                        });
                    } else {
                        player.hp -= enemy.damage;
                        spawnDamageText(player.pos.x, player.pos.y, enemy.damage, false);
                        screenShakeRef.current = 5; // Reduced from 8
                        audioManager.playHit(false); // Play hurt sound (reuse hit for now but softer/diff)
                        // Player blood
                        spawnParticles(player.pos.x, player.pos.y, 5, 'BLOOD');
                    }
                }
            }
        });

        // --- 4. Weapon Cooldowns & Firing ---
        player.weapons.forEach(w => {
            // Special handling for Golden Bell (Passive Tick)
            if (w.type === WeaponType.GOLDEN_BELL) {
                const tickRate = WEAPON_DEFAULTS[WeaponType.GOLDEN_BELL].tickRate;
                if (frameCountRef.current % tickRate === 0) {
                     const radius = WEAPON_DEFAULTS[WeaponType.GOLDEN_BELL].area * w.area * player.stats.area;
                     let dmg = w.damage * player.stats.might;
                     if (player.isFrenzy) dmg *= 1.5; // Frenzy damage bonus for Golden Bell

                     let hitAny = false;
                     enemies.forEach(e => {
                         if (getDistance(player.pos, e.pos) < radius + e.radius) {
                             e.hp -= dmg;
                             hitAny = true;
                             // Push back
                             const dx = e.pos.x - player.pos.x;
                             const dy = e.pos.y - player.pos.y;
                             const dist = Math.sqrt(dx*dx + dy*dy);
                             if (dist > 0) {
                                 e.pos.x += (dx/dist) * 5;
                                 e.pos.y += (dy/dist) * 5;
                             }
                             // Visual Spark
                             if (Math.random() < 0.3) {
                                 spawnDamageText(e.pos.x, e.pos.y, dmg, false);
                             }
                             // Flash
                             e.flashTimer = 4;
                         }
                     });
                     if (hitAny && frameCountRef.current % 30 === 0) audioManager.playHit(false); // Throttle sound
                }
                return; // Golden bell is not a standard projectile weapon
            }

            if (w.cooldownTimer > 0) {
                w.cooldownTimer -= player.stats.cooldown;
            } else {
                // Pass enemies to projectile creation for targeting
                const newProjs = createProjectile(player, w.type, enemies);
                if (newProjs.length > 0) {
                    projectiles.push(...newProjs);
                    // Play attack sound based on weapon type
                    const isHeavy = w.type === WeaponType.BLADE || w.type === WeaponType.STAFF;
                    audioManager.playAttack(isHeavy ? 'HEAVY' : 'SWORD');
                }
                w.cooldownTimer = w.baseCooldown;
            }
        });

        // --- 5. Projectile Logic ---
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            
            // Trail Logic
            if (p.visualType !== 'SWORD' && p.visualType !== 'NOTE') {
                if (!p.trail) p.trail = [];
                // Add current pos to trail
                p.trail.push({ x: p.pos.x, y: p.pos.y });
                if (p.trail.length > 10) p.trail.shift();
            }

            // HOMING LOGIC FOR SPIRIT DAGGER
            if (p.visualType === 'DAGGER' && p.targetId && p.velocity) {
                // Find target
                const target = enemies.find(e => e.id === p.targetId);
                if (target) {
                    // Calculate vector to target
                    const dx = target.pos.x - p.pos.x;
                    const dy = target.pos.y - p.pos.y;
                    
                    // Steer current velocity towards target
                    const steerStrength = 0.2; // How fast it turns (0.0 to 1.0)
                    const desiredDir = normalizeVector({ x: dx, y: dy });
                    const currentDir = normalizeVector(p.velocity);
                    
                    const newDir = {
                        x: currentDir.x + (desiredDir.x - currentDir.x) * steerStrength,
                        y: currentDir.y + (desiredDir.y - currentDir.y) * steerStrength
                    };
                    const finalDir = normalizeVector(newDir);
                    const speed = Math.sqrt(p.velocity.x*p.velocity.x + p.velocity.y*p.velocity.y);
                    
                    p.velocity.x = finalDir.x * speed;
                    p.velocity.y = finalDir.y * speed;
                    p.rotation = Math.atan2(p.velocity.y, p.velocity.x);
                }
            }

            if (p.isOrbiting) {
                p.orbitAngle = (p.orbitAngle || 0) + 0.1;
                // Support larger orbits for Staff
                p.pos.x = player.pos.x + Math.cos(p.orbitAngle) * (p.orbitDistance || 50);
                p.pos.y = player.pos.y + Math.sin(p.orbitAngle) * (p.orbitDistance || 50);
                
                // Rotation now matches orbit angle (pointing outwards) 
                p.rotation = p.orbitAngle; 
            } else {
                p.pos.x += p.velocity.x;
                p.pos.y += p.velocity.y;
            }

            p.duration--;

            // Handle Collisions
            if (p.owner === 'PLAYER') {
                // Check Enemy Collisions
                for (const enemy of enemies) {
                    if (p.hitIds.has(enemy.id)) continue;
                    if (checkCollision(p, enemy)) {
                        enemy.hp -= p.damage;
                        p.hitIds.add(enemy.id);
                        p.pierce--;
                        
                        // Visual Impact
                        enemy.flashTimer = 5;
                        
                        const isCrit = Math.random() < 0.1; // 10% base crit
                        const finalDamage = isCrit ? p.damage * 2 : p.damage;
                        
                        spawnDamageText(enemy.pos.x, enemy.pos.y, finalDamage, isCrit);
                        audioManager.playHit(isCrit); 

                        // Critical Hit Feel
                        if (isCrit) {
                            hitStopRef.current = 3; // Short freeze for punchiness
                            // Removed screen shake for attacking unless it's a massive crit, even then reduced
                            // screenShakeRef.current = 4; 
                            spawnParticles(enemy.pos.x, enemy.pos.y, 8, 'SPARK'); 
                            spawnParticles(enemy.pos.x, enemy.pos.y, 5, 'BLOOD'); 
                        } else {
                            // REMOVED SCREEN SHAKE FOR NORMAL HITS
                            // screenShakeRef.current = Math.max(screenShakeRef.current, 3);
                            spawnParticles(enemy.pos.x, enemy.pos.y, 2, 'BLOOD'); 
                        }

                        // Knockback
                        const kbDir = normalizeVector({ x: enemy.pos.x - p.pos.x, y: enemy.pos.y - p.pos.y });
                        enemy.pos.x += kbDir.x * 10;
                        enemy.pos.y += kbDir.y * 10;
                    }
                }
            } else if (p.owner === 'ENEMY') {
                 // Check Player Collision
                 if (checkCollision(p, player)) {
                     // Dodge Check for Projectiles
                     if (Math.random() < player.stats.dodgeChance) {
                         spawnDamageText(player.pos.x, player.pos.y - 20, 0, true, "闪避!");
                         p.pierce = 0; // Projectile misses
                     } else {
                         player.hp -= p.damage;
                         spawnDamageText(player.pos.x, player.pos.y, p.damage, false);
                         screenShakeRef.current = 4; // Keep slight shake for player hurt feedback
                         audioManager.playHit(true); // Player hurt sound
                         spawnParticles(player.pos.x, player.pos.y, 5, 'BLOOD');
                         p.pierce = 0; // Destroy projectile
                     }
                 }
            }

            // Cleanup
            if (p.duration <= 0 || p.pierce <= 0 || 
                (!p.isOrbiting && (p.pos.x < -100 || p.pos.x > WORLD_WIDTH + 100 || p.pos.y < -100 || p.pos.y > WORLD_HEIGHT + 100))) {
                projectiles.splice(i, 1);
            }
        }

        // --- 6. Cleanup Dead Enemies ---
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].hp <= 0) {
                // Determine drop
                let dropType: 'BLOOD' | 'CHEST' = 'BLOOD';
                if (enemies[i].isElite || enemies[i].type === EnemyType.BOSS) {
                    dropType = 'CHEST';
                }

                drops.push({
                    id: Math.random().toString(),
                    pos: { ...enemies[i].pos },
                    radius: dropType === 'CHEST' ? 15 : 5,
                    value: enemies[i].type === EnemyType.BOSS ? 50 : (enemies[i].type === EnemyType.CULTIST ? 5 : 1),
                    type: dropType,
                    rotation: 0
                });
                scoreRef.current += enemies[i].isElite ? 100 : 10;
                enemies.splice(i, 1);
            }
        }

        // --- 7. Pickup Logic ---
        const magnetRange = PLAYER_PICKUP_RANGE * player.stats.magnet;
        for (let i = drops.length - 1; i >= 0; i--) {
            const drop = drops[i];
            
            // Chests are not magnetized, must walk over
            if (drop.type === 'CHEST') {
                if (getDistance(player.pos, drop.pos) < player.radius + drop.radius) {
                    drops.splice(i, 1);
                    onChestPickup();
                }
                continue;
            }

            const dist = getDistance(player.pos, drop.pos);
            if (dist < magnetRange) {
                const dir = normalizeVector({ x: player.pos.x - drop.pos.x, y: player.pos.y - drop.pos.y });
                drop.pos.x += dir.x * 12; // Fast suck
                drop.pos.y += dir.y * 12;

                if (dist < player.radius + drop.radius) {
                    player.exp += (drop.value * player.stats.expMultiplier);
                    player.bloodEssence += drop.value;
                    if (player.hp < player.maxHp) player.hp += 0.5;
                    audioManager.playPickup(drop.value > 10); // Play pickup sound
                    drops.splice(i, 1);
                }
            }
        }

        // --- 8. Update Visual Effects (Damage Text & Particles) ---
        for (let i = damageTextsRef.current.length - 1; i >= 0; i--) {
            const dt = damageTextsRef.current[i];
            dt.x += dt.velocity.x;
            dt.y += dt.velocity.y;
            dt.life--;
            // Slow down upward float
            dt.velocity.y *= 0.9;
            if (dt.life <= 0) {
                damageTextsRef.current.splice(i, 1);
            }
        }

        for (let i = visualEffectsRef.current.length - 1; i >= 0; i--) {
            const vfx = visualEffectsRef.current[i];
            
            if (vfx.type === 'SHOCKWAVE') {
                vfx.radius = (vfx.radius || 10) + 5;
            }
            if (vfx.type === 'PARTICLE') {
                vfx.x += vfx.velocity?.x || 0;
                vfx.y += vfx.velocity?.y || 0;
                
                // Apply physics
                if (vfx.velocity && vfx.friction) {
                    vfx.velocity.x *= vfx.friction;
                    vfx.velocity.y *= vfx.friction;
                }
                if (vfx.velocity && vfx.gravity) {
                    vfx.velocity.y += vfx.gravity;
                }
            }

            vfx.life--;
            if (vfx.life <= 0) {
                visualEffectsRef.current.splice(i, 1);
            }
        }

        // --- 10. Level Up ---
        if (player.exp >= player.nextLevelExp) {
            player.level++;
            player.exp -= player.nextLevelExp;
            // Balance: Smoother level up curve (1.5 -> 1.2)
            player.nextLevelExp = Math.floor(player.nextLevelExp * 1.2) + 10;
            setGameState(GameStateEnum.LEVEL_UP);
            onLevelUp(player);
        }

        // --- 11. Blood Frenzy ---
        if (!player.isFrenzy && player.bloodEssence >= FRENZY_THRESHOLD) {
            player.isFrenzy = true;
            player.frenzyTimer = 0;
            audioManager.playLevelUp(); // Frenzy sound
        }
        if (player.isFrenzy) {
            // Efficiency stat reduces drain (higher efficiency = slower drain)
            // Default 1.0. If efficiency is 2.0, drain is 0.5x
            const drain = FRENZY_DRAIN_RATE / player.stats.frenzyEfficiency;
            player.bloodEssence -= drain;
            // Decreased HP Drain Rate: Now 1% every 30 frames (0.5s) instead of 10 frames
            if (frameCountRef.current % 30 === 0) player.hp -= (player.maxHp * 0.01);
            if (player.bloodEssence <= 0) player.isFrenzy = false;
        }
        player.bloodEssence = Math.min(player.bloodEssence, player.maxBloodEssence);

        // --- 12. Game Over ---
        if (player.hp <= 0) {
            setGameState(GameStateEnum.GAME_OVER);
            onGameOver(scoreRef.current);
        }
    };

    const drawShadow = (ctx: CanvasRenderingContext2D, radius: number) => {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        // Draw an oval shadow at the feet
        ctx.ellipse(0, radius * 0.8, radius, radius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const drawHeroAura = (ctx: CanvasRenderingContext2D, radius: number) => {
        const time = frameCountRef.current;
        
        ctx.save();
        // Outer Rotating Gold Ring
        ctx.strokeStyle = '#f59e0b'; // Amber-500
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 15, 0, Math.PI * 2);
        ctx.stroke();

        // Inner Rotating Runes (Simulated by dashes)
        ctx.rotate(time * 0.02);
        ctx.setLineDash([10, 15]);
        ctx.beginPath();
        ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // Counter-rotating Ring
        ctx.rotate(time * -0.04);
        ctx.strokeStyle = '#fcd34d'; // Amber-300
        ctx.setLineDash([5, 20]);
        ctx.beginPath();
        ctx.arc(0, 0, radius + 22, 0, Math.PI * 2);
        ctx.stroke();

        // Direction Arrow
        ctx.restore();
        ctx.save();
        // Use move vector to determine arrow direction, or fallback to player rotation
        const moveVec = getCombinedInputVector();
        let angle = playerRef.current.rotation;
        if (moveVec.x !== 0 || moveVec.y !== 0) {
            angle = Math.atan2(moveVec.y, moveVec.x);
        } else if (playerRef.current.rotation === Math.PI) {
            angle = Math.PI;
        } else {
            angle = 0;
        }

        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.beginPath();
        ctx.moveTo(radius + 30, 0);
        ctx.lineTo(radius + 40, 5);
        ctx.lineTo(radius + 40, -5);
        ctx.fill();

        ctx.restore();
    };

    const drawSprite = (ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, radius: number, isPlayer: boolean = false, isProjectile: boolean = false) => {
        if (img && img.complete && img.naturalWidth > 0) {
            // Apply Screen blend mode ONLY for projectiles (glow effects)
            if (isProjectile) {
                ctx.globalCompositeOperation = 'screen';
            }

            // Calculate Aspect Ratio to prevent squashing
            const aspect = img.naturalWidth / img.naturalHeight;
            
            // Base width on radius (diameter roughly)
            const drawWidth = radius * 5;
            
            // Check for Sprite Sheet (Wide image)
            const isSpriteSheet = img.naturalWidth > img.naturalHeight * 1.8;

            if (isSpriteSheet) {
                 const frameCount = img.naturalWidth > img.naturalHeight * 3 ? 4 : 2;
                 const frameWidth = img.naturalWidth / frameCount;
                 const frameHeight = img.naturalHeight;
                 const animSpeed = 8;
                 const currentFrame = Math.floor(frameCountRef.current / animSpeed) % frameCount;
                 
                 const sheetAspect = frameWidth / frameHeight;
                 const drawHeight = drawWidth / sheetAspect;
                 const yOffset = -drawHeight * 0.75;
                 
                 ctx.drawImage(
                    img, 
                    currentFrame * frameWidth, 0, frameWidth, frameHeight, 
                    -drawWidth / 2, yOffset, drawWidth, drawHeight
                );
            } else {
                const drawHeight = drawWidth / aspect;
                const yOffset = -drawHeight * 0.75; 
                ctx.drawImage(img, -drawWidth / 2, yOffset, drawWidth, drawHeight);
            }
            
            // Reset blend mode
            ctx.globalCompositeOperation = 'source-over';
        } else {
             // Fallback shapes
             ctx.fillStyle = isPlayer ? '#2563eb' : '#7f1d1d';
             if (isProjectile) ctx.fillStyle = '#0ea5e9';
             ctx.beginPath();
             ctx.arc(0, 0, radius, 0, Math.PI * 2);
             ctx.fill();
        }
    }

    const drawGame = (ctx: CanvasRenderingContext2D) => {
        const player = playerRef.current;
        
        // --- CAMERA SYSTEM ---
        const logicalWidth = screenDimensions.width;
        const logicalHeight = screenDimensions.height;

        const cameraX = player.pos.x - logicalWidth / 2;
        const cameraY = player.pos.y - logicalHeight / 2;

        // Clear Screen
        ctx.fillStyle = '#100505'; 
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);

        // Apply Screen Shake (Relative to Screen)
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // --- BACKGROUND TILING & BOUNDARIES ---
        ctx.save();
        ctx.translate(-cameraX, -cameraY);

        if (bgPatternRef.current) {
            ctx.fillStyle = bgPatternRef.current;
            ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
            
            // Draw "Barrier" Border
            ctx.strokeStyle = '#dc2626'; // Red barrier
            ctx.lineWidth = 10;
            ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
            
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = 2;
            ctx.strokeRect(5, 5, WORLD_WIDTH - 10, WORLD_HEIGHT - 10);
        } else {
             ctx.fillStyle = '#e5e5e5';
             ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        }
        
        ctx.restore();

        // Vignette overlay
        const gradient = ctx.createRadialGradient(
            logicalWidth/2, logicalHeight/2, 200, 
            logicalWidth/2, logicalHeight/2, logicalHeight/1.2
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0.4)"); 
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);

        // --- WORLD TRANSFORM START (ENTITIES) ---
        ctx.save();
        ctx.translate(-cameraX, -cameraY);

        // Drops
        dropsRef.current.forEach(drop => {
            // Cull off-screen drops
            if (drop.pos.x < cameraX - 50 || drop.pos.x > cameraX + logicalWidth + 50 ||
                drop.pos.y < cameraY - 50 || drop.pos.y > cameraY + logicalHeight + 50) return;

            const bobOffset = Math.sin(frameCountRef.current * 0.1 + parseFloat(drop.id)) * 3;
            ctx.save();
            ctx.translate(drop.pos.x, drop.pos.y + bobOffset);
            
            if (drop.type === 'CHEST') {
                // PERFORMANCE: Removed shadowBlur
                ctx.fillStyle = '#d97706';
                ctx.fillRect(-15, -15, 30, 25);
                ctx.strokeStyle = '#fef3c7';
                ctx.lineWidth = 2;
                ctx.strokeRect(-15, -15, 30, 25);
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(0, -15, 15, Math.PI, 0);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.beginPath();
                if (drop.value >= 50) ctx.fillStyle = '#f59e0b'; // Gold for Boss/Elite
                else if (drop.value >= 5) ctx.fillStyle = '#a855f7'; // Purple for Cultist
                else ctx.fillStyle = '#dc2626'; // Red for Peasant
                
                ctx.arc(0, 0, drop.radius, 0, Math.PI * 2);
                ctx.fill();
                
                // PERFORMANCE: Removed shadowBlur for drops
                ctx.strokeStyle = '#fca5a5';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.restore();
        });

        // Visual Effects (Particles behind entities)
        visualEffectsRef.current.forEach(vfx => {
             if (vfx.x < cameraX - 100 || vfx.x > cameraX + logicalWidth + 100 ||
                vfx.y < cameraY - 100 || vfx.y > cameraY + logicalHeight + 100) return;

            if (vfx.type === 'DASH_GHOST' && loadedImages.player) {
                ctx.save();
                ctx.globalAlpha = (vfx.life / (vfx.maxLife || 20)) * 0.5;
                ctx.translate(vfx.x, vfx.y);
                ctx.scale(vfx.scaleX || 1, 1);
                drawSprite(ctx, loadedImages.player, 15, true);
                ctx.restore();
            } else if (vfx.type === 'WARNING_LINE') {
                ctx.save();
                ctx.translate(vfx.x, vfx.y);
                ctx.rotate(vfx.rotation || 0);
                ctx.fillStyle = `rgba(220, 38, 38, ${(vfx.life / 40) * 0.5})`;
                ctx.fillRect(0, -(vfx.width||20)/2, vfx.length || 300, vfx.width||20);
                ctx.restore();
            } else if (vfx.type === 'SHOCKWAVE') {
                ctx.save();
                ctx.translate(vfx.x, vfx.y);
                ctx.beginPath();
                ctx.arc(0, 0, vfx.radius || 10, 0, Math.PI * 2);
                ctx.lineWidth = 5;
                ctx.strokeStyle = `rgba(220, 38, 38, ${(vfx.life / 40)})`;
                ctx.stroke();
                ctx.restore();
            } else if (vfx.type === 'PARTICLE') {
                ctx.save();
                ctx.translate(vfx.x, vfx.y);
                ctx.fillStyle = vfx.color || '#fff';
                ctx.globalAlpha = vfx.life / (vfx.maxLife || 50);
                ctx.beginPath();
                ctx.arc(0, 0, vfx.radius || 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });

        // Enemies
        enemiesRef.current.forEach(enemy => {
            if (enemy.pos.x < cameraX - 100 || enemy.pos.x > cameraX + logicalWidth + 100 ||
                enemy.pos.y < cameraY - 100 || enemy.pos.y > cameraY + logicalHeight + 100) return;

            ctx.save();
            ctx.translate(enemy.pos.x, enemy.pos.y);
            
            // --- ELITE AURA ---
            if (enemy.isElite) {
                 ctx.save();
                 ctx.shadowColor = '#a855f7'; // Purple glow
                 ctx.shadowBlur = 15;
                 ctx.beginPath();
                 ctx.arc(0, 0, enemy.radius + 5, 0, Math.PI * 2);
                 ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
                 ctx.lineWidth = 3;
                 ctx.stroke();
                 ctx.restore();
            }

            drawShadow(ctx, enemy.radius);

            const bobY = Math.sin(frameCountRef.current * 0.15 + parseFloat(enemy.id)) * 2;
            ctx.translate(0, bobY);

            if (enemy.state === 'PREPARING') {
                 const shake = Math.sin(frameCountRef.current * 2) * 2;
                 ctx.translate(shake, 0);
            }

            if (enemy.isElite) {
                // Dashed inner ring for elite
                ctx.beginPath();
                ctx.arc(0, 0, enemy.radius + 2, 0, Math.PI * 2);
                ctx.strokeStyle = '#a855f7'; 
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // --- HANDLING FLIP ---
            let isFlipped = false;
            if (enemy.rotation === Math.PI) {
                ctx.scale(-1, 1);
                isFlipped = true;
            }
            
            let spriteImg = loadedImages.enemyPeasant;
            if (enemy.type === EnemyType.BOSS) spriteImg = loadedImages.enemyBoss;
            else if (enemy.type === EnemyType.CULTIST) spriteImg = loadedImages.enemyCultist;
            else if (enemy.type === EnemyType.CHARGER) spriteImg = loadedImages.enemyCharger;
            else if (enemy.type === EnemyType.ARCHER) spriteImg = loadedImages.enemyArcher;
            
            if (enemy.isElite) {
                ctx.scale(1.3, 1.3);
            }

            // --- OPTIMIZED FLASH EFFECT ---
            // Draw Sprite Normally First
            drawSprite(ctx, spriteImg, enemy.radius, false);
            
            // If Flashing, Draw Additive White Overlay
            const isFlashing = enemy.flashTimer && enemy.flashTimer > 0;
            if (isFlashing) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter'; // Additive blending
                ctx.globalAlpha = 0.5; // Intensity of flash
                drawSprite(ctx, spriteImg, enemy.radius, false);
                ctx.restore();
            }
            
            // --- RESTORE FLIP FOR UI ELEMENTS ---
            // We need to un-flip so text isn't mirrored
            if (isFlipped) {
                ctx.scale(-1, 1);
            }
            // If elite scaled, we need to respect that or reset it?
            // The text should be drawn relative to the scaled size or absolute?
            // Let's reset the elite scale too for clean UI
            if (enemy.isElite) {
                ctx.scale(1/1.3, 1/1.3);
            }
            
            // --- UI LAYER (HP BARS & LABELS) ---
            if (enemy.isElite || enemy.type === EnemyType.BOSS) {
                const barOffset = -enemy.radius * 5; // Move well above the sprite center for Elite (bigger sprite)
                
                // Draw "Elite" Text
                if (enemy.isElite) {
                    ctx.font = "bold 20px 'Ma Shan Zheng'";
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#fff';
                    ctx.shadowColor = '#a855f7';
                    ctx.shadowBlur = 5;
                    ctx.fillText("【精英】", 0, barOffset - 15); // Above the HP bar
                    ctx.shadowBlur = 0; // reset
                }

                // Draw Thicker HP Bar for Boss/Elite
                const hpWidth = enemy.radius * 3; // Wider
                const hpY = barOffset;
                const hpHeight = 8;
                
                // Border
                ctx.fillStyle = '#f59e0b'; // Gold border
                ctx.fillRect(-hpWidth/2 - 2, hpY - 2, hpWidth + 4, hpHeight + 4);
                
                // Back
                ctx.fillStyle = '#1f2937';
                ctx.fillRect(-hpWidth/2, hpY, hpWidth, hpHeight);
                
                // Fill
                ctx.fillStyle = '#dc2626';
                ctx.fillRect(-hpWidth/2, hpY, hpWidth * (Math.max(0, enemy.hp) / enemy.maxHp), hpHeight);
            } else {
                // Regular Enemy HP Bar - Positioned above head
                const hpWidth = enemy.radius * 2.5;
                const hpY = -enemy.radius * 4; // Approx head height for standard sprite
                const hpHeight = 4;

                // Background (Dark)
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(-hpWidth/2, hpY, hpWidth, hpHeight);
                
                // Foreground (Red)
                ctx.fillStyle = '#ef4444';
                // Ensure width is not negative
                ctx.fillRect(-hpWidth/2, hpY, hpWidth * (Math.max(0, enemy.hp) / enemy.maxHp), hpHeight);
            }

            ctx.restore();
        });

        // Player
        ctx.save();
        ctx.translate(player.pos.x, player.pos.y);
        drawHeroAura(ctx, player.radius);

        const bellWeapon = player.weapons.find(w => w.type === WeaponType.GOLDEN_BELL);
        if (bellWeapon) {
             const radius = WEAPON_DEFAULTS[WeaponType.GOLDEN_BELL].area * bellWeapon.area * player.stats.area;
             ctx.save();
             // Golden Bell Visuals
             // Outer ring with slight pulse
             const pulse = Math.sin(frameCountRef.current * 0.1) * 5;
             ctx.beginPath();
             ctx.arc(0, 0, radius + pulse, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(217, 119, 6, 0.15)`;
             ctx.fill();
             
             // Spinning Runes Ring
             ctx.lineWidth = 3;
             ctx.strokeStyle = `rgba(251, 191, 36, 0.4)`;
             ctx.setLineDash([15, 25]);
             ctx.rotate(frameCountRef.current * 0.02);
             ctx.beginPath();
             ctx.arc(0, 0, radius, 0, Math.PI * 2);
             ctx.stroke();
             
             // Inner Solid Ring
             ctx.rotate(frameCountRef.current * -0.04);
             ctx.setLineDash([]);
             ctx.lineWidth = 1;
             ctx.strokeStyle = `rgba(251, 191, 36, 0.8)`;
             ctx.beginPath();
             ctx.arc(0, 0, radius - 5, 0, Math.PI * 2);
             ctx.stroke();

             ctx.restore();
        }

        if (player.isFrenzy) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(220, 38, 38, ${0.5 + Math.sin(frameCountRef.current * 0.1) * 0.2})`;
            ctx.lineWidth = 4;
            ctx.arc(0, 0, player.radius + 15, 0, Math.PI * 2);
            ctx.stroke();
        }

        drawShadow(ctx, player.radius);
        
        const playerBob = Math.sin(frameCountRef.current * 0.2) * 2;
        ctx.translate(0, playerBob);

        if (player.rotation === Math.PI) {
            ctx.scale(-1, 1);
        }
        
        drawSprite(ctx, loadedImages.player, player.radius, true);
        ctx.restore();

        // Projectiles
        projectilesRef.current.forEach(p => {
             if (p.pos.x < cameraX - 100 || p.pos.x > cameraX + logicalWidth + 100 ||
                p.pos.y < cameraY - 100 || p.pos.y > cameraY + logicalHeight + 100) return;

            // SMOOTH TAPERED TRAIL RENDERING
            if (p.trail && p.trail.length > 1) {
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // Determine trail color based on visual type
                let trailColor = p.owner === 'PLAYER' ? '#38bdf8' : '#ef4444';
                if (p.visualType === 'SLASH') trailColor = '#991b1b'; // Dark red for slash
                if (p.visualType === 'PALM') trailColor = '#fbbf24'; // Gold for palm
                if (p.visualType === 'DAGGER') trailColor = '#22d3ee'; // Cyan for dagger
                
                for(let i=0; i < p.trail.length - 1; i++) {
                    const t = i / (p.trail.length - 1); // 0 to 1
                    const p1 = p.trail[i];
                    const p2 = p.trail[i+1];
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    
                    // Fade out tail
                    const alpha = t * 0.4; // Slightly lower trail opacity
                    ctx.globalAlpha = alpha;
                    // Taper width from tail (thin) to head (thick)
                    ctx.lineWidth = (p.radius * 0.8) * t; 
                    
                    ctx.strokeStyle = trailColor;
                    ctx.stroke();
                }
                ctx.restore();
            }

            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            
            // --- CUSTOM DRAWING BASED ON VISUAL TYPE ---
            switch (p.visualType) {
                case 'PALM':
                    // PALM STRIKE: Draw a golden hand print
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = 'rgba(251, 191, 36, 0.4)'; // Transparent Gold
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 2;
                    
                    // Palm shape (simplified)
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius * 0.6, 0, Math.PI * 2); // Palm center
                    ctx.fill();
                    
                    // Fingers (Circles)
                    const fRad = p.radius * 0.2;
                    const fDist = p.radius * 0.7;
                    for(let i=-2; i<=2; i++) {
                        ctx.beginPath();
                        // Spread fingers slightly
                        ctx.arc(fDist, i * (fRad * 1.2), fRad, 0, Math.PI * 2); 
                        ctx.fill();
                    }
                    // Aura glow
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#fbbf24';
                    ctx.stroke();
                    break;

                case 'SLASH':
                    // BLOOD BLADE: Crescent Moon
                    ctx.rotate(p.rotation);
                    ctx.beginPath();
                    // Outer arc
                    ctx.arc(0, 0, p.radius, -Math.PI / 2, Math.PI / 2);
                    // Inner curve to make it crescent
                    ctx.bezierCurveTo(p.radius * 0.5, p.radius * 0.5, p.radius * 0.5, -p.radius * 0.5, 0, -p.radius);
                    ctx.fillStyle = '#b91c1c'; // Deep Red
                    ctx.fill();
                    // Edge highlight
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#fecaca';
                    ctx.stroke();
                    break;

                case 'SWORD':
                    // ORBITING SWORDS: 
                    ctx.rotate(p.rotation); 
                    
                    // Use procedural drawing for better definition than default assets
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';

                    // Blade (Longer, tapered)
                    ctx.fillStyle = '#f0f9ff'; // White-blue
                    ctx.beginPath();
                    ctx.moveTo(45, 0); // Tip (Extended length)
                    ctx.lineTo(10, 4);
                    ctx.lineTo(10, -4);
                    ctx.fill();

                    // Blade Edge/Core
                    ctx.fillStyle = '#0ea5e9'; 
                    ctx.beginPath();
                    ctx.moveTo(40, 0);
                    ctx.lineTo(10, 1.5);
                    ctx.lineTo(10, -1.5);
                    ctx.fill();

                    // Guard (Wuxia style: Winged)
                    ctx.fillStyle = '#1e293b'; // Dark metal
                    ctx.beginPath();
                    ctx.moveTo(12, 0);
                    ctx.quadraticCurveTo(10, -10, 6, -12); // Top wing
                    ctx.lineTo(4, -4);
                    ctx.lineTo(4, 4);
                    ctx.lineTo(6, 12); // Bottom wing
                    ctx.quadraticCurveTo(10, 10, 12, 0);
                    ctx.fill();
                    
                    // Guard Ornament
                    ctx.fillStyle = '#fbbf24'; // Gold
                    ctx.beginPath();
                    ctx.arc(8, 0, 2, 0, Math.PI*2);
                    ctx.fill();

                    // Hilt
                    ctx.fillStyle = '#475569';
                    ctx.fillRect(-6, -2, 10, 4);

                    // Pommel
                    ctx.fillStyle = '#cbd5e1';
                    ctx.beginPath();
                    ctx.arc(-8, 0, 3, 0, Math.PI*2);
                    ctx.fill();
                    
                    // Tassel (Flowing energy tail instead of fabric)
                    ctx.strokeStyle = '#38bdf8';
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(-8, 0);
                    ctx.quadraticCurveTo(-15, Math.sin(frameCountRef.current * 0.2) * 5, -25, 0);
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                    break;

                case 'DAGGER':
                    // SPIRIT DAGGER: Sharp, ghostly blue
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = 'rgba(34, 211, 238, 0.8)'; // Cyan
                    ctx.beginPath();
                    ctx.moveTo(15, 0);
                    ctx.lineTo(-5, 4);
                    ctx.lineTo(-5, -4);
                    ctx.fill();
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = '#22d3ee';
                    break;

                case 'KUNAI':
                    // KUNAI: Silver, Metal
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = '#94a3b8'; // Slate
                    ctx.beginPath();
                    ctx.moveTo(12, 0);
                    ctx.lineTo(-4, 3);
                    ctx.lineTo(-4, -3);
                    ctx.fill();
                    // Handle
                    ctx.fillStyle = '#334155';
                    ctx.fillRect(-8, -1, 4, 2);
                    // Ring
                    ctx.strokeStyle = '#cbd5e1';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(-9, 0, 1.5, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                
                case 'NOTE':
                    // GUQIN NOTES: Ripples
                    // Pulse radius
                    const pulse = (Math.sin(frameCountRef.current * 0.2) + 1) * 0.5;
                    ctx.strokeStyle = `rgba(16, 185, 129, ${1 - pulse})`; // Emerald fade
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius * pulse, 0, Math.PI * 2);
                    ctx.stroke();
                    
                    // Core Note
                    ctx.fillStyle = '#10b981';
                    ctx.font = "20px serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("♪", 0, 0);
                    break;

                case 'STAFF':
                    // SPINNING STAFF: Motion blur circle
                    ctx.rotate(p.rotation + (p.orbitAngle || 0));
                    // Draw Blur Disc
                    ctx.fillStyle = 'rgba(217, 119, 6, 0.2)';
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius * 1.2, 0, Math.PI*2);
                    ctx.fill();
                    // Draw The Stick
                    ctx.rotate(frameCountRef.current * 0.3); // Fast local spin
                    ctx.fillStyle = '#78350f'; // Wood
                    ctx.fillRect(-20, -3, 40, 6);
                    // Gold Caps
                    ctx.fillStyle = '#f59e0b';
                    ctx.fillRect(-20, -4, 5, 8);
                    ctx.fillRect(15, -4, 5, 8);
                    break;

                case 'SHOCKWAVE':
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius, 0, Math.PI*2);
                    ctx.fillStyle = 'rgba(220,38,38,0.3)';
                    ctx.fill();
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = '#dc2626';
                    ctx.stroke();
                    break;

                case 'ARROW':
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = '#ef4444'; 
                    ctx.beginPath();
                    ctx.moveTo(10, 0);
                    ctx.lineTo(-5, 5);
                    ctx.lineTo(-5, -5);
                    ctx.fill();
                    break;

                default:
                    // Generic Orb
                    if (p.damage > 20) ctx.fillStyle = '#f59e0b';
                    else ctx.fillStyle = '#0ea5e9';
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }
            
            ctx.restore();
        });

        // Damage Texts (Animated Pop)
        damageTextsRef.current.forEach(dt => {
             if (dt.x < cameraX - 100 || dt.x > cameraX + logicalWidth + 100 ||
                dt.y < cameraY - 100 || dt.y > cameraY + logicalHeight + 100) return;

            ctx.save();
            
            // Pop Scale Animation
            const t = 1 - (dt.life / dt.maxLife);
            let scale = 1;
            
            if (dt.isCrit) {
                if (t < 0.2) scale = 1 + t * 5; 
                else if (t < 0.4) scale = 2 - (t - 0.2) * 2.5;
                else scale = 1.5;
            } else {
                if (t < 0.2) scale = 1 + t * 2;
                else scale = 1.2;
            }

            ctx.translate(dt.x, dt.y);
            ctx.scale(scale, scale);

            ctx.font = dt.isCrit ? "bold 32px 'Ma Shan Zheng'" : "24px 'Ma Shan Zheng'";
            const textColor = dt.isCrit ? '#fbbf24' : (dt.text === "闪避!" ? '#38bdf8' : '#ef4444');
            ctx.fillStyle = textColor;
            ctx.globalAlpha = Math.min(1, dt.life / 20); 
            
            const text = dt.text || Math.round(dt.damage).toString();
            
            // PERFORMANCE: Draw shadow via offset fill instead of strokeText
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillText(text, 2, 2);
            
            ctx.fillStyle = textColor;
            ctx.fillText(text, 0, 0);
            
            if (dt.isCrit) {
                ctx.font = "16px sans-serif";
                ctx.fillStyle = '#fff';
                ctx.fillText("暴击!", 20, -10);
            }
            ctx.restore();
        });

        // --- WORLD TRANSFORM END ---
        ctx.restore(); 

        // End Shake Transform (Screen Coords)
        ctx.restore();
    };

    const loop = useCallback(() => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                const dpr = window.devicePixelRatio || 1;
                const rect = canvasRef.current.getBoundingClientRect();
                
                if (canvasRef.current.width !== rect.width * dpr || canvasRef.current.height !== rect.height * dpr) {
                     canvasRef.current.width = rect.width * dpr;
                     canvasRef.current.height = rect.height * dpr;
                }
                
                ctx.save();
                ctx.scale(dpr, dpr);
                
                updateGame();
                drawGame(ctx);
                
                ctx.restore();
            }
        }
        requestRef.current = requestAnimationFrame(loop);
    }, [gameState, assets, loadedImages, screenDimensions]); 

    useEffect(() => {
        requestRef.current = requestAnimationFrame(loop);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [loop]);

    const handleDash = () => {
        const player = playerRef.current;
        if (player.dashTimer <= 0) { 
             const moveVec = getCombinedInputVector();
             
             let dashX = moveVec.x;
             let dashY = moveVec.y;
             
             if (dashX === 0 && dashY === 0) {
                 const rot = player.rotation || 0;
                 dashX = Math.cos(rot);
                 dashY = Math.sin(rot);
             }

             if (dashX !== 0 || dashY !== 0) {
                 audioManager.playDash(); // Dash sound
                 visualEffectsRef.current.push({
                     id: Math.random().toString(),
                     x: player.pos.x,
                     y: player.pos.y,
                     type: 'DASH_GHOST',
                     life: 20,
                     maxLife: 20,
                     scaleX: player.rotation === Math.PI ? -1 : 1
                 });

                 player.pos.x += dashX * 100;
                 player.pos.y += dashY * 100;
                 
                 visualEffectsRef.current.push({
                     id: Math.random().toString(),
                     x: player.pos.x - dashX * 50,
                     y: player.pos.y - dashY * 50,
                     type: 'DASH_GHOST',
                     life: 15,
                     maxLife: 15,
                     scaleX: player.rotation === Math.PI ? -1 : 1
                 });

                 player.dashTimer = player.maxDashTimer;
             }
        }
    };

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
            <canvas
                ref={canvasRef}
                className="w-full h-full block touch-none"
                width={window.innerWidth}
                height={window.innerHeight}
                style={{ width: '100%', height: '100%' }}
            />
            {gameState === GameStateEnum.PLAYING && isTouchDevice && (
                <>
                    <div className="md:opacity-50 hover:opacity-100 transition-opacity">
                        <Joystick 
                            onMove={(vec) => joystickRef.current = vec}
                            onEnd={() => joystickRef.current = {x:0, y:0}}
                        />
                    </div>
                    
                    <button 
                        onMouseDown={handleDash}
                        onTouchStart={handleDash}
                        className={`absolute bottom-10 right-10 w-24 h-24 rounded-full border-4 border-slate-500 text-white font-ink text-4xl active:scale-95 transition-transform flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] z-40 md:opacity-80 hover:opacity-100 ${playerRef.current.dashTimer > 0 ? 'bg-slate-700 opacity-50' : 'bg-slate-800/80'}`}
                    >
                        {playerRef.current.dashTimer > 0 ? (
                             <span className="text-xl font-sans">{Math.ceil(playerRef.current.dashTimer / 60)}</span>
                        ) : '闪'}
                    </button>
                </>
            )}
        </div>
    );
};

export default GameCanvas;

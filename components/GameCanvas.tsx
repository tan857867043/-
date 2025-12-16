
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameStateEnum, Player, Enemy, Projectile, Drop, Vector2D, WeaponType, GeneratedAssets, EnemyType, DamageText, VisualEffect, ArtStyle } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_BASE_SPEED, ENEMY_SPAWN_RATE, MAX_ENEMIES, WEAPON_DEFAULTS, FRENZY_THRESHOLD, FRENZY_DRAIN_RATE, PLAYER_PICKUP_RANGE, PLAYER_DASH_COOLDOWN } from '../constants';
import { spawnEnemy, createProjectile, checkCollision, normalizeVector, getDistance, updateEnemyBehavior } from '../services/gameLogic';
import Joystick from './Joystick';

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
    
    // Game Entities Refs (Mutable for performance)
    const enemiesRef = useRef<Enemy[]>([]);
    const projectilesRef = useRef<Projectile[]>([]);
    const dropsRef = useRef<Drop[]>([]);
    
    // Visual Effects Refs
    const damageTextsRef = useRef<DamageText[]>([]);
    const visualEffectsRef = useRef<VisualEffect[]>([]);
    const screenShakeRef = useRef<number>(0);

    // Cache the background pattern
    const bgPatternRef = useRef<CanvasPattern | null>(null);
    
    // Input Refs
    const joystickRef = useRef<Vector2D>({ x: 0, y: 0 });
    const keysRef = useRef<{ [key: string]: boolean }>({});
    
    // Logic Timers
    const frameCountRef = useRef(0);
    const scoreRef = useRef(0);

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
            // Reset game
            playerRef.current = {
                id: 'hero',
                pos: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
                radius: 25, 
                rotation: 0,
                hp: 100,
                maxHp: 100,
                speed: PLAYER_BASE_SPEED,
                exp: 0,
                level: 1,
                nextLevelExp: 100,
                bloodEssence: 0,
                maxBloodEssence: 100,
                isFrenzy: false,
                frenzyTimer: 0,
                stats: { might: 1, cooldown: 1, area: 1, speed: 1, magnet: 1 },
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

    const spawnDamageText = (x: number, y: number, damage: number, isCrit: boolean) => {
        damageTextsRef.current.push({
            id: Math.random().toString(),
            x: x + (Math.random() * 20 - 10),
            y: y - 20,
            damage: Math.round(damage),
            life: 60,
            maxLife: 60,
            velocity: { x: (Math.random() - 0.5) * 1, y: -2 },
            isCrit
        });
    };

    const updateGame = () => {
        if (gameState !== GameStateEnum.PLAYING) return;

        frameCountRef.current++;
        const player = playerRef.current;
        const enemies = enemiesRef.current;
        const projectiles = projectilesRef.current;
        const drops = dropsRef.current;

        // --- 0. Systems Update ---
        if (screenShakeRef.current > 0) {
            screenShakeRef.current *= 0.9;
            if (screenShakeRef.current < 0.5) screenShakeRef.current = 0;
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

            // Boundaries (using player.radius dynamically)
            player.pos.x = Math.max(player.radius, Math.min(CANVAS_WIDTH - player.radius, player.pos.x));
            player.pos.y = Math.max(player.radius, Math.min(CANVAS_HEIGHT - player.radius, player.pos.y));

            // Face Left or Right
            if (moveVec.x < 0) player.rotation = Math.PI;
            else if (moveVec.x > 0) player.rotation = 0;
        }

        // --- 2. Spawning Enemies ---
        // Normal Spawns
        const spawnRate = Math.max(5, ENEMY_SPAWN_RATE - Math.floor(scoreRef.current / 500));
        if (frameCountRef.current % spawnRate === 0 && enemies.length < MAX_ENEMIES) {
            const isBoss = scoreRef.current > 0 && scoreRef.current % 1500 === 0 && !enemies.some(e => e.type === EnemyType.BOSS);
            enemies.push(spawnEnemy(player.pos, isBoss ? EnemyType.BOSS : undefined, false));
        }

        // Elite Spawns (Every 30 seconds ~ 1800 frames)
        if (frameCountRef.current % 1800 === 0 && scoreRef.current > 100) {
             // Spawn a guaranteed Elite
             enemies.push(spawnEnemy(player.pos, undefined, true));
             // Visual warning
             visualEffectsRef.current.push({
                 id: Math.random().toString(),
                 x: player.pos.x, y: player.pos.y - 100,
                 type: 'HIT_SPARK', // Reuse for now
                 life: 60
             });
        }

        // --- 3. Enemy Logic (AI) ---
        enemies.forEach(enemy => {
            // Handle movement, state changes, and shooting
            const prevProjectilesLen = projectiles.length;
            const enemyProjectiles = updateEnemyBehavior(enemy, player, visualEffectsRef.current);
            projectiles.push(...enemyProjectiles);
            
            // If BOSS created shockwave, shake screen
            if (enemy.type === EnemyType.BOSS && projectiles.length > prevProjectilesLen && projectiles[projectiles.length-1].radius > 50) {
                 screenShakeRef.current = 15;
            }

            // Collision with Player (Contact Damage)
            if (checkCollision(player, enemy)) {
                if (frameCountRef.current % 30 === 0) { 
                    player.hp -= enemy.damage;
                    spawnDamageText(player.pos.x, player.pos.y, enemy.damage, false);
                    screenShakeRef.current = 5; // Light shake on hurt
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
                     const dmg = w.damage * player.stats.might;
                     
                     enemies.forEach(e => {
                         if (getDistance(player.pos, e.pos) < radius + e.radius) {
                             e.hp -= dmg;
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
                         }
                     });
                }
                return; // Golden bell is not a standard projectile weapon
            }

            if (w.cooldownTimer > 0) {
                w.cooldownTimer -= player.stats.cooldown;
            } else {
                // Pass enemies to projectile creation for targeting
                const newProjs = createProjectile(player, w.type, enemies);
                projectiles.push(...newProjs);
                w.cooldownTimer = w.baseCooldown;
            }
        });

        // --- 5. Projectile Logic ---
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            
            if (p.isOrbiting) {
                p.orbitAngle = (p.orbitAngle || 0) + 0.1;
                p.pos.x = player.pos.x + Math.cos(p.orbitAngle) * (p.orbitDistance || 50);
                p.pos.y = player.pos.y + Math.sin(p.orbitAngle) * (p.orbitDistance || 50);
                p.rotation = p.orbitAngle + Math.PI / 2; // Tangent rotation
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
                        
                        const isCrit = Math.random() < 0.1; // 10% base crit
                        const finalDamage = isCrit ? p.damage * 2 : p.damage;
                        
                        spawnDamageText(enemy.pos.x, enemy.pos.y, finalDamage, isCrit);
                        
                        // Knockback
                        const kbDir = normalizeVector({ x: enemy.pos.x - p.pos.x, y: enemy.pos.y - p.pos.y });
                        enemy.pos.x += kbDir.x * 10;
                        enemy.pos.y += kbDir.y * 10;
                    }
                }
            } else if (p.owner === 'ENEMY') {
                 // Check Player Collision
                 if (checkCollision(p, player)) {
                     player.hp -= p.damage;
                     spawnDamageText(player.pos.x, player.pos.y, p.damage, false);
                     screenShakeRef.current = 5;
                     p.pierce = 0; // Destroy projectile
                 }
            }

            // Cleanup
            if (p.duration <= 0 || p.pierce <= 0 || 
                (!p.isOrbiting && (p.pos.x < -100 || p.pos.x > CANVAS_WIDTH + 100 || p.pos.y < -100 || p.pos.y > CANVAS_HEIGHT + 100))) {
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
                    player.exp += drop.value;
                    player.bloodEssence += drop.value;
                    if (player.hp < player.maxHp) player.hp += 0.5;
                    drops.splice(i, 1);
                }
            }
        }

        // --- 8. Update Damage Texts ---
        for (let i = damageTextsRef.current.length - 1; i >= 0; i--) {
            const dt = damageTextsRef.current[i];
            dt.x += dt.velocity.x;
            dt.y += dt.velocity.y;
            dt.life--;
            if (dt.life <= 0) {
                damageTextsRef.current.splice(i, 1);
            }
        }

        // --- 9. Update Visual Effects ---
        for (let i = visualEffectsRef.current.length - 1; i >= 0; i--) {
            const vfx = visualEffectsRef.current[i];
            
            if (vfx.type === 'SHOCKWAVE') {
                vfx.radius = (vfx.radius || 10) + 5;
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
            player.nextLevelExp = Math.floor(player.nextLevelExp * 1.5);
            setGameState(GameStateEnum.LEVEL_UP);
            onLevelUp(player);
        }

        // --- 11. Blood Frenzy ---
        if (!player.isFrenzy && player.bloodEssence >= FRENZY_THRESHOLD) {
            player.isFrenzy = true;
            player.frenzyTimer = 0;
        }
        if (player.isFrenzy) {
            player.bloodEssence -= FRENZY_DRAIN_RATE;
            if (frameCountRef.current % 10 === 0) player.hp -= (player.maxHp * 0.01);
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
            // INCREASED THRESHOLD: Default SVGs are 2.0 ratio. AI Landscape often < 1.8. 
            // This prevents single images from being treated as 2-frame sheets.
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
        // Clear
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Apply Screen Shake
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Background (Pattern Tiling or Solid Color)
        if (bgPatternRef.current) {
            ctx.fillStyle = bgPatternRef.current;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            
            // Vignette overlay
            const gradient = ctx.createRadialGradient(
                CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 200, 
                CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_HEIGHT/1.2
            );
            gradient.addColorStop(0, "rgba(0,0,0,0)");
            gradient.addColorStop(1, "rgba(0,0,0,0.7)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } else {
             ctx.fillStyle = '#e5e5e5';
             ctx.fillRect(0,0, CANVAS_WIDTH, CANVAS_HEIGHT);
             ctx.fillStyle = 'rgba(0,0,0,0.1)';
             for(let i=0; i<CANVAS_WIDTH; i+=50) ctx.fillRect(i, 0, 1, CANVAS_HEIGHT);
             for(let i=0; i<CANVAS_HEIGHT; i+=50) ctx.fillRect(0, i, CANVAS_WIDTH, 1);
        }

        // Drops
        dropsRef.current.forEach(drop => {
            const bobOffset = Math.sin(frameCountRef.current * 0.1 + parseFloat(drop.id)) * 3;
            ctx.save();
            ctx.translate(drop.pos.x, drop.pos.y + bobOffset);
            
            if (drop.type === 'CHEST') {
                // Gold Chest
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 15;
                ctx.fillStyle = '#d97706';
                ctx.fillRect(-15, -15, 30, 25);
                ctx.strokeStyle = '#fef3c7';
                ctx.lineWidth = 2;
                ctx.strokeRect(-15, -15, 30, 25);
                // Lid
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(0, -15, 15, Math.PI, 0);
                ctx.fill();
                ctx.stroke();
            } else {
                // Blood Orb
                ctx.beginPath();
                if (drop.value >= 50) ctx.fillStyle = '#f59e0b'; // Gold for Boss/Elite
                else if (drop.value >= 5) ctx.fillStyle = '#a855f7'; // Purple for Cultist
                else ctx.fillStyle = '#dc2626'; // Red for Peasant
                
                ctx.arc(0, 0, drop.radius, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 10;
                ctx.strokeStyle = '#fca5a5';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            
            ctx.restore();
        });

        // Visual Effects
        visualEffectsRef.current.forEach(vfx => {
            if (vfx.type === 'DASH_GHOST' && loadedImages.player) {
                ctx.save();
                ctx.globalAlpha = (vfx.life / 20) * 0.5; // Fade out
                ctx.translate(vfx.x, vfx.y);
                ctx.scale(vfx.scaleX || 1, 1);
                drawSprite(ctx, loadedImages.player, 15, true);
                ctx.restore();
            } else if (vfx.type === 'WARNING_LINE') {
                ctx.save();
                ctx.translate(vfx.x, vfx.y);
                ctx.rotate(vfx.rotation || 0);
                ctx.fillStyle = `rgba(220, 38, 38, ${(vfx.life / 40) * 0.5})`; // Fading red
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
            }
        });

        // Enemies
        enemiesRef.current.forEach(enemy => {
            ctx.save();
            ctx.translate(enemy.pos.x, enemy.pos.y);
            
            drawShadow(ctx, enemy.radius);

            // Bobbing effect
            const bobY = Math.sin(frameCountRef.current * 0.15 + parseFloat(enemy.id)) * 2;
            ctx.translate(0, bobY);

            // State Effects
            if (enemy.state === 'PREPARING') {
                 // Shake
                 const shake = Math.sin(frameCountRef.current * 2) * 2;
                 ctx.translate(shake, 0);
            }

            // Elite Aura
            if (enemy.isElite) {
                ctx.beginPath();
                ctx.arc(0, 0, enemy.radius + 5, 0, Math.PI * 2);
                ctx.strokeStyle = '#a855f7'; // Purple
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Flip if facing left
            if (enemy.rotation === Math.PI) {
                ctx.scale(-1, 1);
            }
            
            // --- SELECT ENEMY SPRITE ---
            let spriteImg = loadedImages.enemyPeasant;
            if (enemy.type === EnemyType.BOSS) spriteImg = loadedImages.enemyBoss;
            else if (enemy.type === EnemyType.CULTIST) spriteImg = loadedImages.enemyCultist;
            else if (enemy.type === EnemyType.CHARGER) spriteImg = loadedImages.enemyCharger;
            else if (enemy.type === EnemyType.ARCHER) spriteImg = loadedImages.enemyArcher;
            
            // Removed previous Tinting logic as we now have specific sprites

            // Elite Scale
            if (enemy.isElite) {
                ctx.scale(1.3, 1.3);
            }

            drawSprite(ctx, spriteImg, enemy.radius, false);
            
            ctx.filter = 'none';
            ctx.restore();

            // Draw HP Bar for Elites and Bosses
            if (enemy.isElite || enemy.type === EnemyType.BOSS) {
                const hpWidth = enemy.radius * 2;
                const hpY = -enemy.radius * 1.5 - 10;
                ctx.fillStyle = '#000';
                ctx.fillRect(-hpWidth/2, hpY, hpWidth, 4);
                ctx.fillStyle = '#dc2626';
                ctx.fillRect(-hpWidth/2, hpY, hpWidth * (enemy.hp / enemy.maxHp), 4);
            }
        });

        // Player
        const player = playerRef.current;
        ctx.save();
        ctx.translate(player.pos.x, player.pos.y);
        
        // Golden Bell Visual
        const bellWeapon = player.weapons.find(w => w.type === WeaponType.GOLDEN_BELL);
        if (bellWeapon) {
             const radius = WEAPON_DEFAULTS[WeaponType.GOLDEN_BELL].area * bellWeapon.area * player.stats.area;
             ctx.save();
             ctx.beginPath();
             ctx.arc(0, 0, radius, 0, Math.PI * 2);
             ctx.fillStyle = `rgba(217, 119, 6, 0.1)`;
             ctx.fill();
             ctx.lineWidth = 2;
             ctx.strokeStyle = `rgba(217, 119, 6, ${0.3 + Math.sin(frameCountRef.current * 0.1) * 0.2})`;
             ctx.stroke();
             // Rotating Sanskrit text effect simulated by dots
             const dotCount = 8;
             const angleStep = (Math.PI*2)/dotCount;
             const rot = frameCountRef.current * 0.02;
             for(let i=0; i<dotCount; i++) {
                 const dx = Math.cos(rot + i*angleStep) * radius;
                 const dy = Math.sin(rot + i*angleStep) * radius;
                 ctx.fillStyle = '#f59e0b';
                 ctx.fillRect(dx-2, dy-2, 4, 4);
             }
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
            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            
            // Enemy Projectile Style
            if (p.owner === 'ENEMY') {
                if (p.radius > 50) { 
                    // Shockwave
                    ctx.beginPath();
                    ctx.arc(0, 0, p.radius, 0, Math.PI*2);
                    ctx.fillStyle = 'rgba(220,38,38,0.3)';
                    ctx.fill();
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = '#dc2626';
                    ctx.stroke();
                } else {
                    // Arrow
                    ctx.rotate(p.rotation || 0);
                    ctx.fillStyle = '#ef4444'; 
                    ctx.beginPath();
                    ctx.moveTo(10, 0);
                    ctx.lineTo(-5, 5);
                    ctx.lineTo(-5, -5);
                    ctx.fill();
                }
            } 
            // Player Projectile Style
            else {
                ctx.rotate(p.rotation || p.orbitAngle || 0);
                
                if (loadedImages.projectileSword && (p.isOrbiting || p.velocity)) {
                     // For Spirit Dagger, rotate to point forward
                     ctx.rotate(Math.PI / 4); 
                     drawSprite(ctx, loadedImages.projectileSword, 25, false, true);
                } else {
                    ctx.fillStyle = '#0ea5e9'; 
                    if (p.damage > 20) ctx.fillStyle = '#f59e0b';
                    
                    if (p.isOrbiting) {
                        ctx.fillRect(-15, -2, 30, 4);
                    } else {
                        ctx.beginPath();
                        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
            ctx.restore();
        });

        // Damage Texts
        damageTextsRef.current.forEach(dt => {
            ctx.save();
            ctx.font = dt.isCrit ? "bold 32px 'Ma Shan Zheng'" : "24px 'Ma Shan Zheng'";
            ctx.fillStyle = dt.isCrit ? '#fbbf24' : '#ef4444'; // Amber for Crit, Red for Normal
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.globalAlpha = Math.min(1, dt.life / 20); // Fade out last 20 frames
            
            const text = Math.round(dt.damage).toString();
            ctx.strokeText(text, dt.x, dt.y);
            ctx.fillText(text, dt.x, dt.y);
            
            if (dt.isCrit) {
                ctx.font = "16px sans-serif";
                ctx.fillStyle = '#fff';
                ctx.fillText("暴击!", dt.x + 20, dt.y - 10);
            }
            ctx.restore();
        });

        // End Shake Transform
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

                const scaleX = (rect.width * dpr) / CANVAS_WIDTH;
                const scaleY = (rect.height * dpr) / CANVAS_HEIGHT;
                
                ctx.save();
                ctx.scale(scaleX, scaleY);
                
                updateGame();
                drawGame(ctx);
                
                ctx.restore();
            }
        }
        requestRef.current = requestAnimationFrame(loop);
    }, [gameState, assets, loadedImages]);

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
                 visualEffectsRef.current.push({
                     id: Math.random().toString(),
                     x: player.pos.x,
                     y: player.pos.y,
                     type: 'DASH_GHOST',
                     life: 20,
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
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
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

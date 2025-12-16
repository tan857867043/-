
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameStateEnum, Player, Enemy, Projectile, Drop, Vector2D, WeaponType, GeneratedAssets, EnemyType, DamageText, VisualEffect, ArtStyle } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_BASE_SPEED, ENEMY_SPAWN_RATE, MAX_ENEMIES, WEAPON_DEFAULTS, FRENZY_THRESHOLD, FRENZY_DRAIN_RATE, PLAYER_PICKUP_RANGE } from '../constants';
import { spawnEnemy, createProjectile, checkCollision, normalizeVector, getDistance } from '../services/gameLogic';
import Joystick from './Joystick';

interface GameCanvasProps {
    gameState: GameStateEnum;
    setGameState: (state: GameStateEnum) => void;
    onLevelUp: (player: Player) => void;
    onGameOver: (score: number) => void;
    assets: GeneratedAssets;
    playerRef: React.MutableRefObject<Player>; // Shared ref for UI updates
    isTouchDevice: boolean;
}

// Helper to manage loaded images
const useImagePreloader = (assets: GeneratedAssets) => {
    const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});

    useEffect(() => {
        const images: Record<string, HTMLImageElement> = {};
        const keys: (keyof GeneratedAssets)[] = ['player', 'enemyPeasant', 'enemyBoss', 'background', 'projectileSword'];
        
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

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, setGameState, onLevelUp, onGameOver, assets, playerRef, isTouchDevice }) => {
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

    // Cache the background pattern
    const bgPatternRef = useRef<CanvasPattern | null>(null);
    
    // Input Refs
    const joystickRef = useRef<Vector2D>({ x: 0, y: 0 });
    const keysRef = useRef<{ [key: string]: boolean }>({});
    
    // Logic Timers
    const frameCountRef = useRef(0);
    const scoreRef = useRef(0);
    const lastDashTime = useRef(0);

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
                }]
            };
            enemiesRef.current = [];
            projectilesRef.current = [];
            dropsRef.current = [];
            damageTextsRef.current = [];
            visualEffectsRef.current = [];
            scoreRef.current = 0;
        }
    }, [gameState]);

    // Input Event Listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameState !== GameStateEnum.PLAYING) return;
            keysRef.current[e.code] = true;
            if (e.code === 'Space') {
                handleDash();
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
        const spawnRate = Math.max(5, ENEMY_SPAWN_RATE - Math.floor(scoreRef.current / 500));
        if (frameCountRef.current % spawnRate === 0 && enemies.length < MAX_ENEMIES) {
            const isBoss = scoreRef.current > 0 && scoreRef.current % 1000 === 0 && !enemies.some(e => e.type === EnemyType.BOSS);
            enemies.push(spawnEnemy(player.pos, isBoss ? EnemyType.BOSS : (Math.random() > 0.8 ? EnemyType.CULTIST : EnemyType.PEASANT)));
        }

        // --- 3. Enemy Logic ---
        enemies.forEach(enemy => {
            const dx = player.pos.x - enemy.pos.x;
            const dy = player.pos.y - enemy.pos.y;
            const dir = normalizeVector({ x: dx, y: dy });
            
            enemy.pos.x += dir.x * enemy.speed;
            enemy.pos.y += dir.y * enemy.speed;
            
            // Enemy facing
            if (dx < 0) enemy.rotation = Math.PI;
            else enemy.rotation = 0;

            // Collision with Player
            if (checkCollision(player, enemy)) {
                if (frameCountRef.current % 30 === 0) { 
                    player.hp -= enemy.damage;
                    spawnDamageText(player.pos.x, player.pos.y, enemy.damage, false);
                }
            }
        });

        // --- 4. Weapon Cooldowns & Firing ---
        player.weapons.forEach(w => {
            if (w.cooldownTimer > 0) {
                w.cooldownTimer -= player.stats.cooldown;
            } else {
                const newProjs = createProjectile(player, w.type);
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

            if (p.duration <= 0 || p.pierce <= 0 || 
                (!p.isOrbiting && (p.pos.x < -100 || p.pos.x > CANVAS_WIDTH + 100 || p.pos.y < -100 || p.pos.y > CANVAS_HEIGHT + 100))) {
                projectiles.splice(i, 1);
            }
        }

        // --- 6. Cleanup Dead Enemies ---
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].hp <= 0) {
                drops.push({
                    id: Math.random().toString(),
                    pos: { ...enemies[i].pos },
                    radius: 5,
                    value: enemies[i].type === EnemyType.BOSS ? 50 : (enemies[i].type === EnemyType.CULTIST ? 5 : 1),
                    type: 'BLOOD',
                    rotation: 0
                });
                scoreRef.current += 10;
                enemies.splice(i, 1);
            }
        }

        // --- 7. Pickup Logic ---
        const magnetRange = PLAYER_PICKUP_RANGE * player.stats.magnet;
        for (let i = drops.length - 1; i >= 0; i--) {
            const drop = drops[i];
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
            const drawHeight = drawWidth / aspect;

            const yOffset = -drawHeight * 0.75; 
            
            ctx.drawImage(img, -drawWidth / 2, yOffset, drawWidth, drawHeight);
            
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

        // Drops - Draw as floating spirits/orbs
        dropsRef.current.forEach(drop => {
            const bobOffset = Math.sin(frameCountRef.current * 0.1 + parseFloat(drop.id)) * 3;
            ctx.save();
            ctx.translate(drop.pos.x, drop.pos.y + bobOffset);
            
            // Inner Core
            ctx.beginPath();
            ctx.fillStyle = '#dc2626';
            ctx.arc(0, 0, drop.radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Glow
            ctx.shadowColor = '#dc2626';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#fca5a5';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.restore();
        });

        // Visual Effects (Dash Trails)
        visualEffectsRef.current.forEach(vfx => {
            if (vfx.type === 'DASH_GHOST' && loadedImages.player) {
                ctx.save();
                ctx.globalAlpha = (vfx.life / 20) * 0.5; // Fade out
                ctx.translate(vfx.x, vfx.y);
                ctx.scale(vfx.scaleX || 1, 1);
                
                // Draw ghost with same logic as player
                drawSprite(ctx, loadedImages.player, 15, true);
                
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

            // Flip if facing left
            if (enemy.rotation === Math.PI) {
                ctx.scale(-1, 1);
            }
            
            let spriteImg = loadedImages.enemyPeasant;
            if (enemy.type === EnemyType.BOSS) spriteImg = loadedImages.enemyBoss;
            
            drawSprite(ctx, spriteImg, enemy.radius, false);
            
            ctx.restore();
        });

        // Player
        const player = playerRef.current;
        ctx.save();
        ctx.translate(player.pos.x, player.pos.y);
        
        if (player.isFrenzy) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(220, 38, 38, ${0.5 + Math.sin(frameCountRef.current * 0.1) * 0.2})`;
            ctx.lineWidth = 4;
            ctx.arc(0, 0, player.radius + 15, 0, Math.PI * 2);
            ctx.stroke();
        }

        drawShadow(ctx, player.radius);
        
        // Bobbing for player
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
            ctx.rotate(p.rotation || p.orbitAngle || 0);
            
            if (loadedImages.projectileSword && p.isOrbiting) {
                 ctx.rotate(Math.PI / 4); 
                 // Pass true for isProjectile to trigger Screen blend mode (for Black BG)
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
        const now = Date.now();
        if (now - lastDashTime.current > 1000) { 
             const moveVec = getCombinedInputVector();
             const player = playerRef.current;
             
             let dashX = moveVec.x;
             let dashY = moveVec.y;
             
             if (dashX === 0 && dashY === 0) {
                 const rot = player.rotation || 0;
                 dashX = Math.cos(rot);
                 dashY = Math.sin(rot);
             }

             if (dashX !== 0 || dashY !== 0) {
                 // Spawn ghost at start pos
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
                 
                 // Spawn ghost at mid pos (interpolation)
                 visualEffectsRef.current.push({
                     id: Math.random().toString(),
                     x: player.pos.x - dashX * 50,
                     y: player.pos.y - dashY * 50,
                     type: 'DASH_GHOST',
                     life: 15,
                     scaleX: player.rotation === Math.PI ? -1 : 1
                 });

                 lastDashTime.current = now;
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
                        className="absolute bottom-10 right-10 w-24 h-24 rounded-full bg-slate-800/80 border-4 border-slate-500 text-white font-ink text-4xl active:scale-95 transition-transform flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] z-40 md:opacity-80 hover:opacity-100"
                    >
                        闪
                    </button>
                </>
            )}
        </div>
    );
};

export default GameCanvas;


import React, { useState, useEffect, useRef } from 'react';
import { GameStateEnum, Player, UpgradeOption, WeaponType, GeneratedAssets, ArtStyle } from './types';
import GameCanvas from './components/GameCanvas';
import { generateGameAssets, generateFlavorText } from './services/geminiService';
import { WEAPON_DEFAULTS, DEFAULT_ASSETS, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

const ASSET_STORAGE_KEY = 'WUXIA_GAME_ASSETS_V1';

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameStateEnum>(GameStateEnum.MENU);
    const [assets, setAssets] = useState<GeneratedAssets>(DEFAULT_ASSETS);
    const [flavorText, setFlavorText] = useState("江湖路远，生死由命。");
    const [upgrades, setUpgrades] = useState<UpgradeOption[]>([]);
    const [score, setScore] = useState(0);
    const [selectedStyle, setSelectedStyle] = useState<ArtStyle>(ArtStyle.INK);
    const [hasSavedAssets, setHasSavedAssets] = useState(false);
    
    // Layout State
    const [layoutStyle, setLayoutStyle] = useState<React.CSSProperties>({});
    const [isTouch, setIsTouch] = useState(false);

    // Player Ref shared with GameCanvas
    const playerRef = useRef<Player>({} as Player);

    // UI Updates Loop
    const [hudState, setHudState] = useState({ hp: 100, maxHp: 100, exp: 0, nextExp: 100, level: 1, blood: 0, maxBlood: 100, isFrenzy: false });
    
    // 1. Layout & Platform Detection
    useEffect(() => {
        // Detect Touch
        setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);

        // Responsive Sizing (Maintain Aspect Ratio)
        const handleResize = () => {
            const targetRatio = CANVAS_WIDTH / CANVAS_HEIGHT; // 0.666...
            const winW = window.innerWidth;
            const winH = window.innerHeight; // Use innerHeight to handle mobile address bars better usually
            const winRatio = winW / winH;

            let w, h;

            if (winRatio > targetRatio) {
                // Screen is wider than game (PC / Tablet Landscape) -> Constrain by Height
                h = winH;
                w = h * targetRatio;
            } else {
                // Screen is narrower than game (Mobile Portrait) -> Constrain by Width
                w = winW;
                h = w / targetRatio;
            }

            setLayoutStyle({
                width: w,
                height: h,
                // On very tall mobile screens, we might want to center vertically if aspect ratio doesn't match
                // But usually we just fill width and let height scroll or clip? 
                // Best for game: Fit inside without scrolling.
                // Re-calculation for "Contain" logic:
                ...(winRatio < targetRatio && (h > winH) ? { height: winH, width: winH * targetRatio } : {})
            });
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 2. Load Assets from Storage on Mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(ASSET_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setAssets({
                    ...DEFAULT_ASSETS,
                    ...parsed
                });
                setHasSavedAssets(true);
            }
        } catch (e) {
            console.error("Failed to load assets", e);
        }
    }, []);

    useEffect(() => {
        if (gameState !== GameStateEnum.PLAYING) return;
        const interval = setInterval(() => {
            if (playerRef.current) {
                setHudState({
                    hp: playerRef.current.hp,
                    maxHp: playerRef.current.maxHp,
                    exp: playerRef.current.exp,
                    nextExp: playerRef.current.nextLevelExp,
                    level: playerRef.current.level,
                    blood: playerRef.current.bloodEssence,
                    maxBlood: playerRef.current.maxBloodEssence,
                    isFrenzy: playerRef.current.isFrenzy
                });
            }
        }, 100);
        return () => clearInterval(interval);
    }, [gameState]);

    const startGame = () => {
        setGameState(GameStateEnum.PLAYING);
    };

    const handleGenerateAssets = async () => {
        setGameState(GameStateEnum.ASSET_GEN);
        try {
            const newAssets = await generateGameAssets(selectedStyle);
            
            const finalAssets = {
                currentStyle: newAssets.currentStyle,
                player: newAssets.player || DEFAULT_ASSETS.player,
                enemyPeasant: newAssets.enemyPeasant || DEFAULT_ASSETS.enemyPeasant,
                enemyBoss: newAssets.enemyBoss || DEFAULT_ASSETS.enemyBoss,
                background: DEFAULT_ASSETS.background,
                projectileSword: newAssets.projectileSword || DEFAULT_ASSETS.projectileSword,
            };

            setAssets(finalAssets);
            setHasSavedAssets(true);
            
            try {
                localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(finalAssets));
            } catch (e) {
                console.error("Storage full or error", e);
                alert("素材已生成，但本地存储空间不足，无法保存下次使用。");
            }

            const text = await generateFlavorText("Hero preparing to fight blood cultists");
            setFlavorText(text);
        } catch (e) {
            console.error(e);
            alert("生成失败 (Generation failed)");
        }
        setGameState(GameStateEnum.MENU);
    };

    const handleClearAssets = () => {
        localStorage.removeItem(ASSET_STORAGE_KEY);
        setAssets(DEFAULT_ASSETS);
        setHasSavedAssets(false);
    }

    const handleLevelUp = (player: Player) => {
        const newUpgrades: UpgradeOption[] = ([
            { id: '1', name: '万剑归宗', description: '御剑术更进一步，召唤更多飞剑护体', rarity: 'COMMON', type: 'WEAPON', weaponType: WeaponType.SWORD_AURA, icon: '🗡️' },
            { id: '2', name: '如来神掌', description: '掌法刚猛，击退敌人并造成巨额伤害', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.PALM_STRIKE, icon: '✋' },
            { id: '3', name: '易筋经', description: '打通经脉，全方位提升内功修为与伤害', rarity: 'LEGENDARY', type: 'STAT', statType: 'might', value: 0.1, icon: '📜' },
             { id: '4', name: '神行百变', description: '身法诡谲，移动速度大幅提升', rarity: 'COMMON', type: 'STAT', statType: 'speed', value: 0.1, icon: '🦶' }
        ] as UpgradeOption[]).sort(() => 0.5 - Math.random()).slice(0, 3);
        
        setUpgrades(newUpgrades);
    };

    const selectUpgrade = (option: UpgradeOption) => {
        const player = playerRef.current;
        if (option.type === 'WEAPON' && option.weaponType) {
            const weapon = player.weapons.find(w => w.type === option.weaponType);
            if (weapon) {
                weapon.level++;
                weapon.damage += 5;
            } else {
                player.weapons.push({
                    type: option.weaponType,
                    level: 1,
                    cooldownTimer: 0,
                    baseCooldown: WEAPON_DEFAULTS[option.weaponType].cooldown,
                    damage: WEAPON_DEFAULTS[option.weaponType].damage,
                    area: 1
                });
            }
        } else if (option.type === 'STAT' && option.statType && option.value) {
            player.stats[option.statType] += option.value;
        }
        setGameState(GameStateEnum.PLAYING);
    };

    const handleGameOver = (finalScore: number) => {
        setScore(finalScore);
    };

    return (
        <div className="w-full h-[100dvh] bg-neutral-950 text-slate-100 font-serif overflow-hidden flex items-center justify-center select-none">
            
            {/* Game Container - Maintains Aspect Ratio */}
            <div 
                className="relative bg-slate-900 shadow-2xl overflow-hidden"
                style={layoutStyle}
            >
                {/* Game Canvas Layer */}
                <GameCanvas 
                    gameState={gameState} 
                    setGameState={setGameState}
                    onLevelUp={handleLevelUp}
                    onGameOver={handleGameOver}
                    assets={assets}
                    playerRef={playerRef}
                    isTouchDevice={isTouch}
                />

                {/* HUD Layer */}
                {gameState === GameStateEnum.PLAYING && (
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 flex flex-col justify-between">
                        
                        {/* Top Bar: HP and Stats */}
                        <div className="flex justify-between items-start p-6">
                            {/* Player Status */}
                            <div className="flex flex-col gap-2">
                                {/* HP Bar - Ink Style */}
                                <div className="flex items-center gap-2">
                                    <div className="w-12 h-12 rounded-full border-4 border-slate-700 bg-slate-800 flex items-center justify-center shadow-lg z-20">
                                        <span className="font-ink text-2xl text-red-500">命</span>
                                    </div>
                                    <div className="h-6 w-48 bg-slate-900/80 border-2 border-slate-600 rounded-r-xl relative -ml-4 overflow-hidden shadow-md">
                                        <div 
                                            className="h-full bg-gradient-to-r from-red-900 via-red-600 to-red-500 transition-all duration-300 ease-out" 
                                            style={{ width: `${(hudState.hp / hudState.maxHp) * 100}%` }}
                                        />
                                        <span className="absolute right-2 top-0 text-xs text-slate-300 font-mono leading-6">
                                            {Math.ceil(hudState.hp)}/{hudState.maxHp}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* EXP Bar */}
                                <div className="w-64 h-2 bg-slate-800/50 mt-1 rounded-full overflow-hidden ml-2">
                                    <div 
                                        className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all duration-300"
                                        style={{ width: `${(hudState.exp / hudState.nextExp) * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Right Stats */}
                            <div className="flex flex-col items-end gap-2">
                                <div className="text-4xl font-ink text-amber-500 text-shadow-ink">
                                    境界 <span className="text-white">{hudState.level}</span>
                                </div>
                                
                                {/* Frenzy Meter */}
                                <div className="flex items-center gap-2 mt-2">
                                    <span className={`font-ink text-xl ${hudState.isFrenzy ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                                        {hudState.isFrenzy ? '血煞爆发' : '血煞值'}
                                    </span>
                                    <div className={`w-32 h-4 border border-slate-600 bg-slate-900/80 skew-x-12 overflow-hidden relative ${hudState.isFrenzy ? 'shadow-[0_0_15px_rgba(220,38,38,0.6)]' : ''}`}>
                                        <div 
                                            className={`h-full transition-all duration-100 ${hudState.isFrenzy ? 'bg-red-500' : 'bg-red-900/60'}`}
                                            style={{ width: `${(hudState.blood / hudState.maxBlood) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Menu Layer */}
                {gameState === GameStateEnum.MENU && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-50">
                        {/* Background Pattern */}
                        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]"></div>
                        
                        <div className="relative z-10 flex flex-col items-center w-full px-4">
                            <h1 className="text-6xl md:text-8xl font-ink text-red-700 mb-4 text-shadow-ink tracking-widest animate-pulse text-center">
                                血影武侠
                            </h1>
                            <p className="text-lg md:text-xl text-slate-400 mb-10 italic font-serif max-w-lg text-center leading-relaxed">
                                "{flavorText}"
                            </p>
                            
                            <div className="flex flex-col gap-6 w-full max-w-xs items-center">
                                <button 
                                    onClick={startGame}
                                    className="group relative w-full px-8 py-4 bg-transparent border-2 border-red-800 text-red-500 font-ink text-3xl hover:bg-red-900/20 transition-all overflow-hidden"
                                >
                                    <span className="relative z-10 group-hover:text-red-400 transition-colors">踏入江湖</span>
                                    <div className="absolute inset-0 bg-red-900/10 transform -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                                </button>
                                
                                {/* Style Selector */}
                                <div className="flex flex-col items-center w-full gap-2">
                                    <label className="text-slate-500 text-xs font-serif uppercase tracking-wider">美术风格 (Art Style)</label>
                                    <div className="flex gap-2 w-full">
                                        {[
                                            { id: ArtStyle.INK, label: '水墨' },
                                            { id: ArtStyle.ANIME, label: '动漫' },
                                            { id: ArtStyle.PIXEL, label: '像素' },
                                            { id: ArtStyle.OIL, label: '厚涂' }
                                        ].map(style => (
                                            <button
                                                key={style.id}
                                                onClick={() => setSelectedStyle(style.id)}
                                                className={`flex-1 py-1 text-sm border ${selectedStyle === style.id ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-800 text-slate-600 hover:border-slate-600'}`}
                                            >
                                                {style.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button 
                                    onClick={handleGenerateAssets}
                                    className="w-full text-amber-600 hover:text-amber-500 text-sm font-serif border border-amber-900/30 bg-amber-900/10 py-2 hover:bg-amber-900/20 transition-colors"
                                >
                                    ✨ AI生成新素材
                                </button>
                                
                                {hasSavedAssets && (
                                    <button 
                                        onClick={handleClearAssets}
                                        className="text-xs text-red-900/50 hover:text-red-500 underline"
                                    >
                                        清除本地保存的素材
                                    </button>
                                )}
                            </div>
                            
                            {/* Controls Hint */}
                            <div className="mt-12 text-slate-600 flex gap-4 md:gap-8 font-mono text-xs md:text-sm border-t border-slate-800 pt-8">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="border border-slate-700 rounded px-2 py-1 bg-slate-900">WASD / ⬆⬇⬅➡</span>
                                    <span>移动</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="border border-slate-700 rounded px-2 py-1 bg-slate-900 min-w-[3rem] text-center">SPACE</span>
                                    <span>闪避</span>
                                </div>
                                {isTouch && (
                                    <div className="flex flex-col items-center gap-1 text-amber-600/70">
                                        <span className="border border-amber-900/30 rounded px-2 py-1">触摸屏</span>
                                        <span>已启用摇杆</span>
                                    </div>
                                )}
                            </div>

                            {hasSavedAssets ? (
                                <span className="absolute bottom-4 text-green-700 text-xs animate-pulse">
                                    已加载本地江湖绘卷 (Assets Loaded)
                                </span>
                            ) : (
                                assets.player && <span className="absolute bottom-4 text-slate-700 text-xs">默认素材就绪</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Asset Generation Loading */}
                {gameState === GameStateEnum.ASSET_GEN && (
                    <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
                        <div className="w-20 h-20 border-t-4 border-r-2 border-red-800 rounded-full animate-spin mb-6 opacity-80"></div>
                        <p className="text-slate-300 font-ink text-3xl animate-pulse tracking-widest">墨宝绘制中...</p>
                        <p className="text-slate-600 mt-4 font-serif text-sm">AI正在凝聚江湖画卷 (约需10秒)...</p>
                    </div>
                )}

                {/* Level Up Screen */}
                {gameState === GameStateEnum.LEVEL_UP && (
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
                        <h2 className="text-4xl md:text-5xl font-ink text-amber-500 mb-2 text-shadow-ink animate-bounce">境界突破</h2>
                        <p className="text-slate-400 font-serif mb-6 md:mb-10">请选择一本秘籍修炼</p>
                        
                        <div className="flex flex-col md:flex-row gap-4 md:gap-6 w-full max-w-5xl justify-center items-stretch h-full md:h-96 overflow-y-auto md:overflow-visible pb-10 md:pb-0">
                            {upgrades.map((u, idx) => (
                                <div 
                                    key={u.id}
                                    onClick={() => selectUpgrade(u)}
                                    className="group relative flex-1 min-h-[200px] cursor-pointer perspective-1000 shrink-0"
                                >
                                    {/* Card Body */}
                                    <div className={`
                                        h-full flex flex-col items-center p-6 md:py-12 border-4 
                                        transition-all duration-300 transform group-hover:-translate-y-4 group-hover:rotate-1
                                        ${u.rarity === 'LEGENDARY' 
                                            ? 'bg-[#2c1a1a] border-amber-600/60 shadow-[0_0_30px_rgba(217,119,6,0.2)]' 
                                            : 'bg-[#1e1e1e] border-slate-600 shadow-xl'}
                                        bg-paper-pattern
                                    `}>
                                        <div className="text-5xl md:text-6xl mb-4 md:mb-6 opacity-80 group-hover:scale-110 transition-transform">{u.icon || '⚔️'}</div>
                                        
                                        <h3 className={`text-2xl md:text-3xl font-ink mb-2 md:mb-4 text-center ${u.rarity === 'LEGENDARY' ? 'text-amber-500' : 'text-slate-200'}`}>
                                            {u.name}
                                        </h3>
                                        
                                        <div className="w-full h-px bg-current opacity-20 mb-4"></div>
                                        
                                        <p className={`text-center font-serif text-sm md:text-base leading-relaxed ${u.rarity === 'LEGENDARY' ? 'text-amber-200/70' : 'text-slate-400'}`}>
                                            {u.description}
                                        </p>

                                        <div className="absolute bottom-4 right-4 opacity-20 transform -rotate-12 border-2 border-red-500 text-red-500 p-1 font-ink text-xs rounded">
                                            {u.rarity === 'LEGENDARY' ? '绝世' : (u.rarity === 'RARE' ? '稀有' : '普通')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Game Over Screen */}
                {gameState === GameStateEnum.GAME_OVER && (
                    <div className="absolute inset-0 bg-[#0f0f0f] flex flex-col items-center justify-center z-50">
                        <div className="relative border-y-4 border-red-900/50 py-12 w-full flex flex-col items-center bg-red-900/10">
                            <h2 className="text-6xl md:text-8xl font-ink text-red-600 mb-6 text-shadow-red animate-pulse text-center">
                                胜败乃兵家常事
                            </h2>
                            <div className="flex flex-col items-center gap-2 mb-10">
                                <span className="text-slate-400 font-serif uppercase tracking-widest text-sm">最终得分</span>
                                <span className="text-5xl font-mono text-white">{score}</span>
                            </div>
                            
                            <button 
                                onClick={() => setGameState(GameStateEnum.MENU)}
                                className="px-12 py-4 bg-slate-100 text-black font-ink text-3xl border-2 border-slate-400 hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                            >
                                重入江湖
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;

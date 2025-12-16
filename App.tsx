
import React, { useState, useEffect, useRef } from 'react';
import { GameStateEnum, Player, UpgradeOption, WeaponType, GeneratedAssets, ArtStyle } from './types';
import GameCanvas from './components/GameCanvas';
import { generateGameAssets, generateFlavorText, setGlobalApiKey, hasValidApiKey, getGlobalApiKey } from './services/geminiService';
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
    
    // API Key State
    const [apiKeyInput, setApiKeyInput] = useState(getGlobalApiKey());
    const [isKeyValid, setIsKeyValid] = useState(hasValidApiKey());

    // Layout State
    const [layoutStyle, setLayoutStyle] = useState<React.CSSProperties>({});
    const [isTouch, setIsTouch] = useState(false);
    
    // Chest State
    const [chestReward, setChestReward] = useState<{name: string, desc: string, icon: string} | null>(null);

    // Player Ref shared with GameCanvas
    const playerRef = useRef<Player>({} as Player);

    // UI Updates Loop
    const [hudState, setHudState] = useState({ 
        hp: 100, maxHp: 100, 
        exp: 0, nextExp: 100, 
        level: 1, 
        blood: 0, maxBlood: 100, 
        isFrenzy: false,
        dashTimer: 0,
        maxDashTimer: 60
    });
    
    // 1. Layout & Platform Detection
    useEffect(() => {
        setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
        const handleResize = () => {
            const targetRatio = CANVAS_WIDTH / CANVAS_HEIGHT; 
            const winW = window.innerWidth;
            const winH = window.innerHeight; 
            const winRatio = winW / winH;
            let w, h;
            if (winRatio > targetRatio) {
                h = winH;
                w = h * targetRatio;
            } else {
                w = winW;
                h = w / targetRatio;
            }
            setLayoutStyle({ width: w, height: h });
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 2. Load Assets
    useEffect(() => {
        try {
            const saved = localStorage.getItem(ASSET_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setAssets({ ...DEFAULT_ASSETS, ...parsed });
                setHasSavedAssets(true);
            }
        } catch (e) {
            console.error("Failed to load assets", e);
        }
    }, []);

    // HUD Loop
    useEffect(() => {
        if (gameState !== GameStateEnum.PLAYING && gameState !== GameStateEnum.PAUSED) return;
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
                    isFrenzy: playerRef.current.isFrenzy,
                    dashTimer: playerRef.current.dashTimer || 0,
                    maxDashTimer: playerRef.current.maxDashTimer || 60
                });
            }
        }, 50); // Faster update for dash cooldown
        return () => clearInterval(interval);
    }, [gameState]);

    const handleSaveKey = () => {
        if (apiKeyInput.trim().length > 0) {
            setGlobalApiKey(apiKeyInput.trim());
            setIsKeyValid(true);
            alert("API Key 已保存！");
        }
    };

    const startGame = () => {
        setGameState(GameStateEnum.PLAYING);
    };

    const handleGenerateAssets = async () => {
        if (!isKeyValid) {
            alert("请先输入有效的 Gemini API Key 才能生成素材！");
            return;
        }

        setGameState(GameStateEnum.ASSET_GEN);
        try {
            const newAssets = await generateGameAssets(selectedStyle);
            
            const finalAssets = {
                currentStyle: newAssets.currentStyle,
                player: newAssets.player || DEFAULT_ASSETS.player,
                enemyPeasant: newAssets.enemyPeasant || DEFAULT_ASSETS.enemyPeasant,
                enemyCultist: newAssets.enemyCultist || DEFAULT_ASSETS.enemyCultist,
                enemyCharger: newAssets.enemyCharger || DEFAULT_ASSETS.enemyCharger,
                enemyArcher: newAssets.enemyArcher || DEFAULT_ASSETS.enemyArcher,
                enemyBoss: newAssets.enemyBoss || DEFAULT_ASSETS.enemyBoss,
                background: DEFAULT_ASSETS.background,
                projectileSword: newAssets.projectileSword || DEFAULT_ASSETS.projectileSword,
            };

            setAssets(finalAssets);
            setHasSavedAssets(true);
            localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(finalAssets));
            const text = await generateFlavorText("Hero preparing to fight blood cultists");
            setFlavorText(text);
        } catch (e: any) {
            console.error(e);
            if (e.message === 'API_KEY_MISSING') {
                alert("API Key 缺失，请在菜单设置。");
            } else {
                alert("生成失败，请检查 API Key 配额或网络连接。");
            }
        }
        setGameState(GameStateEnum.MENU);
    };

    const handleClearAssets = () => {
        if (confirm("确定要清除本地保存的素材并恢复默认吗？")) {
            localStorage.removeItem(ASSET_STORAGE_KEY);
            setAssets(DEFAULT_ASSETS);
            setHasSavedAssets(false);
        }
    }

    const handleDownloadAssets = () => {
        const dataStr = JSON.stringify(assets, null, 4);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `wuxia_assets_${new Date().getTime()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleLevelUp = (player: Player) => {
        const weaponPool = [
            { id: 'weapon_sword', name: '万剑归宗', description: '御剑术更进一步，召唤更多飞剑护体', rarity: 'COMMON', type: 'WEAPON', weaponType: WeaponType.SWORD_AURA, icon: '🗡️' },
            { id: 'weapon_palm', name: '如来神掌', description: '掌法刚猛，击退敌人并造成巨额伤害', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.PALM_STRIKE, icon: '✋' },
            { id: 'weapon_bell', name: '金钟罩', description: '真气护体，持续伤害周围敌人并击退', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.GOLDEN_BELL, icon: '🔔' },
            { id: 'weapon_dagger', name: '追魂剑', description: '飞剑自动索敌，百步穿杨', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.SPIRIT_DAGGER, icon: '🌠' },
        ];
        
        const statPool = [
            { id: 'stat_might', name: '易筋经', description: '打通经脉，全方位提升内功修为与伤害', rarity: 'LEGENDARY', type: 'STAT', statType: 'might', value: 0.1, icon: '📜' },
            { id: 'stat_speed', name: '神行百变', description: '身法诡谲，移动速度大幅提升', rarity: 'COMMON', type: 'STAT', statType: 'speed', value: 0.1, icon: '🦶' },
            { id: 'stat_cd', name: '洗髓经', description: '气息绵长，武功回复速度提升', rarity: 'COMMON', type: 'STAT', statType: 'cooldown', value: 0.1, icon: '⏳' },
            { id: 'stat_area', name: '狮子吼', description: '内力深厚，招式范围大幅扩大', rarity: 'COMMON', type: 'STAT', statType: 'area', value: 0.15, icon: '🦁' },
        ];

        const allOptions = [...weaponPool, ...statPool] as UpgradeOption[];
        
        // Randomly pick 3
        const newUpgrades = allOptions.sort(() => 0.5 - Math.random()).slice(0, 3);
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

    const handleChestPickup = () => {
        setGameState(GameStateEnum.CHEST_REWARD);
        // Determine Reward
        const rand = Math.random();
        if (rand < 0.4) {
            // Gold
            setScore(s => s + 500);
            setChestReward({ name: '金元宝', desc: '获得 500 分', icon: '💰' });
        } else if (rand < 0.7) {
            // Heal
            playerRef.current.hp = playerRef.current.maxHp;
            playerRef.current.bloodEssence = playerRef.current.maxBloodEssence;
            setChestReward({ name: '造化仙丹', desc: '恢复所有生命与血煞值', icon: '💊' });
        } else {
            // Weapon Upgrade
            const player = playerRef.current;
            if (player.weapons.length > 0) {
                 const w = player.weapons[Math.floor(Math.random() * player.weapons.length)];
                 w.level++;
                 w.damage += 10;
                 setChestReward({ name: '武学顿悟', desc: `随机强化一门武功: ${w.type}`, icon: '📚' });
            } else {
                // Fallback
                setScore(s => s + 500);
                setChestReward({ name: '金元宝', desc: '获得 500 分', icon: '💰' });
            }
        }
    };

    const closeChestReward = () => {
        setChestReward(null);
        setGameState(GameStateEnum.PLAYING);
    }

    const handleGameOver = (finalScore: number) => {
        setScore(finalScore);
    };

    return (
        <div className="w-full h-[100dvh] bg-neutral-950 text-slate-100 font-serif overflow-hidden flex items-center justify-center select-none">
            
            <div className="relative bg-slate-900 shadow-2xl overflow-hidden" style={layoutStyle}>
                <GameCanvas 
                    gameState={gameState} 
                    setGameState={setGameState}
                    onLevelUp={handleLevelUp}
                    onGameOver={handleGameOver}
                    assets={assets}
                    playerRef={playerRef}
                    isTouchDevice={isTouch}
                    onChestPickup={handleChestPickup}
                />

                {/* Low HP Vignette */}
                <div 
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0"
                    style={{
                        boxShadow: 'inset 0 0 100px rgba(185, 28, 28, 0.8)',
                        opacity: hudState.hp < hudState.maxHp * 0.3 ? (1 - hudState.hp / (hudState.maxHp * 0.3)) : 0
                    }}
                />

                {/* Pause Button (Desktop/Mobile) */}
                {gameState === GameStateEnum.PLAYING && (
                    <button 
                        onClick={() => setGameState(GameStateEnum.PAUSED)}
                        className="absolute top-6 right-6 z-30 w-10 h-10 rounded bg-slate-800/80 border border-slate-600 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                    >
                        II
                    </button>
                )}

                {/* HUD */}
                {(gameState === GameStateEnum.PLAYING || gameState === GameStateEnum.PAUSED) && (
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 flex flex-col justify-between">
                        <div className="flex justify-between items-start p-6">
                            <div className="flex flex-col gap-2">
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
                                <div className="w-64 h-2 bg-slate-800/50 mt-1 rounded-full overflow-hidden ml-2">
                                    <div className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] transition-all duration-300" style={{ width: `${(hudState.exp / hudState.nextExp) * 100}%` }} />
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 mr-10">
                                <div className="text-4xl font-ink text-amber-500 text-shadow-ink">
                                    境界 <span className="text-white">{hudState.level}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className={`font-ink text-xl ${hudState.isFrenzy ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>
                                        {hudState.isFrenzy ? '血煞爆发' : '血煞值'}
                                    </span>
                                    <div className={`w-32 h-4 border border-slate-600 bg-slate-900/80 skew-x-12 overflow-hidden relative ${hudState.isFrenzy ? 'shadow-[0_0_15px_rgba(220,38,38,0.6)]' : ''}`}>
                                        <div className={`h-full transition-all duration-100 ${hudState.isFrenzy ? 'bg-red-500' : 'bg-red-900/60'}`} style={{ width: `${(hudState.blood / hudState.maxBlood) * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Skill Icon */}
                        {!isTouch && (
                            <div className="absolute bottom-6 right-6 flex items-center gap-4 pointer-events-auto">
                                <div className="relative w-16 h-16 bg-slate-800 border-2 border-slate-600 rounded flex items-center justify-center shadow-lg">
                                    <span className="font-ink text-2xl text-white">闪</span>
                                    <span className="absolute -top-2 -right-2 bg-slate-900 text-xs px-1 rounded border border-slate-600">SPACE</span>
                                    {/* Cooldown Overlay */}
                                    <div 
                                        className="absolute inset-0 bg-black/60 origin-bottom transition-transform duration-75"
                                        style={{ transform: `scaleY(${hudState.dashTimer / hudState.maxDashTimer})` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Pause Menu */}
                {gameState === GameStateEnum.PAUSED && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                        <h2 className="text-6xl font-ink text-white mb-8 text-shadow-ink">暂停</h2>
                        <div className="flex flex-col gap-4 w-64">
                            <button 
                                onClick={() => setGameState(GameStateEnum.PLAYING)}
                                className="px-6 py-3 bg-slate-800 border border-slate-500 text-white font-serif hover:bg-slate-700 hover:scale-105 transition-all"
                            >
                                继续游戏
                            </button>
                            <button 
                                onClick={() => setGameState(GameStateEnum.MENU)}
                                className="px-6 py-3 bg-red-900/50 border border-red-800 text-red-200 font-serif hover:bg-red-900 hover:scale-105 transition-all"
                            >
                                退出江湖
                            </button>
                        </div>
                    </div>
                )}

                {gameState === GameStateEnum.MENU && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-50">
                        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')]"></div>
                        <div className="relative z-10 flex flex-col items-center w-full px-4">
                            <h1 className="text-6xl md:text-8xl font-ink text-red-700 mb-4 text-shadow-ink tracking-widest animate-pulse text-center">血影武侠</h1>
                            <p className="text-lg md:text-xl text-slate-400 mb-6 italic font-serif max-w-lg text-center leading-relaxed">"{flavorText}"</p>
                            
                            {/* API Key Input */}
                            <div className="flex items-center gap-2 mb-6 w-full max-w-xs">
                                <input 
                                    type="password" 
                                    placeholder="输入 Gemini API Key" 
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    className="flex-1 bg-slate-800 border border-slate-600 px-3 py-2 text-xs text-white rounded focus:border-red-500 outline-none"
                                />
                                <button onClick={handleSaveKey} className="bg-slate-700 px-3 py-2 text-xs text-white rounded hover:bg-slate-600">
                                    保存
                                </button>
                            </div>

                            <div className="flex flex-col gap-4 w-full max-w-xs items-center">
                                <button 
                                    onClick={startGame}
                                    className="group relative w-full px-8 py-4 bg-transparent border-2 border-red-800 text-red-500 font-ink text-3xl hover:bg-red-900/20 transition-all overflow-hidden"
                                >
                                    <span className="relative z-10 group-hover:text-red-400 transition-colors">踏入江湖</span>
                                    <div className="absolute inset-0 bg-red-900/10 transform -skew-x-12 translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
                                </button>
                                
                                <div className="flex flex-col items-center w-full gap-2">
                                    <label className="text-slate-500 text-xs font-serif uppercase tracking-wider">美术风格</label>
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
                                    disabled={!isKeyValid}
                                    className={`w-full text-sm font-serif border py-2 transition-colors flex items-center justify-center gap-2 ${isKeyValid ? 'text-amber-600 hover:text-amber-500 border-amber-900/30 bg-amber-900/10 hover:bg-amber-900/20' : 'text-slate-600 border-slate-800 bg-transparent cursor-not-allowed'}`}
                                >
                                    {isKeyValid ? '✨ AI生成新素材' : '🔒 需要 API Key 生成素材'}
                                </button>
                                
                                {hasSavedAssets && (
                                    <div className="flex gap-4 mt-2 w-full justify-center">
                                         <button 
                                            onClick={handleDownloadAssets}
                                            className="text-xs text-slate-500 hover:text-amber-500 underline decoration-dotted underline-offset-4"
                                        >
                                            📥 导出素材 (JSON)
                                        </button>
                                        <button 
                                            onClick={handleClearAssets}
                                            className="text-xs text-slate-500 hover:text-red-500 underline decoration-dotted underline-offset-4"
                                        >
                                            🗑️ 清除本地保存
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="mt-8 text-slate-600 flex gap-4 md:gap-8 font-mono text-xs md:text-sm border-t border-slate-800 pt-8">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="border border-slate-700 rounded px-2 py-1 bg-slate-900">WASD</span>
                                    <span>移动</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="border border-slate-700 rounded px-2 py-1 bg-slate-900 min-w-[3rem] text-center">SPACE</span>
                                    <span>闪避</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <span className="border border-slate-700 rounded px-2 py-1 bg-slate-900 min-w-[3rem] text-center">ESC</span>
                                    <span>暂停</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === GameStateEnum.ASSET_GEN && (
                    <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
                        <div className="w-20 h-20 border-t-4 border-r-2 border-red-800 rounded-full animate-spin mb-6 opacity-80"></div>
                        <p className="text-slate-300 font-ink text-3xl animate-pulse tracking-widest">墨宝绘制中...</p>
                        <p className="text-slate-600 mt-4 font-serif text-sm">AI正在凝聚江湖画卷 (约需10秒)...</p>
                    </div>
                )}

                {gameState === GameStateEnum.LEVEL_UP && (
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
                        <h2 className="text-4xl md:text-5xl font-ink text-amber-500 mb-2 text-shadow-ink animate-bounce">境界突破</h2>
                        <p className="text-slate-400 font-serif mb-6 md:mb-10">请选择一本秘籍修炼</p>
                        
                        <div className="flex flex-col md:flex-row gap-4 md:gap-6 w-full max-w-5xl justify-center items-stretch h-full md:h-96 overflow-y-auto md:overflow-visible pb-10 md:pb-0">
                            {upgrades.map((u) => (
                                <div 
                                    key={u.id}
                                    onClick={() => selectUpgrade(u)}
                                    className="group relative flex-1 min-h-[200px] cursor-pointer perspective-1000 shrink-0"
                                >
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
                
                {gameState === GameStateEnum.CHEST_REWARD && chestReward && (
                     <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4 animate-in fade-in duration-300">
                        <div className="bg-[#1a1a1a] border-4 border-amber-600 p-8 md:p-12 rounded-lg max-w-lg w-full flex flex-col items-center relative shadow-[0_0_50px_rgba(217,119,6,0.5)]">
                            <h2 className="text-4xl md:text-5xl font-ink text-amber-500 mb-6 text-shadow-ink">获得宝物</h2>
                            <div className="text-8xl mb-6 animate-bounce">{chestReward.icon}</div>
                            <h3 className="text-2xl md:text-3xl text-white mb-2 font-ink">{chestReward.name}</h3>
                            <p className="text-slate-400 text-center mb-8 font-serif">{chestReward.desc}</p>
                            <button 
                                onClick={closeChestReward}
                                className="px-8 py-3 bg-amber-700 text-white font-ink text-2xl border-2 border-amber-500 hover:bg-amber-600 hover:scale-105 transition-all"
                            >
                                收下
                            </button>
                        </div>
                     </div>
                )}

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
                            <button onClick={() => setGameState(GameStateEnum.MENU)} className="px-12 py-4 bg-slate-100 text-black font-ink text-3xl border-2 border-slate-400 hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]">
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

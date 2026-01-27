
import React, { useState, useEffect, useRef } from 'react';
import { GameStateEnum, Player, UpgradeOption, WeaponType, GeneratedAssets, ArtStyle } from './types';
import GameCanvas from './components/GameCanvas';
import { generateGameAssets, generateFlavorText, setGlobalApiKey, hasValidApiKey, getGlobalApiKey } from './services/geminiService';
import { WEAPON_DEFAULTS, DEFAULT_ASSETS } from './constants';
import { audioManager } from './services/audioService';

const ASSET_STORAGE_KEY = 'WUXIA_GAME_ASSETS_V1';

const WEAPON_NAMES: Record<string, string> = {
    [WeaponType.SWORD_AURA]: '万剑归宗',
    [WeaponType.PALM_STRIKE]: '如来神掌',
    [WeaponType.GOLDEN_BELL]: '金钟罩',
    [WeaponType.SPIRIT_DAGGER]: '追魂剑',
    [WeaponType.KUNAI]: '暴雨梨花',
    [WeaponType.BLADE]: '血影狂刀',
    [WeaponType.GUQIN]: '天魔八音',
    [WeaponType.STAFF]: '疯魔棍法',
    [WeaponType.SOUND_WAVE]: '狮吼功'
};

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameStateEnum>(GameStateEnum.MENU);
    const [assets, setAssets] = useState<GeneratedAssets>(DEFAULT_ASSETS);
    const [flavorText, setFlavorText] = useState("江湖路远，生死由命。");
    const [upgrades, setUpgrades] = useState<UpgradeOption[]>([]);
    const [score, setScore] = useState(0);
    const [selectedStyle, setSelectedStyle] = useState<ArtStyle>(ArtStyle.INK);
    const [hasSavedAssets, setHasSavedAssets] = useState(false);
    
    // Audio State
    const [isMuted, setIsMuted] = useState(false);

    // API Key State
    const [apiKeyInput, setApiKeyInput] = useState(getGlobalApiKey());
    const [isKeyValid, setIsKeyValid] = useState(hasValidApiKey());

    // Platform Detection
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
    
    // 1. Platform Detection
    useEffect(() => {
        setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
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

    // 3. Audio Init on Interaction
    useEffect(() => {
        const initAudio = () => {
            audioManager.init();
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
            window.removeEventListener('touchstart', initAudio);
        };
        window.addEventListener('click', initAudio);
        window.addEventListener('keydown', initAudio);
        window.addEventListener('touchstart', initAudio);
        return () => {
             window.removeEventListener('click', initAudio);
             window.removeEventListener('keydown', initAudio);
             window.removeEventListener('touchstart', initAudio);
        };
    }, []);

    // Ambient Music Control
    useEffect(() => {
        if (gameState === GameStateEnum.PLAYING || gameState === GameStateEnum.PAUSED) {
            audioManager.startAmbience();
        } else {
            audioManager.stopAmbience();
        }
    }, [gameState]);

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

    const handleToggleMute = () => {
        audioManager.toggleMute();
        setIsMuted(audioManager.getMuteState());
    };

    const handleSaveKey = () => {
        if (apiKeyInput.trim().length > 0) {
            setGlobalApiKey(apiKeyInput.trim());
            setIsKeyValid(true);
            alert("API Key 已保存！");
        }
    };

    const startGame = () => {
        audioManager.init(); // Ensure init
        audioManager.playHit(true); // Start sound
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
        audioManager.playLevelUp();
        // --- MASTER UPGRADE POOL ---
        const MASTER_POOL: UpgradeOption[] = [
            // --- WEAPONS ---
            { id: 'wp_sword', name: '万剑归宗', description: '御剑术更进一步，召唤更多飞剑护体', rarity: 'COMMON', type: 'WEAPON', weaponType: WeaponType.SWORD_AURA, icon: '🗡️' },
            { id: 'wp_palm', name: '如来神掌', description: '掌法刚猛，击退敌人并造成巨额伤害', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.PALM_STRIKE, icon: '✋' },
            { id: 'wp_bell', name: '金钟罩', description: '真气护体，持续伤害周围敌人并击退', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.GOLDEN_BELL, icon: '🔔' },
            { id: 'wp_dagger', name: '追魂剑', description: '飞剑自动索敌，百步穿杨', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.SPIRIT_DAGGER, icon: '🌠' },
            // New Weapons
            { id: 'wp_kunai', name: '暴雨梨花', description: '暗器连发，扇形散射打击敌人', rarity: 'COMMON', type: 'WEAPON', weaponType: WeaponType.KUNAI, icon: '📍' },
            { id: 'wp_blade', name: '血影狂刀', description: '挥舞巨刀，对前方造成毁灭性斩击', rarity: 'LEGENDARY', type: 'WEAPON', weaponType: WeaponType.BLADE, icon: '🔪' },
            { id: 'wp_guqin', name: '天魔八音', description: '抚琴杀敌，布下音波陷阱', rarity: 'LEGENDARY', type: 'WEAPON', weaponType: WeaponType.GUQIN, icon: '🎵' },
            { id: 'wp_staff', name: '疯魔棍法', description: '长棍横扫，大范围持续旋转攻击', rarity: 'RARE', type: 'WEAPON', weaponType: WeaponType.STAFF, icon: '🥢' },

            // --- LEGENDARY STATS (Heart Sutras) ---
            { id: 'leg_might', name: '易筋经', description: '打通经脉，全方位提升10%伤害', rarity: 'LEGENDARY', type: 'STAT', statType: 'might', value: 0.1, icon: '📜' },
            { id: 'leg_area', name: '狮子吼', description: '内力深厚，招式范围扩大15%', rarity: 'LEGENDARY', type: 'STAT', statType: 'area', value: 0.15, icon: '🦁' },
            { id: 'leg_dodge', name: '凌波微步', description: '身法入化，增加10%闪避概率', rarity: 'LEGENDARY', type: 'STAT', statType: 'dodgeChance', value: 0.1, icon: '🌫️' },
            { id: 'leg_frenzy', name: '血魔大法', description: '驾驭血气，血煞消耗减少20%', rarity: 'LEGENDARY', type: 'STAT', statType: 'frenzyEfficiency', value: 0.2, icon: '🩸' },

            // --- RARE STATS ---
            { id: 'rare_speed', name: '神行百变', description: '移动速度提升10%', rarity: 'RARE', type: 'STAT', statType: 'speed', value: 0.1, icon: '🦶' },
            { id: 'rare_cd', name: '洗髓经', description: '冷却时间减少10%', rarity: 'RARE', type: 'STAT', statType: 'cooldown', value: 0.1, icon: '⏳' },
            { id: 'rare_exp', name: '悟道', description: '天资聪颖，经验获取提升20%', rarity: 'RARE', type: 'STAT', statType: 'expMultiplier', value: 0.2, icon: '🧠' },

            // --- COMMON STATS ---
            { id: 'com_might', name: '基本内功', description: '伤害提升5%', rarity: 'COMMON', type: 'STAT', statType: 'might', value: 0.05, icon: '✊' },
            { id: 'com_area', name: '吐纳法', description: '攻击范围提升5%', rarity: 'COMMON', type: 'STAT', statType: 'area', value: 0.05, icon: '🌬️' },
            { id: 'com_magnet', name: '擒龙功', description: '拾取范围扩大15%', rarity: 'COMMON', type: 'STAT', statType: 'magnet', value: 0.15, icon: '🧲' },
            { id: 'com_speed', name: '轻功', description: '移动速度提升5%', rarity: 'COMMON', type: 'STAT', statType: 'speed', value: 0.05, icon: '👞' },
        ];

        // Selection Logic
        const newUpgrades: UpgradeOption[] = [];
        
        // Ensure at least one weapon upgrade if possible
        const existingWeaponTypes = player.weapons.map(w => w.type);
        const weaponUpgrades = MASTER_POOL.filter(u => u.type === 'WEAPON');
        
        // Helper to get weight based on rarity
        const getWeight = (rarity: string) => {
            if (rarity === 'LEGENDARY') return 1;
            if (rarity === 'RARE') return 3;
            return 6; // COMMON
        };

        // Pick 3 unique upgrades
        while (newUpgrades.length < 3) {
            // Weighted Random
            const weightedPool = MASTER_POOL.filter(u => !newUpgrades.find(sel => sel.id === u.id)); // Don't pick same ID twice
            
            if (weightedPool.length === 0) break;

            let totalWeight = 0;
            weightedPool.forEach(u => totalWeight += getWeight(u.rarity));
            
            let random = Math.random() * totalWeight;
            
            for (const option of weightedPool) {
                random -= getWeight(option.rarity);
                if (random <= 0) {
                    newUpgrades.push(option);
                    break;
                }
            }
        }
        
        setUpgrades(newUpgrades);
    };

    const selectUpgrade = (option: UpgradeOption) => {
        audioManager.playPickup(true);
        const player = playerRef.current;
        if (option.type === 'WEAPON' && option.weaponType) {
            const weapon = player.weapons.find(w => w.type === option.weaponType);
            if (weapon) {
                weapon.level++;
                weapon.damage += 5;
                if(weapon.type === WeaponType.SWORD_AURA) weapon.damage += 5; // Scaling fix
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
        audioManager.playLevelUp(); // Reuse level up sound for chest
        setGameState(GameStateEnum.CHEST_REWARD);
        // Determine Reward
        const rand = Math.random();
        
        // 30% Heal
        if (rand < 0.3) {
            playerRef.current.hp = playerRef.current.maxHp;
            playerRef.current.bloodEssence = playerRef.current.maxBloodEssence;
            setChestReward({ name: '造化仙丹', desc: '恢复所有生命与血煞值', icon: '💊' });
        } 
        // 70% Random Weapon Upgrade (Replaces Gold)
        else {
            const player = playerRef.current;
            if (player.weapons.length > 0) {
                 const w = player.weapons[Math.floor(Math.random() * player.weapons.length)];
                 w.level++;
                 w.damage += 10;
                 const weaponName = WEAPON_NAMES[w.type] || w.type;
                 setChestReward({ 
                     name: '武学顿悟', 
                     desc: `你的 [${weaponName}] 境界提升了！(等级 ${w.level})`, 
                     icon: '📚' 
                 });
            } else {
                // Fallback (Rare case if weapon list is empty)
                setScore(s => s + 1000);
                setChestReward({ name: '天降鸿福', desc: '获得 1000 分', icon: '💰' });
            }
        }
    };

    const closeChestReward = () => {
        audioManager.playPickup(true);
        setChestReward(null);
        setGameState(GameStateEnum.PLAYING);
    }

    const handleGameOver = (finalScore: number) => {
        setScore(finalScore);
    };

    return (
        <div className="w-full h-[100dvh] bg-black text-slate-100 font-serif overflow-hidden flex items-center justify-center select-none">
            
            <div className="relative w-full h-full bg-neutral-900 shadow-2xl overflow-hidden">
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

                {/* --- OVERLAYS & HUD --- */}

                {/* Low HP Vignette */}
                <div 
                    className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0"
                    style={{
                        background: 'radial-gradient(circle, transparent 50%, rgba(127, 29, 29, 0.6) 100%)',
                        opacity: hudState.hp < hudState.maxHp * 0.3 ? (1 - hudState.hp / (hudState.maxHp * 0.3)) : 0
                    }}
                />
                
                {/* Mute Button */}
                <button 
                    onClick={handleToggleMute}
                    className="absolute top-4 left-4 z-30 w-10 h-10 rounded-full bg-black/60 border border-slate-700 text-slate-300 flex items-center justify-center hover:bg-slate-800 transition-all backdrop-blur-sm"
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? '🔇' : '🔊'}
                </button>

                {/* Pause Button (Desktop/Mobile) */}
                {gameState === GameStateEnum.PLAYING && (
                    <button 
                        onClick={() => setGameState(GameStateEnum.PAUSED)}
                        className="absolute top-4 right-4 z-30 w-12 h-12 rounded-lg bg-black/60 border-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-500 hover:text-white transition-all flex items-center justify-center backdrop-blur-sm"
                    >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                )}

                {/* HUD */}
                {(gameState === GameStateEnum.PLAYING || gameState === GameStateEnum.PAUSED) && (
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 flex flex-col justify-between">
                        {/* Top Stats Bar */}
                        <div className="flex justify-between items-start p-4 md:p-6 w-full max-w-4xl mx-auto pt-16 md:pt-6">
                            
                            {/* Player Status (HP/EXP) */}
                            <div className="flex gap-4 items-center">
                                {/* Avatar Circle */}
                                <div className="relative w-16 h-16 md:w-20 md:h-20 shrink-0">
                                    <div className="absolute inset-0 bg-neutral-800 rounded-full border-2 border-slate-600 shadow-lg overflow-hidden">
                                        {/* Simple Avatar Placeholder or Character Face */}
                                        <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                                            <span className="font-ink text-3xl text-slate-500">侠</span>
                                        </div>
                                    </div>
                                    {/* Level Badge */}
                                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-amber-700 rounded-full border border-amber-500 flex items-center justify-center z-10 shadow-md">
                                        <span className="font-mono text-xs font-bold text-white">{hudState.level}</span>
                                    </div>
                                </div>

                                {/* Bars */}
                                <div className="flex flex-col gap-1 w-40 md:w-64">
                                    {/* Name */}
                                    <div className="flex justify-between items-baseline px-1">
                                        <span className="text-sm font-ink text-slate-300">无名侠客</span>
                                        <span className="text-xs font-mono text-slate-500">{Math.ceil(hudState.hp)}/{hudState.maxHp}</span>
                                    </div>
                                    
                                    {/* HP Bar */}
                                    <div className="h-4 bg-neutral-900 border border-slate-700 rounded-sm relative overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-red-900 via-red-600 to-red-500 transition-all duration-300 ease-out" 
                                            style={{ width: `${(hudState.hp / hudState.maxHp) * 100}%` }}
                                        />
                                    </div>

                                    {/* EXP Bar */}
                                    <div className="h-1.5 bg-neutral-900/50 rounded-full mt-1 overflow-hidden">
                                        <div className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] transition-all duration-300" style={{ width: `${(hudState.exp / hudState.nextExp) * 100}%` }} />
                                    </div>
                                </div>
                            </div>

                            {/* Frenzy Meter */}
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`font-ink text-lg ${hudState.isFrenzy ? 'text-red-500 animate-pulse text-shadow-red' : 'text-slate-400'}`}>
                                        {hudState.isFrenzy ? '【血煞爆发】' : '血煞值'}
                                    </span>
                                </div>
                                <div className={`w-32 md:w-48 h-3 border border-slate-700 bg-neutral-900 skew-x-[-15deg] overflow-hidden relative ${hudState.isFrenzy ? 'shadow-[0_0_15px_rgba(220,38,38,0.5)] border-red-900' : ''}`}>
                                    <div className={`h-full transition-all duration-100 ${hudState.isFrenzy ? 'bg-red-500' : 'bg-red-900/60'}`} style={{ width: `${(hudState.blood / hudState.maxBlood) * 100}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* Bottom Skill Icon (Desktop) */}
                        {!isTouch && (
                            <div className="absolute bottom-8 right-8 pointer-events-auto">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="relative w-16 h-16 bg-neutral-800 border-2 border-slate-600 rounded-lg flex items-center justify-center shadow-lg overflow-hidden group">
                                        <span className="font-ink text-2xl text-white group-hover:scale-110 transition-transform">闪</span>
                                        <div className="absolute bottom-0 right-0 p-0.5 bg-slate-900 text-[10px] text-slate-400 border-tl border-slate-700 rounded-tl">SPACE</div>
                                        {/* Cooldown Overlay */}
                                        <div 
                                            className="absolute inset-0 bg-black/70 origin-bottom transition-transform duration-75"
                                            style={{ transform: `scaleY(${hudState.dashTimer / hudState.maxDashTimer})` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Pause Menu */}
                {gameState === GameStateEnum.PAUSED && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-50 fade-in">
                        <div className="bg-paper-pattern border-y-4 border-slate-800 p-12 w-full max-w-md text-center relative shadow-2xl">
                             <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-2 font-ink text-2xl border border-slate-600 shadow-lg">
                                 暂离江湖
                             </div>
                            
                            <div className="flex flex-col gap-4 mt-6">
                                <button 
                                    onClick={() => setGameState(GameStateEnum.PLAYING)}
                                    className="px-6 py-3 bg-neutral-800 text-slate-200 font-serif border border-slate-600 hover:bg-neutral-700 hover:text-white hover:border-slate-400 transition-all"
                                >
                                    继续历练
                                </button>
                                <button 
                                    onClick={() => setGameState(GameStateEnum.MENU)}
                                    className="px-6 py-3 bg-transparent text-red-800 font-serif border border-red-900/30 hover:bg-red-900/10 hover:border-red-800 transition-all"
                                >
                                    退出江湖
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Menu */}
                {gameState === GameStateEnum.MENU && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] z-50 overflow-hidden">
                        {/* Background Effects */}
                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] pointer-events-none"></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black pointer-events-none"></div>
                        
                        {/* Content Container */}
                        <div className="relative z-10 flex flex-col items-center w-full max-w-md px-6 fade-in">
                            
                            {/* Title Block */}
                            <div className="mb-12 text-center relative">
                                <h1 className="text-7xl md:text-9xl font-ink text-transparent bg-clip-text bg-gradient-to-b from-red-600 to-red-900 filter drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] animate-float">
                                    血影
                                </h1>
                                <h2 className="text-4xl md:text-6xl font-ink text-slate-200 -mt-2 md:-mt-4 text-shadow-ink">
                                    武侠
                                </h2>
                                <div className="w-1 h-24 bg-gradient-to-b from-red-900 to-transparent mx-auto mt-4 opacity-50"></div>
                                <p className="text-slate-500 italic font-serif mt-4 text-sm max-w-xs mx-auto leading-relaxed opacity-80">
                                    "{flavorText}"
                                </p>
                            </div>

                            {/* Controls Block */}
                            <div className="flex flex-col w-full gap-4">
                                
                                {/* Start Button */}
                                <button 
                                    onClick={startGame}
                                    className="group relative w-full h-20 flex items-center justify-center overflow-hidden border-2 border-red-900/50 bg-black/40 hover:bg-red-950/30 transition-all duration-500"
                                >
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                        <div className="w-[120%] h-1 bg-red-600 blur-sm transform rotate-12"></div>
                                    </div>
                                    <span className="relative z-10 font-ink text-4xl text-red-500 group-hover:text-red-400 group-hover:scale-110 transition-all text-shadow-red">
                                        踏入江湖
                                    </span>
                                </button>

                                {/* Settings Panel */}
                                <div className="bg-neutral-900/80 border border-slate-800 p-6 rounded-sm backdrop-blur-sm mt-4">
                                    {/* API Key */}
                                    <div className="flex flex-col gap-2 mb-6">
                                        <label className="text-xs text-slate-500 font-mono uppercase tracking-wider">Gemini API Key (Required for AI Assets)</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="password" 
                                                placeholder="sk-..." 
                                                value={apiKeyInput}
                                                onChange={(e) => setApiKeyInput(e.target.value)}
                                                className="flex-1 bg-black border border-slate-700 px-3 py-2 text-xs text-slate-300 focus:border-red-500 outline-none transition-colors"
                                            />
                                            <button 
                                                onClick={handleSaveKey} 
                                                className="bg-slate-800 px-4 py-2 text-xs text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
                                            >
                                                保存
                                            </button>
                                        </div>
                                    </div>

                                    {/* Art Style */}
                                    <div className="flex flex-col gap-2 mb-6">
                                        <label className="text-xs text-slate-500 font-mono uppercase tracking-wider">美术风格 / Art Style</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { id: ArtStyle.INK, label: '水墨' },
                                                { id: ArtStyle.ANIME, label: '动漫' },
                                                { id: ArtStyle.PIXEL, label: '像素' },
                                                { id: ArtStyle.OIL, label: '厚涂' }
                                            ].map(style => (
                                                <button
                                                    key={style.id}
                                                    onClick={() => setSelectedStyle(style.id)}
                                                    className={`py-1.5 text-xs border transition-colors ${selectedStyle === style.id ? 'bg-slate-200 text-black border-slate-200 font-bold' : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-500'}`}
                                                >
                                                    {style.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Action Actions */}
                                    <div className="flex flex-col gap-2">
                                        <button 
                                            onClick={handleGenerateAssets}
                                            disabled={!isKeyValid}
                                            className={`w-full py-2 text-xs border border-dashed transition-all flex items-center justify-center gap-2 ${isKeyValid ? 'border-amber-700/50 text-amber-600 hover:bg-amber-900/10 hover:text-amber-500' : 'border-slate-800 text-slate-600 cursor-not-allowed'}`}
                                        >
                                            {isKeyValid ? '✨ AI 重新生成素材 (Generate Assets)' : '🔒 需要 API Key'}
                                        </button>
                                        
                                        {hasSavedAssets && (
                                            <div className="flex gap-2">
                                                <button onClick={handleDownloadAssets} className="flex-1 py-1 text-[10px] text-slate-500 hover:text-slate-300 border-b border-transparent hover:border-slate-500">
                                                    导出素材
                                                </button>
                                                <button onClick={handleClearAssets} className="flex-1 py-1 text-[10px] text-slate-500 hover:text-red-400 border-b border-transparent hover:border-red-900">
                                                    重置默认
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Instructions */}
                                <div className="flex justify-center gap-6 text-[10px] text-slate-600 font-mono mt-4 opacity-50">
                                    <span>[WASD] 移动</span>
                                    <span>[SPACE] 闪避</span>
                                    <span>[ESC] 暂停</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === GameStateEnum.ASSET_GEN && (
                    <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-50">
                        <div className="relative">
                            <div className="w-24 h-24 border-t-4 border-r-2 border-red-700 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center font-ink text-red-800 text-2xl animate-pulse">墨</div>
                        </div>
                        <p className="text-slate-300 font-ink text-4xl mt-8 animate-pulse tracking-widest text-shadow-ink">墨宝绘制中...</p>
                        <p className="text-slate-500 mt-4 font-serif text-sm">AI正在凝聚江湖画卷 (约需10秒)...</p>
                    </div>
                )}

                {gameState === GameStateEnum.LEVEL_UP && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 fade-in">
                        <h2 className="text-5xl md:text-6xl font-ink text-amber-500 mb-2 text-shadow-gold animate-float">境界突破</h2>
                        <div className="w-32 h-1 bg-gradient-to-r from-transparent via-amber-600 to-transparent mb-8"></div>
                        
                        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl justify-center items-stretch overflow-x-auto pb-4 md:pb-0 px-4">
                            {upgrades.map((u, idx) => (
                                <div 
                                    key={u.id}
                                    onClick={() => selectUpgrade(u)}
                                    className="group relative flex-1 min-w-[260px] cursor-pointer perspective-1000 slide-up"
                                    style={{ animationDelay: `${idx * 0.1}s` }}
                                >
                                    <div className={`
                                        h-full flex flex-col items-center p-8 border-2 relative overflow-hidden transition-all duration-300 transform group-hover:-translate-y-4 group-hover:scale-105 group-hover:shadow-[0_0_30px_rgba(0,0,0,0.5)]
                                        ${u.rarity === 'LEGENDARY' 
                                            ? 'bg-neutral-900 border-amber-600/80 shadow-[0_0_20px_rgba(217,119,6,0.15)]' 
                                            : (u.rarity === 'RARE' ? 'bg-neutral-900 border-blue-400/50 shadow-[0_0_15px_rgba(96,165,250,0.1)]' : 'bg-neutral-900 border-slate-700')}
                                    `}>
                                        {/* Background Texture */}
                                        <div className="absolute inset-0 bg-paper-pattern opacity-5 mix-blend-overlay"></div>
                                        
                                        {/* Icon */}
                                        <div className={`text-6xl mb-6 transition-transform group-hover:scale-110 duration-500 ${u.rarity === 'LEGENDARY' ? 'animate-pulse' : ''}`}>{u.icon || '⚔️'}</div>
                                        
                                        {/* Title */}
                                        <h3 className={`text-3xl font-ink mb-4 text-center ${u.rarity === 'LEGENDARY' ? 'text-amber-500 text-shadow-gold' : (u.rarity === 'RARE' ? 'text-blue-300' : 'text-slate-300')}`}>
                                            {u.name}
                                        </h3>
                                        
                                        {/* Divider */}
                                        <div className="w-12 h-px bg-current opacity-30 mb-4"></div>
                                        
                                        {/* Desc */}
                                        <p className={`text-center font-serif text-sm leading-relaxed ${u.rarity === 'LEGENDARY' ? 'text-amber-100/70' : 'text-slate-400'}`}>
                                            {u.description}
                                        </p>

                                        {/* Rarity Tag */}
                                        <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold font-mono border-b border-l 
                                            ${u.rarity === 'LEGENDARY' ? 'bg-amber-900/50 border-amber-600 text-amber-500' 
                                            : (u.rarity === 'RARE' ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-600 text-slate-500')}`}>
                                            {u.rarity === 'LEGENDARY' ? '绝世' : (u.rarity === 'RARE' ? '稀有' : '凡品')}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {gameState === GameStateEnum.CHEST_REWARD && chestReward && (
                     <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 fade-in">
                        <div className="bg-neutral-900 border-2 border-amber-600 p-12 w-full max-w-lg flex flex-col items-center relative shadow-[0_0_60px_rgba(217,119,6,0.3)] bg-paper-pattern">
                            <div className="absolute inset-0 bg-black/40 pointer-events-none"></div> {/* Darken texture */}
                            <div className="relative z-10 flex flex-col items-center">
                                <h2 className="text-5xl font-ink text-amber-500 mb-8 text-shadow-gold">天降鸿福</h2>
                                <div className="text-9xl mb-8 animate-bounce filter drop-shadow-lg">{chestReward.icon}</div>
                                <h3 className="text-3xl text-white mb-4 font-ink tracking-wide">{chestReward.name}</h3>
                                <p className="text-amber-200/60 text-center mb-10 font-serif text-lg">{chestReward.desc}</p>
                                <button 
                                    onClick={closeChestReward}
                                    className="px-10 py-3 bg-amber-700 text-white font-ink text-2xl border border-amber-500 hover:bg-amber-600 hover:scale-105 transition-all shadow-lg"
                                >
                                    收入囊中
                                </button>
                            </div>
                        </div>
                     </div>
                )}

                {gameState === GameStateEnum.GAME_OVER && (
                    <div className="absolute inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center z-50 fade-in">
                        <div className="relative py-16 w-full flex flex-col items-center border-y border-red-900/30 bg-red-950/10">
                            <h2 className="text-7xl md:text-9xl font-ink text-red-700 mb-4 text-shadow-red animate-pulse text-center">
                                胜败乃兵家常事
                            </h2>
                            <p className="text-slate-500 font-serif italic mb-12">"大侠请重新来过"</p>
                            
                            <div className="flex flex-col items-center gap-2 mb-12 scale-110">
                                <span className="text-slate-500 font-serif uppercase tracking-widest text-xs">最终得分</span>
                                <span className="text-6xl font-mono text-slate-200">{score}</span>
                            </div>
                            
                            <button 
                                onClick={() => setGameState(GameStateEnum.MENU)} 
                                className="px-12 py-4 bg-slate-200 text-black font-ink text-3xl border-2 border-slate-400 hover:bg-white hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
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

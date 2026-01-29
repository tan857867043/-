
import React, { useState, useEffect, useRef } from 'react';
import { GameStateEnum, Player, UpgradeOption, WeaponType, GeneratedAssets, ArtStyle } from './types';
import GameCanvas from './components/GameCanvas';
import { generateGameAssets, generateFlavorText, setGlobalApiKey, hasValidApiKey, getGlobalApiKey } from './services/geminiService';
import { WEAPON_DEFAULTS, DEFAULT_ASSETS, ASSET_LIBRARY, AssetLibrary } from './constants';
import { audioManager } from './services/audioService';

const CUSTOM_ASSETS_STORAGE_KEY = 'WUXIA_CUSTOM_LIBRARY_V2';

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
    
    // Asset Management State
    const [assets, setAssets] = useState<GeneratedAssets>(DEFAULT_ASSETS);
    const [customLibrary, setCustomLibrary] = useState<AssetLibrary>({});
    const [showStyleManager, setShowStyleManager] = useState(false);
    const [selectedStyleId, setSelectedStyleId] = useState<string>('INK'); 
    
    // Generation Style Selection
    const [genStyle, setGenStyle] = useState<ArtStyle>(ArtStyle.INK);
    const [genStatus, setGenStatus] = useState<string>("准备中...");

    const [flavorText, setFlavorText] = useState("江湖路远，生死由命。");
    const [upgrades, setUpgrades] = useState<UpgradeOption[]>([]);
    const [score, setScore] = useState(0);
    
    // Audio State
    const [isMuted, setIsMuted] = useState(false);

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

    // 2. Load Custom Library on Start
    useEffect(() => {
        try {
            const savedLib = localStorage.getItem(CUSTOM_ASSETS_STORAGE_KEY);
            if (savedLib) {
                const parsed = JSON.parse(savedLib);
                setCustomLibrary(parsed);
            }
        } catch (e) {
            console.error("Failed to load custom library", e);
        }
    }, []);

    // 3. Audio Init on Interaction
    useEffect(() => {
        const initAudio = () => audioManager.init();
        window.addEventListener('click', initAudio);
        window.addEventListener('touchstart', initAudio);
        return () => {
            window.removeEventListener('click', initAudio);
            window.removeEventListener('touchstart', initAudio);
        };
    }, []);

    // 4. HUD Interval
    useEffect(() => {
        if (gameState !== GameStateEnum.PLAYING) return;
        const interval = setInterval(() => {
            if (playerRef.current && playerRef.current.hp !== undefined) {
                setHudState({
                    hp: playerRef.current.hp,
                    maxHp: playerRef.current.maxHp,
                    exp: playerRef.current.exp,
                    nextExp: playerRef.current.nextLevelExp,
                    level: playerRef.current.level,
                    blood: playerRef.current.bloodEssence,
                    maxBlood: playerRef.current.maxBloodEssence,
                    isFrenzy: playerRef.current.isFrenzy,
                    dashTimer: playerRef.current.dashTimer,
                    maxDashTimer: playerRef.current.maxDashTimer
                });
            }
        }, 100);
        return () => clearInterval(interval);
    }, [gameState]);

    const handleStartGame = () => {
        setScore(0);
        setGameState(GameStateEnum.PLAYING);
        audioManager.startAmbience();
    };

    // --- NEW ASSET GENERATION LOGIC ---
    const handleAssetGen = async () => {
        const targetStyle = genStyle;
        
        setGameState(GameStateEnum.ASSET_GEN);
        setGenStatus("连接免费绘图接口中...");
        try {
            const newAssets = await generateGameAssets(targetStyle, (status) => {
                setGenStatus(status);
            });
            
            const timestamp = new Date();
            const timeId = timestamp.getTime().toString();
            const newEntry = { ...newAssets, currentStyle: targetStyle };

            const updatedLib = { ...customLibrary, [timeId]: newEntry };
            setCustomLibrary(updatedLib);
            localStorage.setItem(CUSTOM_ASSETS_STORAGE_KEY, JSON.stringify(updatedLib));

            setAssets(newEntry);
            setSelectedStyleId(timeId);
            
            const txt = await generateFlavorText(targetStyle + " style wuxia game start");
            setFlavorText(txt);
        } catch (e) {
            alert("生成中断，请稍后再试");
        }
        setGameState(GameStateEnum.MENU);
    };

    const handleSelectStyle = (id: string, isCustom: boolean) => {
        if (isCustom) {
            if (customLibrary[id]) {
                setAssets(customLibrary[id]);
                setSelectedStyleId(id);
                setGenStyle(customLibrary[id].currentStyle);
            }
        } else {
            if (ASSET_LIBRARY[id]) {
                setAssets(ASSET_LIBRARY[id]);
                setSelectedStyleId(id);
                setGenStyle(ASSET_LIBRARY[id].currentStyle);
            }
        }
        setShowStyleManager(false);
    };

    const handleDeleteStyle = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("确定要删除这个自定义风格吗？")) {
            const newLib = { ...customLibrary };
            delete newLib[id];
            setCustomLibrary(newLib);
            localStorage.setItem(CUSTOM_ASSETS_STORAGE_KEY, JSON.stringify(newLib));
            
            if (selectedStyleId === id) {
                setAssets(DEFAULT_ASSETS);
                setSelectedStyleId('INK');
                setGenStyle(ArtStyle.INK);
            }
        }
    };

    const handleLevelUp = (player: Player) => {
        const opts: UpgradeOption[] = [];
        const weaponPool = Object.values(WeaponType);
        const statPool = ['might', 'cooldown', 'area', 'speed', 'magnet', 'dodgeChance', 'frenzyEfficiency', 'expMultiplier'];
        
        for (let i = 0; i < 3; i++) {
            if (Math.random() > 0.4) {
                const wType = weaponPool[Math.floor(Math.random() * weaponPool.length)];
                const existing = player.weapons.find(w => w.type === wType);
                const name = WEAPON_NAMES[wType];
                
                if (!existing) {
                    opts.push({
                        id: Math.random().toString(),
                        name: `习得: ${name}`,
                        description: '获得新武学，自动攻击敌人',
                        rarity: 'RARE',
                        type: 'WEAPON',
                        weaponType: wType
                    });
                } else {
                    opts.push({
                        id: Math.random().toString(),
                        name: `进阶: ${name}`,
                        description: `提升威力与范围 (Lv.${existing.level + 1})`,
                        rarity: 'COMMON',
                        type: 'WEAPON',
                        weaponType: wType
                    });
                }
            } else {
                const sType = statPool[Math.floor(Math.random() * statPool.length)] as keyof typeof player.stats;
                let desc = "";
                let name = "";
                let icon = "";
                
                switch(sType) {
                    case 'might': name="内功"; desc="增加 10% 伤害"; icon="💪"; break;
                    case 'cooldown': name="身法"; desc="减少 10% 冷却"; icon="⚡"; break;
                    case 'area': name="剑气"; desc="增加 15% 攻击范围"; icon="🌊"; break;
                    case 'speed': name="轻功"; desc="增加 10% 移动速度"; icon="🦶"; break;
                    case 'magnet': name="吸星"; desc="增加 20% 拾取范围"; icon="🧲"; break;
                    case 'dodgeChance': name="凌波微步"; desc="增加 5% 闪避率"; icon="👻"; break;
                    case 'frenzyEfficiency': name="血魔大法"; desc="减缓 10% 血狂消耗"; icon="🩸"; break;
                    case 'expMultiplier': name="悟性"; desc="增加 10% 经验获取"; icon="🧠"; break;
                }

                opts.push({
                    id: Math.random().toString(),
                    name: `提升: ${name}`,
                    description: desc,
                    rarity: 'COMMON',
                    type: 'STAT',
                    statType: sType,
                    icon
                });
            }
        }
        setUpgrades(opts);
    };

    const handleSelectUpgrade = (opt: UpgradeOption) => {
        const p = playerRef.current;
        if (opt.type === 'WEAPON' && opt.weaponType) {
            const existing = p.weapons.find(w => w.type === opt.weaponType);
            if (existing) {
                existing.level++;
                existing.damage *= 1.2;
                existing.area *= 1.1;
                audioManager.playLevelUp();
            } else {
                p.weapons.push({
                    type: opt.weaponType,
                    level: 1,
                    cooldownTimer: 0,
                    baseCooldown: WEAPON_DEFAULTS[opt.weaponType].cooldown,
                    damage: WEAPON_DEFAULTS[opt.weaponType].damage,
                    area: 1
                });
                audioManager.playLevelUp();
            }
        } else if (opt.type === 'STAT' && opt.statType) {
            if (opt.statType === 'dodgeChance') p.stats.dodgeChance += 0.05;
            else if (opt.statType === 'frenzyEfficiency') p.stats.frenzyEfficiency += 0.1;
            else p.stats[opt.statType] += 0.1;
            audioManager.playPickup(true);
        }
        setGameState(GameStateEnum.PLAYING);
    };
    
    const handleChestPickup = () => {
        setGameState(GameStateEnum.CHEST_REWARD);
        audioManager.playLevelUp();
        
        const rewards = [
            { name: "血菩提", desc: "恢复 50% 生命值", icon: "💊" },
            { name: "洗髓经", desc: "全属性提升 10%", icon: "📜" },
            { name: "玄铁令", desc: "获得 500 金币 (积分)", icon: "🪙" }
        ];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];
        setChestReward(reward);
        
        if (reward.name === "血菩提") playerRef.current.hp = Math.min(playerRef.current.maxHp, playerRef.current.hp + playerRef.current.maxHp * 0.5);
        else if (reward.name === "洗髓经") {
            playerRef.current.stats.might += 0.1;
            playerRef.current.stats.speed += 0.1;
            playerRef.current.stats.cooldown += 0.1;
        }
        else if (reward.name === "玄铁令") {
            setScore(prev => prev + 500);
        }
    };

    // --- RENDERERS ---

    const renderMenu = () => (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black overflow-hidden fade-in">
             {/* Dynamic Background */}
             <div className="absolute inset-0 opacity-40">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-stone-800 via-stone-950 to-black"></div>
                  {/* Floating Ink Characters */}
                  <div className="absolute top-1/4 left-1/4 text-[12rem] font-ink text-black opacity-30 blur-sm animate-float">武</div>
                  <div className="absolute bottom-1/4 right-1/4 text-[12rem] font-ink text-black opacity-30 blur-sm animate-float" style={{animationDelay: '2s'}}>侠</div>
                  {/* Subtle Red Mist */}
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-red-900/20 to-transparent"></div>
             </div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-4xl p-8">
                {/* Main Logo */}
                <div className="mb-16 text-center transform hover:scale-105 transition-transform duration-1000">
                    <h1 className="text-8xl md:text-9xl font-ink text-stone-200 text-shadow-ink mb-4 relative inline-block">
                        血影<span className="text-red-700">武侠</span>
                        {/* Red Stamp */}
                        <div className="absolute -top-4 -right-8 w-16 h-16 border-4 border-red-800 rounded-lg flex items-center justify-center rotate-12 opacity-80 mix-blend-multiply">
                            <span className="font-serif font-bold text-red-800 text-sm">绝世</span>
                        </div>
                    </h1>
                    <p className="text-xl font-serif text-stone-500 tracking-[0.5em] uppercase border-t border-stone-800 pt-4 mt-2">
                        Blood Shadow Roguelike
                    </p>
                </div>
                
                {/* Menu Options */}
                <div className="flex flex-col gap-6 w-full max-w-sm">
                    <button 
                        onClick={handleStartGame}
                        className="group relative w-full h-20 overflow-hidden"
                    >
                        {/* Ink Splash BG */}
                        <div className="absolute inset-0 bg-stone-100 transform translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out clip-path-splash"></div>
                        <div className="absolute inset-0 border-y-2 border-stone-800/50 scale-x-0 group-hover:scale-x-100 transition-transform duration-700 delay-100"></div>
                        
                        <span className="relative z-10 w-full h-full flex items-center justify-center font-ink text-4xl text-stone-300 group-hover:text-red-900 transition-colors duration-300">
                            踏 入 江 湖
                        </span>
                    </button>

                    <button 
                        onClick={() => setShowStyleManager(true)}
                        className="group relative w-full h-16 flex items-center justify-center"
                    >
                        <span className="relative z-10 font-ink text-2xl text-stone-500 group-hover:text-stone-300 transition-colors duration-300">
                             易 容 术
                        </span>
                        <div className="absolute bottom-2 w-12 h-px bg-stone-700 group-hover:w-24 group-hover:bg-red-700 transition-all duration-300"></div>
                    </button>
                    
                    {/* Flavor Text Footer */}
                    <div className="mt-8 text-center">
                        <p className="font-serif text-stone-600 text-sm italic opacity-60">
                             "{flavorText}"
                        </p>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="absolute bottom-8 right-8 flex gap-4 text-stone-600">
                    <button 
                        onClick={() => { audioManager.toggleMute(); setIsMuted(!isMuted); }}
                        className="hover:text-stone-300 transition-colors flex items-center gap-2 font-serif text-xs uppercase tracking-widest"
                    >
                        {isMuted ? 'Sound Off' : 'Sound On'} {isMuted ? '🔇' : '🔊'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderHUD = () => (
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4 md:p-6">
            {/* Top Bar: Player Status & Pause */}
            <div className="flex justify-between items-start pointer-events-auto">
                
                {/* Left: HP & EXP */}
                <div className="flex flex-col gap-2 w-1/2 max-w-xs">
                    {/* HP Bar */}
                    <div className="relative h-6 w-full">
                        {/* Background Stroke */}
                        <div className="absolute inset-0 bg-gray-900/50 transform -skew-x-12 rounded-sm border border-gray-600/30"></div>
                        {/* Fill */}
                        <div 
                            className="absolute inset-0 bg-gradient-to-r from-red-900 to-red-600 transform -skew-x-12 origin-left transition-transform duration-300 ease-out border-r-2 border-red-400"
                            style={{ width: `${Math.max(0, (hudState.hp / hudState.maxHp) * 100)}%` }}
                        ></div>
                         <div className="absolute top-7 left-0 text-xs font-serif text-red-200 drop-shadow-md">
                            {Math.ceil(hudState.hp)} / {hudState.maxHp}
                        </div>
                    </div>

                    {/* EXP Bar */}
                    <div className="relative h-2 w-3/4 mt-1">
                        <div className="absolute inset-0 bg-gray-900/50 transform -skew-x-12 rounded-sm"></div>
                        <div 
                            className="absolute inset-0 bg-blue-600 transform -skew-x-12 origin-left transition-transform duration-300"
                            style={{ width: `${Math.min(100, (hudState.exp / hudState.nextExp) * 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Right: Score & Pause */}
                <div className="text-right flex flex-col items-end gap-2">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <div className="font-ink text-4xl text-white text-shadow-ink leading-none">
                                <span className="text-xl text-gray-400 mr-1">LV.</span>{hudState.level}
                            </div>
                            <div className="font-serif text-yellow-500 text-sm mt-1 tracking-widest bg-black/40 px-2 py-0.5 rounded">
                                {score.toString().padStart(6, '0')}
                            </div>
                        </div>
                        
                        {/* PAUSE BUTTON */}
                        <button 
                            onClick={() => setGameState(GameStateEnum.PAUSED)}
                            className="pointer-events-auto w-10 h-10 rounded-full border border-stone-500 bg-stone-900/50 text-stone-300 hover:bg-stone-800 hover:text-white flex items-center justify-center transition-colors"
                            title="暂停"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom/Center: Blood Frenzy Gauge */}
            {/* Positioned at bottom center for better visibility on mobile without blocking top view */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center justify-end pb-20 pointer-events-none opacity-90">
                 {/* Talisman/Orb Container */}
                 <div className="relative w-20 h-20 transition-transform duration-300" style={{ transform: hudState.isFrenzy ? 'scale(1.2)' : 'scale(1)' }}>
                      {/* Outer Glow */}
                      <div className={`absolute inset-0 bg-red-600 rounded-full blur-xl opacity-0 transition-opacity duration-500 ${hudState.isFrenzy ? 'opacity-40 animate-pulse' : ''}`}></div>
                      
                      {/* Main Orb */}
                      <div className="w-full h-full rounded-full border-4 border-stone-800 bg-stone-900/80 overflow-hidden relative shadow-lg">
                          {/* Liquid Fill */}
                          <div 
                             className="absolute bottom-0 left-0 w-full bg-red-700 transition-all duration-300 ease-out"
                             style={{ 
                                 height: `${(hudState.blood / hudState.maxBlood) * 100}%`,
                                 boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)' 
                             }}
                          >
                              {/* Bubbles/Texture overlay */}
                              <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')]"></div>
                          </div>
                      </div>

                      {/* Character Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`font-ink text-3xl transition-colors duration-300 ${hudState.isFrenzy ? 'text-white text-glow-red animate-pulse' : 'text-stone-600'}`}>
                              {hudState.isFrenzy ? '狂' : '血'}
                          </span>
                      </div>
                 </div>
            </div>
        </div>
    );

    const renderLevelUp = () => (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 fade-in">
            <div className="max-w-5xl w-full flex flex-col items-center">
                 <h2 className="text-5xl font-ink text-white mb-10 text-shadow-red tracking-widest">武 学 精 进</h2>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                     {upgrades.map((opt, idx) => (
                         <div 
                            key={opt.id}
                            onClick={() => handleSelectUpgrade(opt)}
                            className="group relative cursor-pointer transform hover:-translate-y-4 transition-all duration-300 slide-in-right"
                            style={{ animationDelay: `${idx * 100}ms` }}
                         >
                             {/* Bamboo Scroll Background */}
                             <div className="absolute inset-0 bg-[#e3d5b8] rounded-sm shadow-2xl border-x-4 border-[#c7b28a] overflow-hidden">
                                 {/* Vertical Lines simulating bamboo strips */}
                                 <div className="absolute inset-0" style={{backgroundImage: 'linear-gradient(90deg, transparent 95%, rgba(0,0,0,0.1) 96%, transparent 100%)', backgroundSize: '20px 100%'}}></div>
                                 <div className="absolute inset-0 bg-yellow-900/10 mix-blend-multiply"></div>
                             </div>

                             {/* Content */}
                             <div className="relative p-6 h-80 flex flex-col items-center text-center justify-between border-y-8 border-stone-800">
                                 <div className="mt-4">
                                     <div className="text-xs font-serif text-stone-500 tracking-[0.5em] uppercase mb-2">
                                         {opt.rarity === 'RARE' ? 'Secret Technique' : 'Martial Art'}
                                     </div>
                                     <div className={`font-ink text-3xl ${opt.rarity === 'RARE' ? 'text-red-800' : 'text-stone-800'} mb-4`}>
                                         {opt.name.split(': ')[1]}
                                     </div>
                                     <div className="w-8 h-px bg-stone-400 mx-auto mb-4"></div>
                                     <div className="font-serif text-stone-700 text-sm leading-relaxed px-2">
                                         {opt.description}
                                     </div>
                                 </div>

                                 {/* Icon Stamp */}
                                 <div className="mb-4 text-5xl opacity-80 group-hover:scale-110 transition-transform filter grayscale group-hover:grayscale-0">
                                     {opt.icon || (opt.type === 'WEAPON' ? '⚔️' : '📜')}
                                 </div>

                                 {/* Select Button Hint */}
                                 <div className="w-full py-2 bg-stone-800 text-[#e3d5b8] font-serif text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                     研 习
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
            </div>
        </div>
    );

    const renderGameOver = () => (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 p-4 fade-in">
            <div className="text-center relative">
                {/* Blood Splatter Background (CSS/SVG) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-900/20 rounded-full blur-3xl pointer-events-none"></div>
                
                <h1 className="text-8xl md:text-9xl font-ink text-stone-200 mb-2 relative z-10 text-shadow-red">
                    胜 败 乃<br/>兵 家 常 事
                </h1>
                
                <div className="my-12 relative z-10">
                    <p className="text-lg font-serif text-gray-500 mb-2 uppercase tracking-widest">Final Score</p>
                    <p className="text-6xl font-mono text-yellow-600 font-bold">{score}</p>
                </div>
                
                <button 
                    onClick={() => setGameState(GameStateEnum.MENU)}
                    className="relative z-10 px-16 py-4 border border-stone-600 text-stone-400 font-ink text-3xl hover:border-red-600 hover:text-red-500 transition-colors"
                >
                    重 出 江 湖
                </button>
            </div>
        </div>
    );

    const renderChestReward = () => (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 fade-in">
            <div className="ink-card p-12 max-w-md w-full text-center relative animate-pulse-slow">
                <div className="text-8xl mb-6 filter drop-shadow-lg">{chestReward?.icon}</div>
                <h2 className="text-5xl font-ink text-yellow-700 mb-4">奇 遇</h2>
                <div className="w-16 h-1 bg-gray-200 mx-auto mb-6"></div>
                <h3 className="text-3xl font-bold text-gray-800 mb-4">{chestReward?.name}</h3>
                <p className="text-gray-600 font-serif mb-10 text-lg">{chestReward?.desc}</p>
                
                <button 
                    onClick={() => setGameState(GameStateEnum.PLAYING)}
                    className="w-full py-4 bg-stone-900 text-[#f5f5f0] font-ink text-2xl hover:bg-red-900 transition-colors shadow-lg border border-stone-600"
                >
                    收 下
                </button>
            </div>
         </div>
    );

    const renderAssetGen = () => (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white fade-in">
            <div className="w-20 h-20 border-t-4 border-l-4 border-red-600 rounded-full animate-spin mb-10"></div>
            <h2 className="text-4xl font-ink mb-4 text-shadow-red">天 工 开 物</h2>
            <p className="font-serif text-gray-400 mb-6 text-lg">正在绘制 <span className="text-red-400 font-bold mx-2">{genStyle}</span> 风格江湖画卷</p>
            
            <div className="text-xl font-mono text-yellow-600 animate-pulse bg-gray-900 px-6 py-2 rounded border border-gray-800">
                {genStatus}
            </div>
            
            <p className="font-serif text-sm text-gray-600 mt-12 max-w-md text-center leading-relaxed opacity-60">
                请耐心等待，丹青妙手正在挥毫...<br/>
                Wait time depends on free API queue.
            </p>
        </div>
    );

    const renderStyleManager = () => (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 fade-in" onClick={() => setShowStyleManager(false)}>
            <div className="bg-paper-pattern max-w-5xl w-full max-h-[90vh] flex flex-col ink-card overflow-hidden text-gray-900 relative rounded-sm" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-gray-300 bg-white/50">
                    <div>
                        <h2 className="text-4xl font-ink text-gray-900">易容术</h2>
                        <p className="text-xs font-serif text-gray-500 mt-1 uppercase tracking-widest">Visual Style Customization</p>
                    </div>
                    <button onClick={() => setShowStyleManager(false)} className="text-4xl text-gray-400 hover:text-red-800 transition-colors font-ink">×</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-stone-100/50">
                     {/* Generator Tool */}
                    <div className="mb-10 p-6 bg-white border border-gray-300 shadow-sm flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-800 mb-2">丹青坊</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                使用 AI 生成全新的游戏素材。选择一种艺术风格，即刻重绘整个江湖。
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                             <div className="flex gap-2">
                                {[ArtStyle.INK, ArtStyle.ANIME, ArtStyle.PIXEL, ArtStyle.OIL].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setGenStyle(s)}
                                        className={`px-3 py-1 text-xs font-serif border transition-all
                                        ${genStyle === s 
                                            ? 'bg-gray-800 text-white border-gray-800' 
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={handleAssetGen}
                                className="w-full py-2 bg-red-800 text-white font-serif hover:bg-red-700 transition-colors shadow-md text-sm"
                            >
                                ✨ 生成新风格
                            </button>
                        </div>
                    </div>

                    {/* Presets */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {Object.entries(ASSET_LIBRARY).map(([key, lib]) => (
                            <div 
                                key={key}
                                onClick={() => handleSelectStyle(key, false)}
                                className={`group relative cursor-pointer border-2 transition-all p-2 bg-white
                                ${selectedStyleId === key ? 'border-red-800 shadow-lg' : 'border-transparent hover:border-gray-300'}`}
                            >
                                <div className="aspect-square bg-gray-100 mb-3 overflow-hidden">
                                    <img src={lib.player || ''} className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform" alt={key} />
                                </div>
                                <div className="text-center">
                                     <span className={`font-ink text-xl ${selectedStyleId === key ? 'text-red-800' : 'text-gray-600'}`}>{key}</span>
                                </div>
                                {selectedStyleId === key && <div className="absolute top-2 right-2 text-red-800 text-xl">✓</div>}
                            </div>
                        ))}
                        
                        {/* Custom */}
                        {Object.entries(customLibrary).map(([id, lib]) => (
                             <div 
                                key={id}
                                onClick={() => handleSelectStyle(id, true)}
                                className={`group relative cursor-pointer border-2 transition-all p-2 bg-white
                                ${selectedStyleId === id ? 'border-blue-800 shadow-lg' : 'border-transparent hover:border-gray-300'}`}
                            >
                                <div className="aspect-square bg-gray-100 mb-3 overflow-hidden">
                                    <img src={lib.player || ''} className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform" alt="Custom" />
                                </div>
                                <div className="text-center">
                                     <span className="font-ink text-xl text-blue-900">自创 {lib.currentStyle}</span>
                                     <div className="text-xs text-gray-400 mt-1">{new Date(parseInt(id)).toLocaleTimeString()}</div>
                                </div>
                                <button 
                                    onClick={(e) => handleDeleteStyle(e, id)}
                                    className="absolute top-1 left-1 text-gray-300 hover:text-red-600 p-1"
                                >
                                    ×
                                </button>
                                {selectedStyleId === id && <div className="absolute top-2 right-2 text-blue-800 text-xl">✓</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full h-screen overflow-hidden relative font-sans text-gray-100 bg-black">
            <GameCanvas 
                gameState={gameState}
                setGameState={setGameState}
                onLevelUp={handleLevelUp}
                onGameOver={(finalScore) => {}} 
                assets={assets}
                playerRef={playerRef}
                isTouchDevice={isTouch}
                onChestPickup={handleChestPickup}
            />

            {gameState === GameStateEnum.MENU && renderMenu()}
            {gameState === GameStateEnum.PLAYING && renderHUD()}
            {gameState === GameStateEnum.LEVEL_UP && renderLevelUp()}
            {gameState === GameStateEnum.GAME_OVER && renderGameOver()}
            {gameState === GameStateEnum.ASSET_GEN && renderAssetGen()}
            {gameState === GameStateEnum.CHEST_REWARD && renderChestReward()}
            
            {showStyleManager && renderStyleManager()}

            {gameState === GameStateEnum.PAUSED && (
                <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center fade-in">
                    <div className="text-center border-y-4 border-stone-800 py-16 px-24 bg-stone-900/50">
                        <h2 className="text-6xl font-ink text-stone-200 mb-12 tracking-[0.2em] text-shadow-ink">暂 停</h2>
                        <div className="flex flex-col gap-6">
                            <button 
                                onClick={() => setGameState(GameStateEnum.PLAYING)}
                                className="px-12 py-3 bg-stone-100 text-black font-ink text-2xl hover:bg-red-700 hover:text-white transition-colors duration-300 shadow-lg"
                            >
                                继 续 战 斗
                            </button>
                             <button 
                                onClick={() => setGameState(GameStateEnum.MENU)}
                                className="text-stone-500 hover:text-red-500 transition-colors font-serif text-sm tracking-widest mt-4 uppercase"
                            >
                                退出江湖 (Exit)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;

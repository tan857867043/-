
import { GeneratedAssets, ArtStyle } from "../types";

// --- API KEY MANAGEMENT ---
// Pollinations is completely free and requires no key.
export const setGlobalApiKey = (key: string) => {};
export const getGlobalApiKey = () => "FREE_OPEN_API";
export const hasValidApiKey = () => true;

// --- IMAGE PROCESSING HELPERS ---

const detectBackgroundColor = (data: Uint8ClampedArray, width: number, height: number) => {
    const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height * width) - 1) * 4];
    let r = 0, g = 0, b = 0;
    corners.forEach(i => { r += data[i]; g += data[i + 1]; b += data[i + 2]; });
    return { r: Math.round(r / 4), g: Math.round(g / 4), b: Math.round(b / 4) };
};

const processSmartChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const bg = detectBackgroundColor(data, width, height);
    const tolerance = 100; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const dist = Math.sqrt((r - bg.r)**2 + (g - bg.g)**2 + (b - bg.b)**2);
        if (dist < tolerance) {
            // Smooth alpha falloff
            const alpha = Math.max(0, (dist - (tolerance - 20)) * 12);
            data[i + 3] = Math.min(data[i+3], Math.floor(alpha));
        }
    }
    ctx.putImageData(imgData, 0, 0);
};

const processBlackBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 40 && data[i+1] < 40 && data[i+2] < 40) data[i+3] = 0;
    }
    ctx.putImageData(imgData, 0, 0);
};

const processImage = (base64Data: string, isSprite: boolean, isProjectile: boolean): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const targetSize = isSprite ? 256 : 512;
            canvas.width = targetSize;
            canvas.height = targetSize;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) { resolve(base64Data); return; }

            // Draw and resize
            ctx.drawImage(img, 0, 0, targetSize, targetSize);

            // Apply transparency
            if (isProjectile) processBlackBackground(ctx, targetSize, targetSize);
            else processSmartChromaKey(ctx, targetSize, targetSize);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(base64Data);
        img.src = base64Data;
    });
};

const getStylePrompt = (style: ArtStyle): string => {
    switch (style) {
        case ArtStyle.ANIME: return "anime style, cel shaded, vibrant, clean lines";
        case ArtStyle.PIXEL: return "pixel art style, 16-bit, retro";
        case ArtStyle.OIL: return "oil painting style, textured, artistic";
        default: return "chinese ink wash painting style, wuxia, black strokes on white";
    }
};

// --- POLLINATIONS.AI SERVICE ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchPollinationsImage = async (prompt: string, attempt = 1): Promise<string | null> => {
    try {
        // Random seed + timestamp to force new generation
        const seed = Math.floor(Math.random() * 10000000);
        const cacheBust = Date.now();
        
        // Use 'turbo' model for speed and lower rate limit checks
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true&model=turbo&cb=${cacheBust}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn(`Attempt ${attempt} failed for Pollinations.`);
        return null;
    }
};

export const generateGameAssets = async (style: ArtStyle = ArtStyle.INK, onProgress?: (status: string) => void): Promise<GeneratedAssets> => {
    const styleDesc = getStylePrompt(style);
    const charBg = "isolated on green background";
    const projBg = "isolated on black background";

    // Queue helper to run tasks sequentially
    const runQueue = async (tasks: { label: string, desc: string, bg: string, isSprite: boolean, isProj?: boolean }[]) => {
        const results: Record<string, string | null> = {};
        
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const progressPercent = Math.round(((i) / tasks.length) * 100);
            if (onProgress) onProgress(`[${progressPercent}%] 生成: ${task.label} (排队中)...`);
            
            // 1. Mandatory cool-down between requests to be "Nice" to the free API
            // First item doesn't need wait, others do.
            if (i > 0) await wait(3000); 

            // 2. Generate
            const prompt = `${styleDesc}, ${task.desc}, ${task.bg}, high quality game asset`;
            let rawImage = await fetchPollinationsImage(prompt, 1);
            
            // Retry logic
            if (!rawImage) {
                if (onProgress) onProgress(`[${progressPercent}%] 重试: ${task.label}...`);
                await wait(4000); // Wait longer for retry
                rawImage = await fetchPollinationsImage(prompt, 2);
            }

            // 3. Process
            if (rawImage) {
                results[task.label] = await processImage(rawImage, task.isSprite, !!task.isProj);
            } else {
                results[task.label] = null;
            }
        }
        return results;
    };

    const tasks = [
        { key: 'player', label: '侠客主角', desc: 'wuxia swordsman hero character, action pose', bg: charBg, isSprite: true },
        { key: 'enemyPeasant', label: '杂兵', desc: 'zombie minion, ragged clothes', bg: charBg, isSprite: true },
        { key: 'enemyCultist', label: '邪教徒', desc: 'evil cultist mage, robes', bg: charBg, isSprite: true },
        { key: 'enemyCharger', label: '蛮牛', desc: 'wild boar beast monster', bg: charBg, isSprite: true },
        { key: 'enemyArcher', label: '弓手', desc: 'skeleton archer', bg: charBg, isSprite: true },
        { key: 'enemyBoss', label: '魔王', desc: 'demon warlord boss, heavy armor', bg: charBg, isSprite: true },
        { key: 'projectileSword', label: '飞剑', desc: 'glowing magic sword flying', bg: projBg, isSprite: true, isProj: true },
        // Background usually takes longest/fails most often, put last or skip processing
        // { key: 'background', label: '背景', desc: 'seamless ground texture, ancient stone floor', bg: 'texture', isSprite: false },
    ];

    const results: any = { currentStyle: style };
    
    // Execute queue
    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (onProgress) onProgress(`正在绘制 (${i+1}/${tasks.length}): ${t.label}`);
        
        // Wait before request (except first)
        if (i > 0) await wait(2500); 

        const prompt = `${styleDesc}, ${t.desc}, ${t.bg}, game asset`;
        let img = await fetchPollinationsImage(prompt);
        
        if (!img) {
            // Simple retry
            await wait(2000);
            img = await fetchPollinationsImage(prompt);
        }

        if (img) {
            results[t.key] = await processImage(img, t.isSprite, !!t.isProj);
        } else {
            results[t.key] = null; // Will fallback to default
        }
    }

    // Handle background separately (less critical, no removal needed)
    // results['background'] = null; // Skip background gen to save time/quota for now, or uncomment below
    
    return results as GeneratedAssets;
};

// Simple offline flavor text
export const generateFlavorText = async (context: string): Promise<string> => {
    const texts = [
        "剑气纵横三万里，一剑光寒十九洲。",
        "十步杀一人，千里不留行。",
        "风萧萧兮易水寒，壮士一去兮不复还。",
        "天下风云出我辈，一入江湖岁月催。",
        "曾经沧海难为水，除却巫山不是云。"
    ];
    return texts[Math.floor(Math.random() * texts.length)];
}

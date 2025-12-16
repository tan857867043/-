
import { GoogleGenAI } from "@google/genai";
import { GeneratedAssets, ArtStyle } from "../types";

// --- API KEY MANAGEMENT ---
const STORAGE_KEY_API = 'USER_GEMINI_API_KEY';
let currentApiKey = localStorage.getItem(STORAGE_KEY_API) || (typeof process !== 'undefined' && process.env ? process.env.API_KEY : '') || '';

export const setGlobalApiKey = (key: string) => {
    currentApiKey = key;
    localStorage.setItem(STORAGE_KEY_API, key);
};

export const getGlobalApiKey = () => currentApiKey;

export const hasValidApiKey = () => !!currentApiKey;

const getAIClient = () => {
    if (!currentApiKey) {
        throw new Error("API Key missing");
    }
    return new GoogleGenAI({ apiKey: currentApiKey });
};

// --- ADVANCED IMAGE PROCESSING ---

/**
 * Detects the dominant background color by sampling the four corners of the image.
 * This makes the cutout robust even if AI changes the shade of green or uses white.
 */
const detectBackgroundColor = (data: Uint8ClampedArray, width: number, height: number) => {
    const corners = [
        0,                                      // Top-Left
        (width - 1) * 4,                        // Top-Right
        (height - 1) * width * 4,               // Bottom-Left
        ((height * width) - 1) * 4              // Bottom-Right
    ];

    let r = 0, g = 0, b = 0;
    corners.forEach(i => {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    });

    return { 
        r: Math.round(r / 4), 
        g: Math.round(g / 4), 
        b: Math.round(b / 4) 
    };
};

/**
 * Smart Auto-Chroma Key with Despill
 */
const processSmartChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    
    // 1. Auto-detect background color
    const bg = detectBackgroundColor(data, width, height);
    
    // Determine which channel is dominant in the background
    const maxBgChannel = Math.max(bg.r, bg.g, bg.b);
    let domChannel = 'g';
    if (bg.r === maxBgChannel && bg.r > 50) domChannel = 'r';
    else if (bg.b === maxBgChannel && bg.b > 50) domChannel = 'b';
    else if (maxBgChannel < 50) domChannel = 'dark';
    else if (bg.r > 200 && bg.g > 200 && bg.b > 200) domChannel = 'white';

    const tolerance = 110; 

    for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 2. Calculate Color Distance
        const dist = Math.sqrt((r - bg.r)**2 + (g - bg.g)**2 + (b - bg.b)**2);
        
        // Alpha Keying
        if (dist < tolerance) {
            const alpha = Math.max(0, (dist - (tolerance - 40)) * 6);
            data[i + 3] = Math.min(data[i+3], Math.floor(alpha));
            if (data[i+3] === 0) continue;
        }

        // 3. Adaptive Despill
        if (data[i+3] > 0) {
            if (domChannel === 'g') {
                if (g > r && g > b) data[i + 1] = (r + b) / 2; 
            } else if (domChannel === 'b') {
                if (b > r && b > g) data[i + 2] = (r + g) / 2;
            } else if (domChannel === 'white') {
                if (r > 200 && g > 200 && b > 200) {
                     const avg = (r + g + b) / 3;
                     data[i] = avg; data[i+1] = avg; data[i+2] = avg;
                }
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
};

const processBlackBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const threshold = 40; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r < threshold && g < threshold && b < threshold) {
            data[i+3] = 0; 
        }
    }
    ctx.putImageData(imgData, 0, 0);
};

const processImage = (base64Data: string, style: ArtStyle, isSprite: boolean, isProjectile: boolean): Promise<string> => {
    return new Promise((resolve) => {
        if (!base64Data) { resolve(base64Data); return; }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            
            // NOTE: We MUST force square aspect ratio for sprites (player/enemies) 
            // so they are not interpreted as 2-frame sprite sheets by the renderer 
            // if the generated image happens to be landscape.
            let targetWidth = 512;
            let targetHeight = 512;

            if (isSprite) {
                targetWidth = 256;
                targetHeight = 256;
            }

            // If it's not a sprite (e.g. background), maintain aspect or specific width
            if (!isSprite) {
                targetWidth = 512;
                const scale = targetWidth / img.width;
                targetHeight = img.height * scale;
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(base64Data); return; }

            if (isSprite) {
                // Center and Contain in Square
                const scale = Math.min(targetWidth / img.width, targetHeight / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const offsetX = (targetWidth - drawW) / 2;
                const offsetY = (targetHeight - drawH) / 2;
                ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
            } else {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }

            if (isProjectile) {
                processBlackBackground(ctx, canvas.width, canvas.height);
            } else {
                processSmartChromaKey(ctx, canvas.width, canvas.height);
            }

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(base64Data);
        img.src = base64Data;
    });
};

const getStylePrompt = (style: ArtStyle): string => {
    switch (style) {
        case ArtStyle.ANIME:
            return "Japanese anime style, cel shaded, vibrant colors";
        case ArtStyle.PIXEL:
            return "pixel art style, clean pixels";
        case ArtStyle.OIL:
            return "oil painting style, thick brushstrokes";
        case ArtStyle.INK:
        default:
            return "chinese ink wash painting style, bold black strokes, traditional wuxia, masterpiece";
    }
};

export const generateGameAssets = async (style: ArtStyle = ArtStyle.INK): Promise<GeneratedAssets> => {
    if (!hasValidApiKey()) throw new Error("API_KEY_MISSING");

    const ai = getAIClient();
    const styleDesc = getStylePrompt(style);
    
    const charBg = "isolated on flat solid lime green background (RGB 0,255,0), no shadows, sharp silhouette, full body";
    const projBg = "glowing energy, isolated on pure black background, high contrast";

    const generate = async (desc: string, bg: string, isSprite: boolean, isProjectile: boolean = false) => {
        try {
            const prompt = `Concept art, ${styleDesc}, ${desc}, ${bg}. Single character, centered, no background details.`;
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: prompt }] },
            });

            let rawBase64 = null;
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    rawBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    break;
                }
            }
            
            if (rawBase64) {
                return await processImage(rawBase64, style, isSprite, isProjectile);
            }
            return null;
        } catch (e) {
            console.error("Gen error", e);
            return null;
        }
    };

    const [player, enemyPeasant, enemyCultist, enemyCharger, enemyArcher, enemyBoss, projectileSword] = await Promise.all([
        generate("heroic wuxia swordsman, holding sword, dynamic action pose, full body, facing right side profile", charBg, true),
        generate("weak zombie minion, ragged clothes, hunchback, full body, facing right side profile", charBg, true),
        generate("evil cultist mage, wearing robes and tall hat, holding a staff, mysterious, full body, facing right side profile", charBg, true),
        generate("wild boar beast man, muscular, charging pose, heavy breathing, full body, facing right side profile", charBg, true),
        generate("skeleton assassin archer, holding a bow, aiming, nimble, full body, facing right side profile", charBg, true),
        generate("giant demon warlord general, heavy armor, holding massive weapon, full body, facing right side profile", charBg, true),
        generate("magical flying sword, glowing aura, horizontal, pointing right", projBg, true, true)
    ]);

    return {
        currentStyle: style,
        player,
        enemyPeasant,
        enemyCultist,
        enemyCharger,
        enemyArcher,
        enemyBoss,
        background: null,
        projectileSword
    };
};

export const generateFlavorText = async (context: string): Promise<string> => {
    if (!hasValidApiKey()) return "请先配置 API Key 以获取 AI 生成内容。";

    try {
         const ai = getAIClient();
         const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: `Write a short, poetic, 1-sentence description in Chinese for a Wuxia game context: ${context}. Style: Jin Yong novel.`,
         });
         return response.text.trim();
    } catch (e) {
        return "剑气纵横三万里，一剑光寒十九洲。";
    }
}


import { GoogleGenAI } from "@google/genai";
import { GeneratedAssets, ArtStyle } from "../types";

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
 * 
 * 1. Auto-detects background color from corners.
 * 2. Removes that color with a dynamic tolerance.
 * 3. Applies Despill based on the detected dominant channel to remove halos.
 */
const processSmartChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const len = data.length;
    
    // 1. Auto-detect background color
    const bg = detectBackgroundColor(data, width, height);
    
    // Determine which channel is dominant in the background (for despill)
    const maxBgChannel = Math.max(bg.r, bg.g, bg.b);
    let domChannel = 'g';
    if (bg.r === maxBgChannel && bg.r > 50) domChannel = 'r';
    else if (bg.b === maxBgChannel && bg.b > 50) domChannel = 'b';
    else if (maxBgChannel < 50) domChannel = 'dark'; // Dark background
    else if (bg.r > 200 && bg.g > 200 && bg.b > 200) domChannel = 'white'; // White background

    // Tolerance: Higher for brighter backgrounds generally helps
    const tolerance = 110; 

    for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 2. Calculate Color Distance from Detected Background
        const dist = Math.sqrt((r - bg.r)**2 + (g - bg.g)**2 + (b - bg.b)**2);
        
        // Alpha Keying
        if (dist < tolerance) {
            // Smooth falloff for soft edges
            // If very close to background color -> Transparent
            // If somewhat close -> Semi-transparent
            const alpha = Math.max(0, (dist - (tolerance - 40)) * 6); // Ramped opacity
            data[i + 3] = Math.min(data[i+3], Math.floor(alpha));
            
            // If fully transparent, skip despill
            if (data[i+3] === 0) continue;
        }

        // 3. Adaptive Despill (Remove Color Cast/Halo)
        // Only apply if the pixel is somewhat visible but might have a fringe
        if (data[i+3] > 0) {
            if (domChannel === 'g') {
                // Green Despill: If Green is dominant in pixel, clamp it
                if (g > r && g > b) {
                    data[i + 1] = (r + b) / 2; 
                }
            } else if (domChannel === 'b') {
                // Blue Despill
                if (b > r && b > g) {
                    data[i + 2] = (r + g) / 2;
                }
            } else if (domChannel === 'white') {
                // White Despill / Multiply Logic approximation
                // If pixel is very bright/white, make it transparent (handled by distance above)
                // But for fringes, we might want to darken them slightly to avoid white halo
                if (r > 200 && g > 200 && b > 200) {
                     // Slightly lower brightness of fringes
                     const avg = (r + g + b) / 3;
                     data[i] = avg; data[i+1] = avg; data[i+2] = avg;
                }
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
};

// For Projectiles: Standard "Make Black Transparent" (Screen Mode simulation for alpha)
const processBlackBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const threshold = 40; 

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        if (r < threshold && g < threshold && b < threshold) {
            data[i+3] = 0; // Turn true black into transparent
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
            const targetWidth = isSprite ? 256 : 512;
            const scale = targetWidth / img.width;
            canvas.width = targetWidth;
            canvas.height = img.height * scale;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(base64Data); return; }

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            if (isProjectile) {
                // Projectiles: Assume dark background, use Black-to-Alpha
                processBlackBackground(ctx, canvas.width, canvas.height);
            } else {
                // Characters: Auto-detect background and remove it
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const styleDesc = getStylePrompt(style);
    
    // Updated Prompts: Strongly request a flat, distinct background color.
    // We request Lime Green (#00FF00) as primary, but our code can now handle if AI ignores it.
    const charBg = "isolated on flat solid lime green background (RGB 0,255,0), no shadows, sharp silhouette, full body";
    const projBg = "glowing energy, isolated on pure black background, high contrast";

    const generate = async (desc: string, bg: string, isSprite: boolean, isProjectile: boolean = false) => {
        try {
            // "Concept Art" helps get a cleaner subject isolation
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

    const [player, enemyPeasant, enemyBoss, projectileSword] = await Promise.all([
        generate("heroic wuxia swordsman, holding sword, dynamic action pose", charBg, true),
        generate("creepy zombie minion, ragged clothes, hunchback", charBg, true),
        generate("giant demon warlord general, heavy armor, holding massive weapon", charBg, true),
        generate("magical flying sword, glowing aura", projBg, true, true)
    ]);

    return {
        currentStyle: style,
        player,
        enemyPeasant,
        enemyBoss,
        background: null,
        projectileSword
    };
};

export const generateFlavorText = async (context: string): Promise<string> => {
    try {
         const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
         const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: `Write a short, poetic, 1-sentence description in Chinese for a Wuxia game context: ${context}. Style: Jin Yong novel.`,
         });
         return response.text.trim();
    } catch (e) {
        return "剑气纵横三万里，一剑光寒十九洲。";
    }
}

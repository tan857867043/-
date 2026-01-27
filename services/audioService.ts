
// Web Audio API Synthesizer for Wuxia Sound Effects

class AudioController {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private isMuted: boolean = false;
    private bgmOscillators: OscillatorNode[] = [];
    private bgmGain: GainNode | null = null;

    constructor() {
        // Lazy init to respect browser autoplay policies
    }

    public init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = 0.4; // Default volume
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            // Smooth transition
            const now = this.ctx!.currentTime;
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.4, now, 0.1);
        }
    }

    public getMuteState() {
        return this.isMuted;
    }

    // --- SYNTHESIZERS ---

    // 1. Sword Swoosh (Filtered Noise)
    public playAttack(type: 'SWORD' | 'HEAVY' = 'SWORD') {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth'; // Rougher sound for tearing air
        filter.type = 'bandpass';
        
        if (type === 'SWORD') {
            osc.frequency.setValueAtTime(800 + Math.random() * 200, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
            filter.frequency.setValueAtTime(2000, t);
            filter.frequency.linearRampToValueAtTime(100, t + 0.1);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        } else {
            // Heavy blade
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
            filter.frequency.setValueAtTime(800, t);
            gain.gain.setValueAtTime(0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        }

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(t);
        osc.stop(t + 0.3);
    }

    // 2. Hit Impact (Drum/Thud)
    public playHit(isCrit: boolean = false) {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Layer 1: The sharp hit
        osc.type = isCrit ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(isCrit ? 300 : 150, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.15);

        gain.gain.setValueAtTime(isCrit ? 0.4 : 0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(t);
        osc.stop(t + 0.15);

        // Layer 2: Low Thud for impact (Criticals only)
        if (isCrit) {
            const subOsc = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            subOsc.type = 'sine';
            subOsc.frequency.setValueAtTime(80, t);
            subOsc.frequency.exponentialRampToValueAtTime(30, t + 0.2);
            
            subGain.gain.setValueAtTime(0.5, t);
            subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            
            subOsc.connect(subGain);
            subGain.connect(this.masterGain!);
            subOsc.start(t);
            subOsc.stop(t + 0.2);
        }
    }

    // 3. Pickup / Exp (Short, sharp Jade bead sound)
    public playPickup(isBig: boolean = false) {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // High sine/triangle for "Jade" sound
        osc.type = 'sine';
        // Pentatonicish note
        const freq = isBig ? 1174.66 : 1567.98; // High D6 or G6
        osc.frequency.setValueAtTime(freq, t);

        // Very short percussive envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(t);
        osc.stop(t + 0.1);
    }

    // 4. Level Up (Guzheng Glissando / Strum)
    public playLevelUp() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        
        // Pentatonic Scale (Guzheng style open strings): D, E, G, A, B, D, E
        const notes = [293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25]; 

        notes.forEach((freq, i) => {
            const t = now + i * 0.05; // Fast strum
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();

            // Sawtooth + Lowpass filter simulates plucked string brightness
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(freq, t);
            
            // Filter envelope for "Pluck"
            const filter = this.ctx!.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = 5;
            filter.frequency.setValueAtTime(300, t);
            filter.frequency.exponentialRampToValueAtTime(3000, t + 0.05);
            filter.frequency.exponentialRampToValueAtTime(300, t + 0.4);

            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0); 

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain!);
            
            osc.start(t);
            osc.stop(t + 1.2);
        });
    }

    // 5. Dash (Wind Whoosh)
    public playDash() {
        if (!this.ctx || this.isMuted) return;
        const t = this.ctx.currentTime;

        // Create noise buffer
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, t);
        filter.frequency.linearRampToValueAtTime(1500, t + 0.1); // Open filter
        filter.frequency.linearRampToValueAtTime(100, t + 0.3); // Close filter

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        noise.start(t);
    }

    // 6. Ambience (Dark Drone)
    public startAmbience() {
        if (!this.ctx || this.bgmGain) return; // Already playing or not init
        
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.connect(this.masterGain!);
        this.bgmGain.gain.value = 0.15;

        // Two low oscillators for beating effect
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 55; // A1
        
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 58; // Slightly detuned

        osc1.connect(this.bgmGain);
        osc2.connect(this.bgmGain);

        osc1.start();
        osc2.start();

        this.bgmOscillators.push(osc1, osc2);
    }

    public stopAmbience() {
        this.bgmOscillators.forEach(o => o.stop());
        this.bgmOscillators = [];
        if (this.bgmGain) {
            this.bgmGain.disconnect();
            this.bgmGain = null;
        }
    }
}

export const audioManager = new AudioController();

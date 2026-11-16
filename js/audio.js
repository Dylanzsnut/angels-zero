// Web Audio API Synthesizer & Procedural BGM Engine for Orbital Perimeter
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.bgmMuted = false;
        this.commsMuted = false;
        this.lastCommsTime = 0;
        this.commsCategoryTimes = {};
        this._commsHideTimer = null;
        this.masterVolume = 0.48;
        this.bgmVolume = 0.36;
        this.initialized = false;

        // Procedural Synth Sequencer
        this.bgmPlaying = false;
        this.bgmStep = 0;
        this.bgmInterval = null;
        this.bgmTempo = 96; // BPM - brooding heavy mech-sim pulse

        // Module 3 Dual-Space & Sensor Telemetry State
        this.interiorBus = null;
        this.exteriorBus = null;
        this.interiorRoutingMode = 'uninitialized';
        this.rotaryDistortionCurve = null;
        this.brownAmbienceGain = null;
        this.brownAmbienceBase = 0;
        this.windAmbienceGain = null;
        this.windAmbienceBase = 0;
        this._lastThunderTailTime = -10;
        this._lastWindDuckTime = -10;
        this._lastCoolingTickTime = -10;
        this._soundCooldowns = new Map();
        this._voiceEndTimes = [];
        this._maxGlobalVoices = 26;

        // Pre-rendered neural comms (manifest + decoded buffers)
        this.commsManifest = null;
        this.commsLookups = {};
        this.commsBuffers = {};
        this.commsLoadStarted = false;
    }

    canPlayVoice(key, minIntervalSec = 0.05, voiceDurationSec = 0.25, maxGlobalVoices = this._maxGlobalVoices) {
        if (this.muted || !this.ctx) return false;
        const now = (typeof this.ctx.currentTime === 'number') ? this.ctx.currentTime : (performance.now() * 0.001);
        const last = this._soundCooldowns.get(key);
        if (last !== undefined && (now - last) < minIntervalSec) {
            return false;
        }
        // Prune expired voices and enforce polyphony cap to prevent audio thread saturation
        let writeIdx = 0;
        for (let i = 0; i < this._voiceEndTimes.length; i++) {
            if (this._voiceEndTimes[i] > now) {
                this._voiceEndTimes[writeIdx++] = this._voiceEndTimes[i];
            }
        }
        this._voiceEndTimes.length = writeIdx;
        if (this._voiceEndTimes.length >= maxGlobalVoices) {
            return false;
        }
        this._soundCooldowns.set(key, now);
        this._voiceEndTimes.push(now + Math.max(0.05, voiceDurationSec));
        return true;
    }

    getInteriorBus() {
        return this.interiorBus || this.masterOut || (this.ctx && this.ctx.destination);
    }

    getExteriorBus() {
        return this.exteriorBus || this.masterOut || (this.ctx && this.ctx.destination);
    }

    makeDistortionCurve(amount = 26) {
        const samples = 512;
        const curve = new Float32Array(samples);
        const k = Math.max(1, amount);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            const raw = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            curve[i] = Math.max(-1, Math.min(1, raw));
        }
        return curve;
    }

    initAcousticBuses() {
        if (!this.ctx) return;
        const out = this.masterOut || this.ctx.destination;

        // 1) Interior Cockpit Bus: dry direct feed + tight steel enclosure resonance
        this.interiorBus = this.ctx.createGain();
        this.interiorBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
        const dryGain = this.ctx.createGain();
        dryGain.gain.setValueAtTime(0.82, this.ctx.currentTime);
        this.interiorBus.connect(dryGain);
        dryGain.connect(out);

        let convolverWired = false;
        if (typeof this.ctx.createConvolver === 'function' && typeof this.ctx.createBuffer === 'function') {
            try {
                const sr = this.ctx.sampleRate || 44100;
                const irLen = Math.max(64, Math.floor(sr * 0.16));
                const irBuffer = this.ctx.createBuffer(1, irLen, sr);
                const irData = irBuffer.getChannelData(0);
                for (let i = 0; i < irLen; i++) {
                    const t = i / sr;
                    const env = Math.exp(-t * 38.0);
                    irData[i] = (Math.random() * 2 - 1) * 0.35 * env;
                }
                const convolver = this.ctx.createConvolver();
                convolver.buffer = irBuffer;
                const wetGain = this.ctx.createGain();
                wetGain.gain.setValueAtTime(0.14, this.ctx.currentTime);
                this.interiorBus.connect(convolver);
                convolver.connect(wetGain);
                wetGain.connect(out);
                this.cockpitConvolver = convolver;
                this.interiorRoutingMode = 'convolver';
                convolverWired = true;
            } catch (e) {
                convolverWired = false;
            }
        }

        if (!convolverWired) {
            try {
                // Fallback tight metallic slapback (13ms + 27ms) through steel bandpass (820Hz, Q=3.4)
                const bp = this.ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.setValueAtTime(820, this.ctx.currentTime);
                bp.Q.setValueAtTime(3.4, this.ctx.currentTime);
                const wetGain = this.ctx.createGain();
                wetGain.gain.setValueAtTime(0.28, this.ctx.currentTime);

                if (typeof this.ctx.createDelay === 'function') {
                    const d1 = this.ctx.createDelay(0.1);
                    const d2 = this.ctx.createDelay(0.1);
                    d1.delayTime.setValueAtTime(0.013, this.ctx.currentTime);
                    d2.delayTime.setValueAtTime(0.027, this.ctx.currentTime);
                    this.interiorBus.connect(d1);
                    this.interiorBus.connect(d2);
                    d1.connect(bp);
                    d2.connect(bp);
                } else {
                    this.interiorBus.connect(bp);
                }
                bp.connect(wetGain);
                wetGain.connect(out);
                this.interiorRoutingMode = 'delay_fallback';
            } catch (e2) {
                this.interiorRoutingMode = 'dry_fallback';
            }
        }

        // 2) Exterior World Bus: warm armored glass low-pass filter (~2800Hz, crisp yet grounded)
        this.exteriorBus = this.ctx.createGain();
        this.exteriorBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
        try {
            const glassMuffle = this.ctx.createBiquadFilter();
            glassMuffle.type = 'lowpass';
            glassMuffle.frequency.setValueAtTime(2800, this.ctx.currentTime);
            glassMuffle.Q.setValueAtTime(0.55, this.ctx.currentTime);
            this.exteriorBus.connect(glassMuffle);
            glassMuffle.connect(out);
            this.exteriorMuffleFilter = glassMuffle;
        } catch (e) {
            this.exteriorBus.connect(out);
        }
    }

    // 1.2s–1.5s Rolling Desert Canyon Thunder Tail (Exterior Bus)
    triggerDesertThunderTail(intensity = 0.25, duration = 1.35, minIntervalSec = 0.0) {
        if (this.muted || !this.ctx) return;
        const noiseBuf = this.brownNoiseBuffer || this.pinkNoiseBuffer;
        if (!noiseBuf) return;

        const now = this.ctx.currentTime;
        if (minIntervalSec > 0 && (now - this._lastThunderTailTime) < minIntervalSec) return;
        this._lastThunderTailTime = now;

        const dur = Math.max(1.2, Math.min(1.5, duration));
        const extOut = this.getExteriorBus();

        const tailSrc = this.ctx.createBufferSource();
        tailSrc.buffer = noiseBuf;
        const tailFilter = this.ctx.createBiquadFilter();
        tailFilter.type = 'lowpass';
        tailFilter.frequency.setValueAtTime(360, now);
        tailFilter.frequency.exponentialRampToValueAtTime(68, now + dur);

        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.0001, now);
        tailGain.gain.linearRampToValueAtTime(intensity * this.masterVolume, now + 0.035);
        tailGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        tailSrc.connect(tailFilter);
        tailFilter.connect(tailGain);
        tailGain.connect(extOut);
        tailSrc.start(now);
        tailSrc.stop(now + dur + 0.05);
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // Master Dynamics Compressor for clean punch without pumping or clipping
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
            this.compressor.knee.setValueAtTime(14, this.ctx.currentTime);
            this.compressor.ratio.setValueAtTime(3.2, this.ctx.currentTime);
            this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
            this.compressor.release.setValueAtTime(0.16, this.ctx.currentTime);
            this.compressor.connect(this.ctx.destination);
            this.masterOut = this.compressor;

            // Dual-space interior cockpit resonance vs. glass-muffled exterior buses
            this.initAcousticBuses();
            this.rotaryDistortionCurve = this.makeDistortionCurve(26);

            // Generate procedural White, Pink, and Brownian noise buffers
            this.initNoiseBuffers();

            // Fetch and decode pre-rendered neural comms in the background.
            this.loadCommsManifest();

            // Continuous mouse-look torso turret servo synthesizer
            this.initTorsoServo();

            // Continuous rotary minigun spool-up / motor drive synthesizer
            this.initMinigunAudio();

            // Continuous desert sandstorm atmospheric howling wind
            this.startAtmosphereAmbience();

            this.initialized = true;
        } catch (e) {
            console.warn("Web Audio not supported", e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    initNoiseBuffers() {
        if (!this.ctx) return;
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 3; // 3-second seamless loop

        // 1) White Noise Buffer
        this.whiteNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const wData = this.whiteNoiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            wData[i] = Math.random() * 2 - 1;
        }

        // 2) Pink Noise Buffer (Paul Kellet's filter)
        this.pinkNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const pData = this.pinkNoiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
            b6 = white * 0.115926;
        }

        // 3) Brownian Noise Buffer (integrated low-frequency rumble)
        this.brownNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const brData = this.brownNoiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            brData[i] = lastOut * 3.5;
        }
    }

    initTorsoServo() {
        if (!this.ctx) return;
        try {
            // Subtle pressurized hydraulic air-swish (no harsh sawtooth mosquito whine)
            this.servoOsc = this.ctx.createOscillator();
            this.servoFilter = this.ctx.createBiquadFilter();
            this.servoGain = this.ctx.createGain();

            this.servoOsc.type = 'sine';
            this.servoOsc.frequency.setValueAtTime(95, this.ctx.currentTime);

            this.servoFilter.type = 'lowpass';
            this.servoFilter.frequency.setValueAtTime(220, this.ctx.currentTime);
            this.servoFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);

            this.servoGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

            this.servoOsc.connect(this.servoFilter);
            this.servoFilter.connect(this.servoGain);
            this.servoGain.connect(this.getInteriorBus ? this.getInteriorBus() : (this.masterOut || this.ctx.destination));

            this.servoOsc.start();
        } catch (e) {
            console.warn("Servo audio failed", e);
        }
    }

    updateTorsoServo(turnRate) {
        if (!this.ctx || !this.servoGain || this.muted) return;
        const now = this.ctx.currentTime;
        const rate = Math.max(0, Math.min(turnRate || 0, 8.0));
        if (rate > 0.12) {
            const targetFreq = 85 + (rate / 6.0) * 75;
            const targetGain = Math.min(0.035, (rate / 6.0) * 0.03) * this.masterVolume;
            this.servoOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
            this.servoFilter.frequency.setTargetAtTime(targetFreq * 2.0, now, 0.05);
            this.servoGain.gain.setTargetAtTime(targetGain, now, 0.05);
        } else {
            this.servoGain.gain.setTargetAtTime(0.0001, now, 0.08);
        }
    }

    initMinigunAudio() {
        if (!this.ctx || this.minigunAudioInitialized) return;
        try {
            // Continuous Electric Drive Motor + Mechanical Bearing/Rotor Whirr
            this.minigunMotorOsc = this.ctx.createOscillator();
            this.minigunGearOsc = this.ctx.createOscillator();
            this.minigunMotorFilter = this.ctx.createBiquadFilter();
            this.minigunMotorGain = this.ctx.createGain();

            // Smooth electric servo drive hum (triangle avoids harsh synth buzz)
            this.minigunMotorOsc.type = 'triangle';
            this.minigunMotorOsc.frequency.setValueAtTime(95, this.ctx.currentTime);

            // Secondary armature whine (2x harmonic)
            this.minigunGearOsc.type = 'sine';
            this.minigunGearOsc.frequency.setValueAtTime(190, this.ctx.currentTime);

            // Smooth motor casing filter (low Q for natural electric hum)
            this.minigunMotorFilter.type = 'bandpass';
            this.minigunMotorFilter.frequency.setValueAtTime(220, this.ctx.currentTime);
            this.minigunMotorFilter.Q.setValueAtTime(1.4, this.ctx.currentTime);

            this.minigunMotorGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

            const gearGain = this.ctx.createGain();
            gearGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
            this.minigunGearOsc.connect(gearGain);
            gearGain.connect(this.minigunMotorFilter);

            this.minigunMotorOsc.connect(this.minigunMotorFilter);
            this.minigunMotorFilter.connect(this.minigunMotorGain);
            this.minigunMotorGain.connect(this.masterOut || this.ctx.destination);

            // Mechanical barrel-cluster bearing & air-chop noise layer
            if (this.pinkNoiseBuffer) {
                this.minigunWhirrSrc = this.ctx.createBufferSource();
                this.minigunWhirrSrc.buffer = this.pinkNoiseBuffer;
                this.minigunWhirrSrc.loop = true;
                this.minigunWhirrFilter = this.ctx.createBiquadFilter();
                this.minigunWhirrFilter.type = 'bandpass';
                this.minigunWhirrFilter.frequency.setValueAtTime(420, this.ctx.currentTime);
                this.minigunWhirrFilter.Q.setValueAtTime(2.2, this.ctx.currentTime);
                this.minigunWhirrGain = this.ctx.createGain();
                this.minigunWhirrGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
                this.minigunWhirrSrc.connect(this.minigunWhirrFilter);
                this.minigunWhirrFilter.connect(this.minigunWhirrGain);
                this.minigunWhirrGain.connect(this.getInteriorBus ? this.getInteriorBus() : (this.masterOut || this.ctx.destination));
                this.minigunWhirrSrc.start();
            }

            this.minigunMotorOsc.start();
            this.minigunGearOsc.start();
            this.minigunAudioInitialized = true;
        } catch (e) {
            console.warn("Minigun motor audio init error", e);
        }
    }

    updateMinigunSpin(spinSpeed, isFiring, isEvolved = false) {
        if (!this.ctx || this.muted) return;
        if (!this.minigunAudioInitialized) {
            this.initMinigunAudio();
            if (!this.minigunAudioInitialized) return;
        }

        const now = this.ctx.currentTime;
        const speed = Math.max(0, Math.min(1.0, spinSpeed || 0));

        if (speed > 0.03) {
            const maxFreq = isEvolved ? 380 : 320;
            const motorFreq = 95 + Math.pow(speed, 1.15) * (maxFreq - 95);
            const filterFreq = motorFreq * 1.45;

            // Keep mechanical cycling hum ultra-subtle so 120mm rifle shots remain crisp
            const baseGain = isFiring ? 0.02 : 0.035;
            const targetGain = speed * baseGain * this.masterVolume;

            this.minigunMotorOsc.frequency.setTargetAtTime(motorFreq, now, 0.035);
            this.minigunGearOsc.frequency.setTargetAtTime(motorFreq * 2.0, now, 0.035);
            this.minigunMotorFilter.frequency.setTargetAtTime(filterFreq, now, 0.035);
            this.minigunMotorGain.gain.setTargetAtTime(targetGain, now, 0.035);

            if (this.minigunWhirrFilter && this.minigunWhirrGain) {
                this.minigunWhirrFilter.frequency.setTargetAtTime(420 + speed * 1280, now, 0.04);
                this.minigunWhirrGain.gain.setTargetAtTime(speed * (isFiring ? 0.09 : 0.22) * this.masterVolume, now, 0.04);
            }
        } else {
            // Spin down to idle silence
            this.minigunMotorOsc.frequency.setTargetAtTime(95, now, 0.08);
            this.minigunGearOsc.frequency.setTargetAtTime(190, now, 0.08);
            this.minigunMotorGain.gain.setTargetAtTime(0.0001, now, 0.08);
            if (this.minigunWhirrGain) {
                this.minigunWhirrGain.gain.setTargetAtTime(0.0001, now, 0.08);
            }
        }
    }

    startAtmosphereAmbience() {
        if (!this.ctx || this.atmosphereRunning) return;
        try {
            // Subtle distant desert storm low rumble
            if (this.brownNoiseBuffer) {
                const brownSrc = this.ctx.createBufferSource();
                brownSrc.buffer = this.brownNoiseBuffer;
                brownSrc.loop = true;
                const bFilter = this.ctx.createBiquadFilter();
                bFilter.type = 'lowpass';
                bFilter.frequency.setValueAtTime(115, this.ctx.currentTime);
                const bGain = this.ctx.createGain();
                this.brownAmbienceBase = 0.07 * this.masterVolume;
                this.brownAmbienceGain = bGain;
                bGain.gain.setValueAtTime(this.brownAmbienceBase, this.ctx.currentTime);
                brownSrc.connect(bFilter);
                bFilter.connect(bGain);
                bGain.connect(this.getExteriorBus());
                brownSrc.start();
            }

            // Soft non-fatiguing Martian breeze (low Q so it never whistles)
            if (this.pinkNoiseBuffer) {
                const pinkSrc = this.ctx.createBufferSource();
                pinkSrc.buffer = this.pinkNoiseBuffer;
                pinkSrc.loop = true;
                const windFilter = this.ctx.createBiquadFilter();
                windFilter.type = 'bandpass';
                windFilter.frequency.setValueAtTime(280, this.ctx.currentTime);
                windFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

                const windGain = this.ctx.createGain();
                this.windAmbienceBase = 0.045 * this.masterVolume;
                this.windAmbienceGain = windGain;
                windGain.gain.setValueAtTime(this.windAmbienceBase, this.ctx.currentTime);

                pinkSrc.connect(windFilter);
                windFilter.connect(windGain);
                windGain.connect(this.getExteriorBus());
                pinkSrc.start();

                // Slow sinusoidal LFO modulating howling wind frequency
                const lfo = this.ctx.createOscillator();
                const lfoGain = this.ctx.createGain();
                lfo.frequency.setValueAtTime(0.18, this.ctx.currentTime); // ~5.5s swell
                lfoGain.gain.setValueAtTime(220, this.ctx.currentTime);
                lfo.connect(lfoGain);
                lfoGain.connect(windFilter.frequency);
                lfo.start();
            }

            this.atmosphereRunning = true;
        } catch (e) {
            console.warn("Atmosphere ambience init error", e);
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.muted && typeof window !== 'undefined' && window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        return this.muted;
    }

    toggleBgm() {
        this.bgmMuted = !this.bgmMuted;
        if (this.bgmMuted) {
            this.stopBgm();
        } else {
            this.startBgm();
        }
        return !this.bgmMuted;
    }

    // Warm Atmospheric Dark-Ambient Pad & Sub-Pulse (no jittery setInterval hi-hat spam)
    startBgm() {
        if (this.bgmMuted) return;
        if (!this.ctx && typeof this.init === 'function') this.init();
        if (!this.ctx || this.bgmPlaying) return;
        this.resume();
        this.bgmPlaying = true;
        this.bgmStep = 0;

        // D-Minor / Phrygian heavy mech-combat progression (4 bars x 16 steps)
        const progressions = [
            { root: 73.42, pad: [73.42, 110.00, 146.83, 174.61], arp: [293.66, 349.23, 440.00, 523.25] }, // Dm
            { root: 65.41, pad: [65.41, 98.00,  130.81, 164.81], arp: [261.63, 329.63, 392.00, 493.88] }, // C/G
            { root: 58.27, pad: [58.27, 87.31,  116.54, 146.83], arp: [233.08, 293.66, 349.23, 466.16] }, // Bbmaj7
            { root: 55.00, pad: [55.00, 82.41,  110.00, 138.59], arp: [220.00, 277.18, 329.63, 440.00] }  // A7sus/Phrygian
        ];

        const playBass = (freq, time, accent) => {
            const out = this.masterOut || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const sub = this.ctx.createOscillator();
            const filt = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();
            osc.type = 'sawtooth';
            sub.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time);
            sub.frequency.setValueAtTime(freq * 0.5, time);

            filt.type = 'lowpass';
            filt.Q.setValueAtTime(3.2, time);
            filt.frequency.setValueAtTime(accent ? 540 : 340, time);
            filt.frequency.exponentialRampToValueAtTime(140, time + 0.14);

            const peak = (accent ? 0.24 : 0.16) * this.bgmVolume;
            g.gain.setValueAtTime(0.0001, time);
            g.gain.linearRampToValueAtTime(peak, time + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

            osc.connect(filt);
            sub.connect(filt);
            filt.connect(g);
            g.connect(out);
            osc.start(time);
            sub.start(time);
            osc.stop(time + 0.16);
            sub.stop(time + 0.16);
        };

        const playSnare = (time) => {
            const out = this.masterOut || this.ctx.destination;
            if (this.noiseBuffer) {
                const src = this.ctx.createBufferSource();
                src.buffer = this.noiseBuffer;
                const filt = this.ctx.createBiquadFilter();
                filt.type = 'bandpass';
                filt.frequency.setValueAtTime(1850, time);
                filt.Q.setValueAtTime(1.1, time);
                const g = this.ctx.createGain();
                g.gain.setValueAtTime(0.001, time);
                g.gain.linearRampToValueAtTime(0.24 * this.bgmVolume, time + 0.003);
                g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
                src.connect(filt);
                filt.connect(g);
                g.connect(out);
                const off = Math.random() * Math.max(0.01, (this.noiseBuffer.duration || 1) - 0.2);
                src.start(time, off, 0.15);
            }
            const body = this.ctx.createOscillator();
            const bg = this.ctx.createGain();
            body.type = 'triangle';
            body.frequency.setValueAtTime(185, time);
            body.frequency.exponentialRampToValueAtTime(95, time + 0.08);
            bg.gain.setValueAtTime(0.18 * this.bgmVolume, time);
            bg.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
            body.connect(bg);
            bg.connect(out);
            body.start(time);
            body.stop(time + 0.1);
        };

        const playArp = (freq, time) => {
            const out = this.masterOut || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const filt = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, time);
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(1450, time);
            filt.frequency.exponentialRampToValueAtTime(420, time + 0.18);

            g.gain.setValueAtTime(0.0001, time);
            g.gain.linearRampToValueAtTime(0.075 * this.bgmVolume, time + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

            osc.connect(filt);
            filt.connect(g);
            g.connect(out);
            osc.start(time);
            osc.stop(time + 0.23);
        };

        const playPad = (padNotes, time) => {
            const out = this.masterOut || this.ctx.destination;
            padNotes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const filt = this.ctx.createBiquadFilter();
                const g = this.ctx.createGain();
                osc.type = idx === 0 ? 'sine' : 'triangle';
                osc.frequency.setValueAtTime(freq * (idx % 2 === 0 ? 1 : 1.003), time);
                filt.type = 'lowpass';
                filt.frequency.setValueAtTime(520, time);
                filt.frequency.linearRampToValueAtTime(280, time + 2.1);

                const peak = (idx === 0 ? 0.16 : 0.07) * this.bgmVolume;
                g.gain.setValueAtTime(0.0001, time);
                g.gain.linearRampToValueAtTime(peak, time + 0.35);
                g.gain.exponentialRampToValueAtTime(0.0001, time + 2.25);

                osc.connect(filt);
                filt.connect(g);
                g.connect(out);
                osc.start(time);
                osc.stop(time + 2.3);
            });
        };

        const stepMs = 140; // ~107 BPM 16th-note pulse
        const tickStep = () => {
            if (!this.bgmPlaying || this.bgmMuted || this.muted || !this.ctx) return;
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            const now = this.ctx.currentTime + 0.02;
            const stepInBar = this.bgmStep % 16;
            const barIdx = Math.floor(this.bgmStep / 16) % progressions.length;
            const prog = progressions[barIdx];

            if (stepInBar === 0) {
                playPad(prog.pad, now);
            }
            // Driving mech-combat drum groove
            if (stepInBar === 0 || stepInBar === 4 || stepInBar === 8 || stepInBar === 10 || stepInBar === 12) {
                this.playKick(now);
            }
            if (stepInBar === 4 || stepInBar === 12) {
                playSnare(now);
            }
            if (stepInBar % 2 === 0 || stepInBar === 15) {
                this.playHiHat(now);
            }
            // Driving 8th-note industrial saw/sub bass
            if (stepInBar % 2 === 0) {
                const octaveJump = (stepInBar === 6 || stepInBar === 14) ? 2 : 1;
                playBass(prog.root * octaveJump, now, stepInBar % 4 === 0);
            }
            // Dark synth arpeggio melody
            if (stepInBar % 2 === 0) {
                const arpIdx = (stepInBar / 2 + barIdx) % prog.arp.length;
                playArp(prog.arp[arpIdx], now);
            }

            this.bgmStep++;
        };

        tickStep();
        this.bgmInterval = setInterval(tickStep, stepMs);
    }

    playKick(time) {
        if (!this.ctx) return;
        const out = this.masterOut || this.ctx.destination;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(92, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.16);

        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.42 * this.bgmVolume, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

        osc.connect(gain);
        gain.connect(out);

        osc.start(time);
        osc.stop(time + 0.19);
    }

    playHiHat(time) {
        if (!this.ctx) return;
        const out = this.masterOut || this.ctx.destination;
        if (this.noiseBuffer) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6200, time);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.001, time);
            gain.gain.linearRampToValueAtTime(0.09 * this.bgmVolume, time + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

            src.connect(filter);
            filter.connect(gain);
            gain.connect(out);
            const off = Math.random() * Math.max(0.01, (this.noiseBuffer.duration || 1) - 0.1);
            src.start(time, off, 0.05);
        }
    }

    stopBgm() {
        this.bgmPlaying = false;
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }

    // Helper: standard oscillator tone
    playTone(freq, type, duration, gainStart = 0.2, gainEnd = 0.001) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(gainStart * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(gainEnd, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }

    // Multi-Layer Industrial Heavy Cannon Synthesizer
    playHeavyCannon(isEvolved = false, heatLevel = 0) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        // Layer 1: Sub-Bass Chest Thump (heavy kinetic recoil impulse)
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        const startFreq = isEvolved ? 105 : 88;
        subOsc.frequency.setValueAtTime(startFreq, now);
        subOsc.frequency.exponentialRampToValueAtTime(24, now + (isEvolved ? 0.14 : 0.22));

        subGain.gain.setValueAtTime(0.55 * this.masterVolume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + (isEvolved ? 0.14 : 0.22));
        subOsc.connect(subGain);
        subGain.connect(out);
        subOsc.start(now);
        subOsc.stop(now + 0.24);

        // Layer 2: Mechanical Breech Slap (supersonic steel slap)
        if (this.pinkNoiseBuffer) {
            const breechSrc = this.ctx.createBufferSource();
            breechSrc.buffer = this.pinkNoiseBuffer;
            const breechFilter = this.ctx.createBiquadFilter();
            breechFilter.type = 'bandpass';
            breechFilter.frequency.setValueAtTime(2200, now);
            breechFilter.Q.setValueAtTime(4.0, now);
            const breechGain = this.ctx.createGain();
            breechGain.gain.setValueAtTime(0.42 * this.masterVolume, now);
            breechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
            breechSrc.connect(breechFilter);
            breechFilter.connect(breechGain);
            breechGain.connect(out);
            breechSrc.start(now);
            breechSrc.stop(now + 0.04);
        }

        // Layer 3: Powder Blast Body (deep expanding combustion rumble)
        if (this.brownNoiseBuffer) {
            const blastSrc = this.ctx.createBufferSource();
            blastSrc.buffer = this.brownNoiseBuffer;
            const blastFilter = this.ctx.createBiquadFilter();
            blastFilter.type = 'lowpass';
            blastFilter.frequency.setValueAtTime(380, now);
            blastFilter.frequency.exponentialRampToValueAtTime(80, now + 0.28);
            const blastGain = this.ctx.createGain();
            blastGain.gain.setValueAtTime(0.38 * this.masterVolume, now);
            blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
            blastSrc.connect(blastFilter);
            blastFilter.connect(blastGain);
            blastGain.connect(out);
            blastSrc.start(now);
            blastSrc.stop(now + 0.35);
        }

        // Layer 4: Cycling Bolt Slam & Brass Extraction Clink (delayed)
        const boltDelay = isEvolved ? 0.04 : 0.09;
        const boltOsc = this.ctx.createOscillator();
        const boltGain = this.ctx.createGain();
        boltOsc.type = 'triangle';
        boltOsc.frequency.setValueAtTime(3200, now + boltDelay);
        boltOsc.frequency.exponentialRampToValueAtTime(1400, now + boltDelay + 0.05);
        boltGain.gain.setValueAtTime(0.0001, now);
        boltGain.gain.setValueAtTime(0.24 * this.masterVolume, now + boltDelay);
        boltGain.gain.exponentialRampToValueAtTime(0.001, now + boltDelay + 0.06);
        boltOsc.connect(boltGain);
        boltGain.connect(out);
        boltOsc.start(now + boltDelay);
        boltOsc.stop(now + boltDelay + 0.07);
    }

    playAutocannon(isEvolved = false) {
        this.playMinigunShot(isEvolved, 0);
    }

    // 120mm Drum Magazine Reload: Eject Clack -> Drum Slam -> Heavy Bolt Rack
    playRifleReload() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const clack = (t, freq, dur, vol) => {
            if (!this.noiseBuffer) return;
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(freq, t);
            bp.Q.setValueAtTime(3.0, t);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(vol * this.masterVolume, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            src.connect(bp);
            bp.connect(g);
            g.connect(intOut);
            src.start(t, Math.random() * 0.3, dur + 0.01);
        };
        // Stage 1: Mag release latch
        clack(now + 0.05, 1950, 0.045, 0.24);
        // Stage 2: Heavy drum slam into receiver
        clack(now + 0.65, 540, 0.09, 0.38);
        // Stage 3: Charging handle bolt rack
        clack(now + 1.05, 1450, 0.06, 0.28);
        clack(now + 1.15, 2200, 0.05, 0.25);
    }

    // Heavy Thermal Cleaver Slash: Molten Plasma Arc + Steel Whoosh
    playCleaverSlash() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();

        if (this.pinkNoiseBuffer) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.pinkNoiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(1600, now);
            bp.frequency.exponentialRampToValueAtTime(320, now + 0.24);
            bp.Q.setValueAtTime(1.8, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.44 * this.masterVolume, now + 0.015);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
            src.connect(bp);
            bp.connect(g);
            g.connect(extOut);
            src.start(now, Math.random() * 0.3, 0.28);
        }

        const ring = this.ctx.createOscillator();
        const rg = this.ctx.createGain();
        ring.type = 'triangle';
        ring.frequency.setValueAtTime(420, now);
        ring.frequency.exponentialRampToValueAtTime(160, now + 0.22);
        rg.gain.setValueAtTime(0.001, now);
        rg.gain.linearRampToValueAtTime(0.22 * this.masterVolume, now + 0.005);
        rg.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
        ring.connect(rg);
        rg.connect(intOut);
        ring.start(now);
        ring.stop(now + 0.24);
    }

    // 37mm Patlabor-Style Hand-Cannon Boom + Revolver Cylinder Click
    playPistol37Shot() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const extOut = this.getExteriorBus();
        const intOut = this.getInteriorBus();

        const sub = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(145, now);
        sub.frequency.exponentialRampToValueAtTime(28, now + 0.17);
        sg.gain.setValueAtTime(0.001, now);
        sg.gain.linearRampToValueAtTime(1.35 * this.masterVolume, now + 0.003);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        sub.connect(sg);
        sg.connect(extOut);
        sub.start(now);
        sub.stop(now + 0.19);

        if (this.noiseBuffer) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'bandpass';
            lp.frequency.setValueAtTime(1450, now);
            lp.Q.setValueAtTime(0.75, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(1.20 * this.masterVolume, now + 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            src.connect(lp);
            lp.connect(g);
            g.connect(extOut);
            src.start(now, Math.random() * 0.3, 0.1);
        }

        if (this.pinkNoiseBuffer) {
            const cyc = this.ctx.createBufferSource();
            cyc.buffer = this.pinkNoiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(2800, now + 0.06);
            bp.Q.setValueAtTime(4.0, now + 0.06);
            const cg = this.ctx.createGain();
            cg.gain.setValueAtTime(0.001, now + 0.06);
            cg.gain.linearRampToValueAtTime(0.24 * this.masterVolume, now + 0.063);
            cg.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
            cyc.connect(bp);
            bp.connect(cg);
            cg.connect(intOut);
            cyc.start(now + 0.06, Math.random() * 0.3, 0.04);
        }
    }

    // Multi-Layer Browning M1919A4 Heavy Machine Gun Synthesizer (Dual-Space)
    playMinigunShot(isEvolved = false, heatLevel = 0) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();

        // Subtle organic round-to-round variation
        const pitchJit = 0.93 + Math.random() * 0.14;
        const filterJit = 0.88 + Math.random() * 0.24;
        const heatRatio = Math.max(0, Math.min(1, heatLevel || 0));

        // Sub-bass Air-Pressure Ducking: briefly compress ambient desert wind during sustained bursts
        if ((now - this._lastWindDuckTime) >= 0.06) {
            this._lastWindDuckTime = now;
            if (this.windAmbienceGain && this.windAmbienceGain.gain) {
                const wg = this.windAmbienceGain.gain;
                const wBase = this.windAmbienceBase || (0.18 * this.masterVolume);
                if (typeof wg.cancelScheduledValues === 'function') wg.cancelScheduledValues(now);
                if (typeof wg.setTargetAtTime === 'function') {
                    wg.setTargetAtTime(wBase * 0.42, now, 0.014);
                    wg.setTargetAtTime(wBase, now + 0.08, 0.16);
                } else {
                    wg.setValueAtTime(wBase * 0.42, now);
                }
            }
            if (this.brownAmbienceGain && this.brownAmbienceGain.gain) {
                const bg = this.brownAmbienceGain.gain;
                const bBase = this.brownAmbienceBase || (0.24 * this.masterVolume);
                if (typeof bg.cancelScheduledValues === 'function') bg.cancelScheduledValues(now);
                if (typeof bg.setTargetAtTime === 'function') {
                    bg.setTargetAtTime(bBase * 0.58, now, 0.016);
                    bg.setTargetAtTime(bBase, now + 0.08, 0.16);
                } else {
                    bg.setValueAtTime(bBase * 0.58, now);
                }
            }
        }

        // Layer 1 (Exterior): Heavy Sub-Bass + Warm Mid-Punch Chest Thump
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime((isEvolved ? 138 : 122) * pitchJit, now);
        subOsc.frequency.exponentialRampToValueAtTime(32 * pitchJit, now + 0.105);
        subGain.gain.setValueAtTime(0.001, now);
        subGain.gain.linearRampToValueAtTime(1.15 * this.masterVolume, now + 0.003);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        subOsc.connect(subGain);
        subGain.connect(extOut);
        subOsc.start(now);
        subOsc.stop(now + 0.115);

        const bodyOsc = this.ctx.createOscillator();
        const bodyGain = this.ctx.createGain();
        bodyOsc.type = 'triangle';
        bodyOsc.frequency.setValueAtTime(165 * pitchJit, now);
        bodyOsc.frequency.exponentialRampToValueAtTime(48 * pitchJit, now + 0.07);
        bodyGain.gain.setValueAtTime(0.001, now);
        bodyGain.gain.linearRampToValueAtTime(0.55 * this.masterVolume, now + 0.003);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
        bodyOsc.connect(bodyGain);
        bodyGain.connect(extOut);
        bodyOsc.start(now);
        bodyOsc.stop(now + 0.08);

        // Layer 2 (Exterior): Warm Ballistic Transient Snap
        if (this.noiseBuffer) {
            const crackSrc = this.ctx.createBufferSource();
            crackSrc.buffer = this.noiseBuffer;
            const crackFilter = this.ctx.createBiquadFilter();
            crackFilter.type = 'bandpass';
            crackFilter.frequency.setValueAtTime((isEvolved ? 1220 : 980) * filterJit + heatRatio * 140, now);
            crackFilter.Q.setValueAtTime(0.65, now);

            const crackGain = this.ctx.createGain();
            crackGain.gain.setValueAtTime(0.001, now);
            crackGain.gain.linearRampToValueAtTime(0.95 * this.masterVolume, now + 0.002);
            crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

            crackSrc.connect(crackFilter);
            crackFilter.connect(crackGain);
            crackGain.connect(extOut);
            const crackOff = Math.random() * Math.max(0.01, (this.noiseBuffer.duration || 1) - 0.1);
            crackSrc.start(now, crackOff, 0.058);
        }

        // Layer 3 (Exterior): Muzzle Blast Body + Canyon Echo Tail
        if (this.brownNoiseBuffer) {
            const blastSrc = this.ctx.createBufferSource();
            blastSrc.buffer = this.brownNoiseBuffer;
            const blastFilter = this.ctx.createBiquadFilter();
            blastFilter.type = 'lowpass';
            blastFilter.frequency.setValueAtTime((isEvolved ? 720 : 620) * filterJit + heatRatio * 90, now);
            blastFilter.frequency.exponentialRampToValueAtTime(105, now + 0.14);

            const blastGain = this.ctx.createGain();
            blastGain.gain.setValueAtTime(0.001, now);
            blastGain.gain.linearRampToValueAtTime(0.92 * this.masterVolume, now + 0.003);
            blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

            blastSrc.connect(blastFilter);
            blastFilter.connect(blastGain);
            blastGain.connect(extOut);
            const blastOff = Math.random() * Math.max(0.01, (this.brownNoiseBuffer.duration || 1) - 0.15);
            blastSrc.start(now, blastOff, 0.14);

            this.triggerDesertThunderTail(isEvolved ? 0.52 : 0.44, 1.55, 0.18);
        }

        // Layer 4 (Interior): Heavy Steel Bolt-Carrier Recoil & Belt-Feed Clack
        if (this.pinkNoiseBuffer) {
            const boltTime = now + 0.028;
            const breechSrc = this.ctx.createBufferSource();
            breechSrc.buffer = this.pinkNoiseBuffer;
            const breechFilter = this.ctx.createBiquadFilter();
            breechFilter.type = 'bandpass';
            breechFilter.frequency.setValueAtTime((isEvolved ? 1850 : 1580) * filterJit, boltTime);
            breechFilter.Q.setValueAtTime(2.8, boltTime);

            const breechGain = this.ctx.createGain();
            breechGain.gain.setValueAtTime(0.001, now);
            breechGain.gain.setValueAtTime(0.001, boltTime);
            breechGain.gain.linearRampToValueAtTime(0.48 * this.masterVolume, boltTime + 0.002);
            breechGain.gain.exponentialRampToValueAtTime(0.001, boltTime + 0.026);

            breechSrc.connect(breechFilter);
            breechFilter.connect(breechGain);
            breechGain.connect(intOut);
            const breechOff = Math.random() * Math.max(0.01, (this.pinkNoiseBuffer.duration || 1) - 0.1);
            breechSrc.start(boltTime, breechOff, 0.03);
        }

        const mechOsc = this.ctx.createOscillator();
        const mechGain = this.ctx.createGain();
        mechOsc.type = 'triangle';
        mechOsc.frequency.setValueAtTime(195 * pitchJit, now);
        mechOsc.frequency.exponentialRampToValueAtTime(68 * pitchJit, now + 0.032);
        mechGain.gain.setValueAtTime(0.001, now);
        mechGain.gain.linearRampToValueAtTime(0.38 * this.masterVolume, now + 0.002);
        mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
        mechOsc.connect(mechGain);
        mechGain.connect(intOut);
        mechOsc.start(now);
        mechOsc.stop(now + 0.018);

        // Layer 5: Spent Casing Ejection Clatter on cockpit bulkhead
        if (Math.random() < 0.42 && this.playCasingImpact) {
            setTimeout(() => this.playCasingImpact(), 14 + Math.random() * 24);
        }
    }

    // High-Pressure Hydraulic Claw Melee Impact
    playClawMelee() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        // 1) Hydraulic pneumatic hiss exhaust
        if (this.pinkNoiseBuffer) {
            const hissSrc = this.ctx.createBufferSource();
            hissSrc.buffer = this.pinkNoiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2400, now);
            filter.frequency.exponentialRampToValueAtTime(500, now + 0.22);
            filter.Q.setValueAtTime(2.5, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35 * this.masterVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
            hissSrc.connect(filter);
            filter.connect(gain);
            gain.connect(out);
            hissSrc.start(now);
            hissSrc.stop(now + 0.25);
        }

        // 2) Heavy metal pincer clamp clang
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);
        g.gain.setValueAtTime(0.45 * this.masterVolume, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(g);
        g.connect(out);
        osc.start(now);
        osc.stop(now + 0.16);
    }

    // Sub-Bass Mech Seismic Stomp Ground Shock
    playMechStomp() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        // 1) Sub-bass tectonic rumble
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(75, now);
        subOsc.frequency.exponentialRampToValueAtTime(18, now + 0.45);
        subGain.gain.setValueAtTime(0.65 * this.masterVolume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
        subOsc.connect(subGain);
        subGain.connect(out);
        subOsc.start(now);
        subOsc.stop(now + 0.48);

        // 2) Bedrock shatter crunch
        if (this.pinkNoiseBuffer) {
            const crunchSrc = this.ctx.createBufferSource();
            crunchSrc.buffer = this.pinkNoiseBuffer;
            const crunchFilter = this.ctx.createBiquadFilter();
            crunchFilter.type = 'lowpass';
            crunchFilter.frequency.setValueAtTime(260, now);
            crunchFilter.Q.setValueAtTime(2.2, now);
            const crunchGain = this.ctx.createGain();
            crunchGain.gain.setValueAtTime(0.50 * this.masterVolume, now);
            crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            crunchSrc.connect(crunchFilter);
            crunchFilter.connect(crunchGain);
            crunchGain.connect(out);
            crunchSrc.start(now);
            crunchSrc.stop(now + 0.36);
        }
    }

    // Arc Tesla Zap (crackling frequency mod)
    playTesla(isEvolved = false) {
        if (!this.canPlayVoice('tesla', 0.07, 0.22)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const dur = isEvolved ? 0.22 : 0.12;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(isEvolved ? 880 : 600, now);
        osc.frequency.linearRampToValueAtTime(isEvolved ? 200 : 120, now + dur);

        gain.gain.setValueAtTime(0.2 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + dur);
    }

    // Thermite / Fire Vent whoosh
    playThermite() {
        if (!this.canPlayVoice('thermite', 0.08, 0.35)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.35);

        gain.gain.setValueAtTime(0.3 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    // Orbital Rail-Strike / Hammer of Dawn (heavy atmospheric crack + sub-bass boom)
    playOrbitalStrike(isEvolved = false) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const dur = isEvolved ? 0.55 : 0.4;
        const extOut = this.getExteriorBus();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isEvolved ? 220 : 180, now);
        osc.frequency.exponentialRampToValueAtTime(34, now + dur);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.45 * this.masterVolume, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(extOut);
        osc.start(now);
        osc.stop(now + dur + 0.02);

        if (this.noiseBuffer) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(2400, now);
            lp.frequency.exponentialRampToValueAtTime(260, now + dur);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.001, now);
            nGain.gain.linearRampToValueAtTime(0.42 * this.masterVolume, now + 0.004);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            src.connect(lp);
            lp.connect(nGain);
            nGain.connect(extOut);
            src.start(now, Math.random() * 0.3, dur);
        }

        // Sub bass thump
        this.playExplosion(true);
    }

    // Missile launch (pressurized rocket ignition whoosh, no arcade sawtooth chirp)
    playMissileLaunch() {
        if (!this.canPlayVoice('missile', 0.07, 0.18)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const extOut = this.getExteriorBus();

        if (this.brownNoiseBuffer) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.brownNoiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(360, now);
            bp.frequency.exponentialRampToValueAtTime(1450, now + 0.18);
            bp.Q.setValueAtTime(1.4, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.28 * this.masterVolume, now + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            src.connect(bp);
            bp.connect(gain);
            gain.connect(extOut);
            src.start(now, Math.random() * 0.3, 0.24);
        }
    }

    // Exterior Explosion -> clean sub-drop + filtered blast noise + canyon thunder tail
    playExplosion(heavy = false) {
        if (!this.canPlayVoice(heavy ? 'explosion_heavy' : 'explosion', heavy ? 0.08 : 0.06, heavy ? 0.52 : 0.28)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const dur = heavy ? 0.52 : 0.28;
        const extOut = this.getExteriorBus();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(heavy ? 88 : 115, now);
        osc.frequency.exponentialRampToValueAtTime(22, now + dur);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime((heavy ? 0.56 : 0.34) * this.masterVolume, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(extOut);
        osc.start(now);
        osc.stop(now + dur + 0.02);

        if (this.brownNoiseBuffer) {
            const bSrc = this.ctx.createBufferSource();
            bSrc.buffer = this.brownNoiseBuffer;
            const bFilt = this.ctx.createBiquadFilter();
            bFilt.type = 'lowpass';
            bFilt.frequency.setValueAtTime(heavy ? 780 : 620, now);
            bFilt.frequency.exponentialRampToValueAtTime(95, now + dur);
            const bGain = this.ctx.createGain();
            bGain.gain.setValueAtTime(0.001, now);
            bGain.gain.linearRampToValueAtTime((heavy ? 0.55 : 0.36) * this.masterVolume, now + 0.005);
            bGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            bSrc.connect(bFilt);
            bFilt.connect(bGain);
            bGain.connect(extOut);
            bSrc.start(now, Math.random() * 0.2, dur + 0.03);
        }

        this.triggerDesertThunderTail(heavy ? 0.42 : 0.24, heavy ? 1.48 : 1.24, 0.35);
    }

    // Thruster Dash whoosh
    playDash() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.22);

        gain.gain.setValueAtTime(0.35 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
    }

    // Magnetized scrap intake clank (dry metallic hopper latch, zero synth tone)
    playPickup() {
        if (!this.canPlayVoice('pickup', 0.05, 0.08)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        if (this.noiseBuffer) {
            const clink = this.ctx.createBufferSource();
            clink.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(2200 + Math.random() * 900, now);
            bp.Q.setValueAtTime(4.5, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.085 * this.masterVolume, now + 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
            clink.connect(bp);
            bp.connect(g);
            g.connect(intOut);
            clink.start(now, Math.random() * 0.4, 0.022);
        }

        if (this.brownNoiseBuffer) {
            const thud = this.ctx.createBufferSource();
            thud.buffer = this.brownNoiseBuffer;
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'bandpass';
            lp.frequency.setValueAtTime(240 + Math.random() * 60, now);
            lp.Q.setValueAtTime(1.5, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.11 * this.masterVolume, now + 0.002);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.026);
            thud.connect(lp);
            lp.connect(g);
            g.connect(intOut);
            thud.start(now, Math.random() * 0.4, 0.03);
        }
    }

    // Mech refit / reactor power-up chord (warm lowpass tactical lock-in)
    playLevelUp() {
        if (this.muted || !this.ctx) return;
        const notes = [146.8, 220.0, 293.7];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.42, 0.18, 0.02);
            }, idx * 85);
        });
    }

    // Evolution refit power surge
    playEvolution() {
        if (this.muted || !this.ctx) return;
        const notes = [110.0, 164.8, 220.0, 329.6];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.48, 0.22, 0.025);
            }, idx * 95);
        });
    }

    // Deep industrial klaxon horn (filtered low brass, no raw sawtooth bleep)
    playBossWarning() {
        if (this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        for (let i = 0; i < 2; i++) {
            const t = now + i * 0.58;
            const osc = this.ctx.createOscillator();
            const lp = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(145, t);
            osc.frequency.linearRampToValueAtTime(122, t + 0.36);
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(460, t);
            gain.gain.setValueAtTime(0.001, t);
            gain.gain.linearRampToValueAtTime(0.24 * this.masterVolume, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
            osc.connect(lp);
            lp.connect(gain);
            gain.connect(intOut);
            osc.start(t);
            osc.stop(t + 0.4);
        }
    }

    // Player hurt
    playPlayerHurt() {
        if (!this.canPlayVoice('hurt', 0.12, 0.16)) return;
        this.playTone(130, 'sawtooth', 0.15, 0.4, 0.01);
    }

    // Thermal Sonar Ping (resonant sweep + echo)
    // Deep Aethereal Targeting System Lock-On Chime (Q Micro-Missile Paint & IFF)
    playTargetLock(lockIndex = 1) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();

        // Deep C3-C4 minor/pentatonic harmonic scale (warm, resonant, never shrill)
        const scale = [130.81, 146.83, 164.81, 196.00, 220.00, 261.63];
        const idx = Math.max(0, Math.min(scale.length - 1, (lockIndex || 1) - 1));
        const f0 = scale[idx];

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1450, now);
        filter.frequency.exponentialRampToValueAtTime(360, now + 0.44);
        filter.Q.setValueAtTime(2.2, now);

        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(0.001, now);
        masterGain.gain.linearRampToValueAtTime(0.42 * this.masterVolume, now + 0.014);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

        filter.connect(masterGain);
        masterGain.connect(intOut);

        const reverbSend = this.ctx.createGain();
        reverbSend.gain.setValueAtTime(0.35, now);
        masterGain.connect(reverbSend);
        reverbSend.connect(extOut);

        const voices = [
            { freq: f0 * 0.5, type: 'triangle', gain: 0.45, dur: 0.48 }, // Deep sub-harmonic foundation
            { freq: f0, type: 'sine', gain: 0.60, dur: 0.46 },           // Fundamental body
            { freq: f0 * 1.5, type: 'sine', gain: 0.30, dur: 0.40 },     // Ethereal fifth
            { freq: f0 * 2.004, type: 'sine', gain: 0.16, dur: 0.34 }    // Detuned glass halo
        ];

        for (const v of voices) {
            const osc = this.ctx.createOscillator();
            const vg = this.ctx.createGain();
            osc.type = v.type;
            osc.frequency.setValueAtTime(v.freq, now);
            vg.gain.setValueAtTime(v.gain, now);
            osc.connect(vg);
            vg.connect(filter);
            osc.start(now);
            osc.stop(now + v.dur + 0.02);
        }
    }

    // Deep Aethereal Thermal Sonar Pulse
    playSonarPing() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(980, now);
        filter.frequency.exponentialRampToValueAtTime(220, now + 1.05);
        filter.Q.setValueAtTime(3.0, now);

        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(0.001, now);
        masterGain.gain.linearRampToValueAtTime(0.46 * this.masterVolume, now + 0.024);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

        filter.connect(masterGain);
        masterGain.connect(intOut);
        masterGain.connect(extOut);

        const chord = [
            { fStart: 220.0, fEnd: 146.83, type: 'sine', gain: 0.65 },
            { fStart: 110.0, fEnd: 73.42, type: 'triangle', gain: 0.45 },
            { fStart: 330.0, fEnd: 220.0, type: 'sine', gain: 0.28 },
            { fStart: 441.5, fEnd: 293.66, type: 'sine', gain: 0.14 }
        ];
        for (const c of chord) {
            const osc = this.ctx.createOscillator();
            const vg = this.ctx.createGain();
            osc.type = c.type;
            osc.frequency.setValueAtTime(c.fStart, now);
            osc.frequency.exponentialRampToValueAtTime(c.fEnd, now + 1.05);
            vg.gain.setValueAtTime(c.gain, now);
            osc.connect(vg);
            vg.connect(filter);
            osc.start(now);
            osc.stop(now + 1.18);
        }

        // Deep harmonic echo bloom
        setTimeout(() => {
            if (!this.muted && this.ctx) {
                this.playTargetLock(3);
            }
        }, 320);
    }

    // Interior Cockpit Optical Lens / Servo Focus Whir on ADS Enter/Exit
    playAdsServo(entering = true) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        const osc = this.ctx.createOscillator();
        const bp = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(entering ? 260 : 420, now);
        osc.frequency.exponentialRampToValueAtTime(entering ? 460 : 210, now + 0.085);

        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(entering ? 900 : 650, now);
        bp.Q.setValueAtTime(2.5, now);

        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.11 * this.masterVolume, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

        osc.connect(bp);
        bp.connect(g);
        g.connect(intOut);
        osc.start(now);
        osc.stop(now + 0.105);
    }

    // Quick 180-degree thruster whip-turn
    playTurnThruster() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
        gain.gain.setValueAtTime(0.32 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
    }

    // Rear proximity alert beep (Interior Cockpit Bus)
    playRearBeep() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(860, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.09 * this.masterVolume, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        osc.connect(gain);
        gain.connect(this.getInteriorBus());
        osc.start(now);
        osc.stop(now + 0.07);
    }

    // Two-Beat Pacific Rim Stride Beat 1: Pressurized Hydraulic Lift Servo Strain
    // Two-Beat Heavy Mech Stride Beat 1: Pneumatic Hydraulic Piston Shift (no synth chirp)
    playStrideLiftServo(isLeftFoot = true) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const pMult = isLeftFoot ? 0.96 : 1.04;

        // Subtle pneumatic actuator oil/air hiss inside chassis
        if (this.pinkNoiseBuffer) {
            const hissSrc = this.ctx.createBufferSource();
            hissSrc.buffer = this.pinkNoiseBuffer;
            const hissFilter = this.ctx.createBiquadFilter();
            hissFilter.type = 'bandpass';
            hissFilter.frequency.setValueAtTime(620 * pMult, now);
            hissFilter.frequency.exponentialRampToValueAtTime(880 * pMult, now + 0.14);
            hissFilter.Q.setValueAtTime(2.0, now);
            const hissGain = this.ctx.createGain();
            hissGain.gain.setValueAtTime(0.0001, now);
            hissGain.gain.linearRampToValueAtTime(0.075 * this.masterVolume, now + 0.025);
            hissGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            hissSrc.connect(hissFilter);
            hissFilter.connect(hissGain);
            hissGain.connect(intOut);
            hissSrc.start(now, Math.random() * 0.4, 0.16);
        }

        // Low mechanical joint unlatch thud
        if (this.brownNoiseBuffer) {
            const clunk = this.ctx.createBufferSource();
            clunk.buffer = this.brownNoiseBuffer;
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(340 * pMult, now);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.001, now);
            g.gain.linearRampToValueAtTime(0.11 * this.masterVolume, now + 0.004);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
            clunk.connect(lp);
            lp.connect(g);
            g.connect(intOut);
            clunk.start(now, Math.random() * 0.4, 0.05);
        }
    }

    // Two-Beat Heavy Mech Stride Beat 2: Grounded 3-Stage Footfall Impact
    playMechFootstep(isLeftFoot = true) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();
        const pMult = isLeftFoot ? 0.95 : 1.05;

        // Stage 1 (+0ms Exterior): Heavy Tectonic Ground Thud + Hydraulic Leg Slam
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(64 * pMult, now);
        subOsc.frequency.exponentialRampToValueAtTime(16 * pMult, now + 0.25);
        subGain.gain.setValueAtTime(0.001, now);
        subGain.gain.linearRampToValueAtTime(1.25 * this.masterVolume, now + 0.004);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        subOsc.connect(subGain);
        subGain.connect(extOut);
        subOsc.start(now);
        subOsc.stop(now + 0.28);

        const impactOsc = this.ctx.createOscillator();
        const impactGain = this.ctx.createGain();
        impactOsc.type = 'triangle';
        impactOsc.frequency.setValueAtTime(105 * pMult, now);
        impactOsc.frequency.exponentialRampToValueAtTime(28 * pMult, now + 0.12);
        impactGain.gain.setValueAtTime(0.001, now);
        impactGain.gain.linearRampToValueAtTime(0.65 * this.masterVolume, now + 0.003);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        impactOsc.connect(impactGain);
        impactGain.connect(extOut);
        impactOsc.start(now);
        impactOsc.stop(now + 0.14);

        // Stage 2 (+12ms Exterior): Deep Sand & Gravel Displacement
        if (this.pinkNoiseBuffer) {
            const sandTime = now + 0.012;
            const crunchSrc = this.ctx.createBufferSource();
            crunchSrc.buffer = this.pinkNoiseBuffer;
            const crunchFilter = this.ctx.createBiquadFilter();
            crunchFilter.type = 'bandpass';
            crunchFilter.frequency.setValueAtTime(420 * pMult, sandTime);
            crunchFilter.frequency.exponentialRampToValueAtTime(110 * pMult, sandTime + 0.17);
            crunchFilter.Q.setValueAtTime(1.1, sandTime);
            const crunchGain = this.ctx.createGain();
            crunchGain.gain.setValueAtTime(0.0001, sandTime);
            crunchGain.gain.linearRampToValueAtTime(0.68 * this.masterVolume, sandTime + 0.01);
            crunchGain.gain.exponentialRampToValueAtTime(0.001, sandTime + 0.18);
            crunchSrc.connect(crunchFilter);
            crunchFilter.connect(crunchGain);
            crunchGain.connect(extOut);
            crunchSrc.start(sandTime, Math.random() * 0.4, 0.19);
        }

        // Stage 3 (+42ms Interior): Heavy Steel Chassis Suspension Settle
        if (this.brownNoiseBuffer) {
            const settleTime = now + 0.042;
            const settleSrc = this.ctx.createBufferSource();
            settleSrc.buffer = this.brownNoiseBuffer;
            const settleFilter = this.ctx.createBiquadFilter();
            settleFilter.type = 'lowpass';
            settleFilter.frequency.setValueAtTime(260 * pMult, settleTime);
            const settleGain = this.ctx.createGain();
            settleGain.gain.setValueAtTime(0.0001, settleTime);
            settleGain.gain.linearRampToValueAtTime(0.46 * this.masterVolume, settleTime + 0.01);
            settleGain.gain.exponentialRampToValueAtTime(0.001, settleTime + 0.15);
            settleSrc.connect(settleFilter);
            settleFilter.connect(settleGain);
            settleGain.connect(intOut);
            settleSrc.start(settleTime, Math.random() * 0.4, 0.16);
        }
    }

    playFootstep(isLeftFoot = true) {
        this.playMechFootstep(isLeftFoot);
    }

    // Asymmetric Counter-Thrust / Hydraulic Brake Exhaust Hiss (Interior Cockpit Bus)
    playHydraulicHiss() {
        if (this.muted || !this.ctx || !this.pinkNoiseBuffer) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        const hissSrc = this.ctx.createBufferSource();
        hissSrc.buffer = this.pinkNoiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(540, now + 0.45);
        filter.Q.setValueAtTime(3.0, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.32 * this.masterVolume, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

        hissSrc.connect(filter);
        filter.connect(gain);
        gain.connect(intOut);
        hissSrc.start(now);
        hissSrc.stop(now + 0.48);
    }

    // Overdrive Thruster Purge Burst
    playThrusterPurge() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        // Sub blast
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(110, now);
        subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.38);
        subGain.gain.setValueAtTime(0.48 * this.masterVolume, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        subOsc.connect(subGain);
        subGain.connect(out);
        subOsc.start(now);
        subOsc.stop(now + 0.4);

        // Rocket exhaust roar
        if (this.pinkNoiseBuffer) {
            const roarSrc = this.ctx.createBufferSource();
            roarSrc.buffer = this.pinkNoiseBuffer;
            const roarFilter = this.ctx.createBiquadFilter();
            roarFilter.type = 'lowpass';
            roarFilter.frequency.setValueAtTime(950, now);
            roarFilter.frequency.exponentialRampToValueAtTime(280, now + 0.42);
            const roarGain = this.ctx.createGain();
            roarGain.gain.setValueAtTime(0.4 * this.masterVolume, now);
            roarGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
            roarSrc.connect(roarFilter);
            roarFilter.connect(roarGain);
            roarGain.connect(out);
            roarSrc.start(now);
            roarSrc.stop(now + 0.45);
        }
    }

    // Emergency Pneumatic Coolant Steam Vent Purge (Interior Solenoid + Dual Pressurized Hiss)
    playWeaponVent() {
        if (this.muted || !this.ctx || !this.whiteNoiseBuffer) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();

        // 1) Sharp interior solenoid release valve pop
        const popOsc = this.ctx.createOscillator();
        const popGain = this.ctx.createGain();
        popOsc.type = 'triangle';
        popOsc.frequency.setValueAtTime(420, now);
        popOsc.frequency.exponentialRampToValueAtTime(92, now + 0.045);
        popGain.gain.setValueAtTime(0.28 * this.masterVolume, now);
        popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        popOsc.connect(popGain);
        popGain.connect(intOut);
        popOsc.start(now);
        popOsc.stop(now + 0.055);

        // 2) Pressurized coolant steam hiss
        const ventSrc = this.ctx.createBufferSource();
        ventSrc.buffer = this.whiteNoiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3400, now);
        filter.frequency.exponentialRampToValueAtTime(760, now + 1.25);
        filter.Q.setValueAtTime(2.4, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.42 * this.masterVolume, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

        ventSrc.connect(filter);
        filter.connect(gain);
        gain.connect(intOut);
        gain.connect(extOut);
        ventSrc.start(now);
        ventSrc.stop(now + 1.35);
    }

    // Hot Barrel / Heat-Sink Contraction Metallic Ticking on Cooldown (Interior Cockpit Bus)
    playCoolingTick(heatLevel = 0.5) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const clampedHeat = Math.max(0.15, Math.min(1.0, heatLevel || 0.5));
        const minInterval = 0.28 - clampedHeat * 0.16; // 0.12s (scalding) to 0.256s (cooling)
        if ((now - this._lastCoolingTickTime) < minInterval) return;
        this._lastCoolingTickTime = now;

        const intOut = this.getInteriorBus();
        const baseFreq = 2950 + Math.random() * 1950 + clampedHeat * 450;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = Math.random() < 0.5 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + 0.022);

        gain.gain.setValueAtTime(0.09 * clampedHeat * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

        osc.connect(gain);
        gain.connect(intOut);
        osc.start(now);
        osc.stop(now + 0.028);
    }

    // 3D Spent Brass Shell Casing Metallic Clink (dry filtered transient, no pitch-sweep chirp)
    playCasingImpact() {
        if (!this.canPlayVoice('casing', 0.06, 0.07)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        if (this.noiseBuffer) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.setValueAtTime(4200 + Math.random() * 1400, now);
            bp.Q.setValueAtTime(6.0, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.07 * this.masterVolume, now + 0.0015);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

            src.connect(bp);
            bp.connect(gain);
            gain.connect(intOut);
            const off = Math.random() * Math.max(0.01, (this.noiseBuffer.duration || 1) - 0.05);
            src.start(now, off, 0.02);
        }
    }

    // Subterranean Seismic Rumble Warning
    playSubterraneanRumble() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(34, now);
        osc.frequency.linearRampToValueAtTime(56, now + 0.4);
        osc.frequency.linearRampToValueAtTime(28, now + 0.8);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(95, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.48 * this.masterVolume, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.9);
    }

    // Ambush Chittering Screech
    playAmbushScreech() {
        if (!this.canPlayVoice('ambush', 0.25, 0.35)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(1450, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.35);

        gain.gain.setValueAtTime(0.35 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    // Subtle Low-Fatigue Motion Tracker Pulse (Interior Cockpit Bus)
    playMotionTrackerChirp(urgency = 0.0, proximity = 0.5) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const u = Math.max(0, Math.min(1, urgency || 0));
        const p = Math.max(0, Math.min(1, proximity !== undefined ? proximity : 0.5));

        // Soft, warm mid-frequency sonar tick (no shrill 2-4kHz harmonics)
        const baseFreq = 620 + u * 180 + p * 110;
        const endFreq = baseFreq * 0.92;
        const dur = 0.038;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);

        const peak = (0.032 + u * 0.022) * this.masterVolume;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.012);

        osc.connect(gain);
        gain.connect(intOut);

        osc.start(now);
        osc.stop(now + dur + 0.016);
    }

    // Military CRT Radar Contact Ping Chirp (Delegates to Motion Tracker Chirp)
    playRadarContactPing(urgency = 0.0, proximity = 0.5) {
        this.playMotionTrackerChirp(urgency, proximity);
    }

    // Dropship Cold-Open: Sequential CRT HUD telemetry boot chirp (Interior Cockpit Bus)
    playBootBeep(stepIdx = 0) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const freq = 960 + (stepIdx || 0) * 220;

        const osc = this.ctx.createOscillator();
        const tri = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        tri.type = 'triangle';
        tri.frequency.setValueAtTime(freq * 1.5, now);

        const triGain = this.ctx.createGain();
        triGain.gain.setValueAtTime(0.25, now);
        tri.connect(triGain);
        triGain.connect(gain);
        osc.connect(gain);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.26 * this.masterVolume, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        gain.connect(intOut);

        osc.start(now);
        tri.start(now);
        osc.stop(now + 0.12);
        tri.stop(now + 0.12);
    }

    // Dropship Cold-Open: Heavy blast door metallic grind & pneumatic exhaust release
    playBlastDoorsOpen() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        // 1) Heavy armored track grind (sawtooth 58Hz -> 42Hz over 1.1s)
        const grindOsc = this.ctx.createOscillator();
        const grindFilter = this.ctx.createBiquadFilter();
        const grindGain = this.ctx.createGain();
        grindOsc.type = 'sawtooth';
        grindOsc.frequency.setValueAtTime(58, now);
        grindOsc.frequency.linearRampToValueAtTime(42, now + 1.1);
        grindFilter.type = 'lowpass';
        grindFilter.frequency.setValueAtTime(190, now);
        grindGain.gain.setValueAtTime(0.0001, now);
        grindGain.gain.linearRampToValueAtTime(0.40 * this.masterVolume, now + 0.12);
        grindGain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
        grindOsc.connect(grindFilter);
        grindFilter.connect(grindGain);
        grindGain.connect(out);
        grindOsc.start(now);
        grindOsc.stop(now + 1.2);

        // 2) Pneumatic seal hiss & resonant steel scrape
        if (this.pinkNoiseBuffer) {
            const hissSrc = this.ctx.createBufferSource();
            hissSrc.buffer = this.pinkNoiseBuffer;
            const hissFilter = this.ctx.createBiquadFilter();
            hissFilter.type = 'bandpass';
            hissFilter.frequency.setValueAtTime(1600, now);
            hissFilter.frequency.exponentialRampToValueAtTime(240, now + 1.1);
            hissFilter.Q.setValueAtTime(2.6, now);
            const hissGain = this.ctx.createGain();
            hissGain.gain.setValueAtTime(0.32 * this.masterVolume, now);
            hissGain.gain.exponentialRampToValueAtTime(0.001, now + 1.12);
            hissSrc.connect(hissFilter);
            hissFilter.connect(hissGain);
            hissGain.connect(out);
            hissSrc.start(now);
            hissSrc.stop(now + 1.15);
        }
    }

    // Weight-based Skitterer trample chitin crush
    playTrampleCrunch() {
        if (!this.canPlayVoice('trample', 0.06, 0.18)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.masterOut || this.ctx.destination;

        // Low heavy boot thud
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.14);
        gain.gain.setValueAtTime(0.45 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.15);

        // Wet carapace crack squelch
        if (this.pinkNoiseBuffer) {
            const nSrc = this.ctx.createBufferSource();
            nSrc.buffer = this.pinkNoiseBuffer;
            const nFilter = this.ctx.createBiquadFilter();
            nFilter.type = 'bandpass';
            nFilter.frequency.setValueAtTime(1150, now);
            nFilter.frequency.exponentialRampToValueAtTime(340, now + 0.12);
            nFilter.Q.setValueAtTime(2.8, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.36 * this.masterVolume, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            nSrc.connect(nFilter);
            nFilter.connect(nGain);
            nGain.connect(out);
            nSrc.start(now);
            nSrc.stop(now + 0.14);
        }
    }

    // Helldivers-Style Directional Terminal Switch Click (Interior Cockpit Bus)
    playTerminalKeyClick(correct = true, stepIdx = 0) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        if (correct) {
            const baseF = 1100 + (stepIdx || 0) * 160;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(baseF, now);
            osc.frequency.exponentialRampToValueAtTime(baseF * 1.18, now + 0.045);
            gain.gain.setValueAtTime(0.24 * this.masterVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(190, now);
            osc.frequency.linearRampToValueAtTime(135, now + 0.14);
            gain.gain.setValueAtTime(0.26 * this.masterVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        }
        osc.connect(gain);
        gain.connect(intOut);
        osc.start(now);
        osc.stop(now + (correct ? 0.06 : 0.16));
    }

    // Military Terminal Uplink Lock Chime (3-note ascending on Interior Bus)
    playTerminalSuccess() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const notes = [880, 1175, 1760];
        notes.forEach((f, idx) => {
            const t0 = now + idx * 0.065;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t0);
            gain.gain.setValueAtTime(0.24 * this.masterVolume, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
            osc.connect(gain);
            gain.connect(intOut);
            osc.start(t0);
            osc.stop(t0 + 0.15);
        });
    }

    // Heavy Hydraulic Refit Pad Leg Clamp Engagement & Pneumatic Seal (Interior Bus)
    playPadClampLock() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
        gain.gain.setValueAtTime(0.38 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
        osc.connect(gain);
        gain.connect(intOut);
        osc.start(now);
        osc.stop(now + 0.22);

        if (this.pinkNoiseBuffer) {
            const hiss = this.ctx.createBufferSource();
            hiss.buffer = this.pinkNoiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2100, now + 0.04);
            filter.frequency.exponentialRampToValueAtTime(680, now + 0.28);
            const hGain = this.ctx.createGain();
            hGain.gain.setValueAtTime(0.18 * this.masterVolume, now + 0.04);
            hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
            hiss.connect(filter);
            filter.connect(hGain);
            hGain.connect(intOut);
            hiss.start(now + 0.04);
            hiss.stop(now + 0.32);
        }
    }

    // Left-Arm Claw Ordnance Shell Grab or Heavy Breech Load Slam (Interior Bus)
    playArtilleryLoad(isGrab = false) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        if (isGrab) {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(580, now + 0.11);
            gain.gain.setValueAtTime(0.28 * this.masterVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(190, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.24);
            gain.gain.setValueAtTime(0.36 * this.masterVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        }
        osc.connect(gain);
        gain.connect(intOut);
        osc.start(now);
        osc.stop(now + (isGrab ? 0.16 : 0.28));
    }

    // Sub-Surface Nest Hellbomb Arming Escalating Siren (Interior + Exterior Buses)
    playHellbombArm() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus();
        const extOut = this.getExteriorBus();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(1020, now + 0.55);
        gain.gain.setValueAtTime(0.26 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
        osc.connect(gain);
        gain.connect(intOut);
        gain.connect(extOut);
        osc.start(now);
        osc.stop(now + 0.65);
    }

    // Metallic chitin deflection ping when hitscan rounds strike unshattered Siege-Beetle armor
    playArmorRicochet() {
        if (!this.canPlayVoice('ricochet', 0.055, 0.13)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const extOut = this.getExteriorBus ? this.getExteriorBus() : (this.masterOut || this.ctx.destination);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const f0 = 2100 + Math.random() * 450;
        osc.frequency.setValueAtTime(f0, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.11);
        gain.gain.setValueAtTime(0.18 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(extOut);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    // Acid Spitter volatile bile-sac chain detonation
    playBileDetonation() {
        if (!this.canPlayVoice('bile', 0.08, 0.45)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const extOut = this.getExteriorBus ? this.getExteriorBus() : (this.masterOut || this.ctx.destination);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(34, now + 0.35);
        gain.gain.setValueAtTime(0.45 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(extOut);
        osc.start(now);
        osc.stop(now + 0.40);

        if (this.pinkNoiseBuffer) {
            const hiss = this.ctx.createBufferSource();
            hiss.buffer = this.pinkNoiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2400, now);
            filter.frequency.exponentialRampToValueAtTime(750, now + 0.42);
            const hGain = this.ctx.createGain();
            hGain.gain.setValueAtTime(0.32 * this.masterVolume, now);
            hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
            hiss.connect(filter);
            filter.connect(hGain);
            hGain.connect(extOut);
            hiss.start(now);
            hiss.stop(now + 0.46);
        }
    }

    // Urgent two-tone warning trill when a Pheromone Scout spots the mech
    playScoutChitter() {
        if (!this.canPlayVoice('scout', 0.30, 0.25)) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus ? this.getInteriorBus() : (this.masterOut || this.ctx.destination);

        [1480, 1980].forEach((freq, i) => {
            const t0 = now + i * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t0);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t0 + 0.07);
            gain.gain.setValueAtTime(0.18 * this.masterVolume, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.085);
            osc.connect(gain);
            gain.connect(intOut);
            osc.start(t0);
            osc.stop(t0 + 0.09);
        });
    }

    // Loud shrieking orange flare launch + breach sub-bass rumble
    playPheromoneFlare() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const extOut = this.getExteriorBus ? this.getExteriorBus() : (this.masterOut || this.ctx.destination);
        const intOut = this.getInteriorBus ? this.getInteriorBus() : (this.masterOut || this.ctx.destination);

        const siren = this.ctx.createOscillator();
        const sGain = this.ctx.createGain();
        siren.type = 'sawtooth';
        siren.frequency.setValueAtTime(420, now);
        siren.frequency.exponentialRampToValueAtTime(1650, now + 0.48);
        sGain.gain.setValueAtTime(0.30 * this.masterVolume, now);
        sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        siren.connect(sGain);
        sGain.connect(intOut);
        sGain.connect(extOut);
        siren.start(now);
        siren.stop(now + 0.58);

        const rumble = this.ctx.createOscillator();
        const rGain = this.ctx.createGain();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(68, now + 0.08);
        rumble.frequency.exponentialRampToValueAtTime(28, now + 0.72);
        rGain.gain.setValueAtTime(0.50 * this.masterVolume, now + 0.08);
        rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
        rumble.connect(rGain);
        rGain.connect(extOut);
        rumble.start(now + 0.08);
        rumble.stop(now + 0.78);
    }

    // Brood-Guard telegraphed seismic ground-slam impact
    playBossGroundSlam() {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const extOut = this.getExteriorBus ? this.getExteriorBus() : (this.masterOut || this.ctx.destination);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(58, now);
        osc.frequency.exponentialRampToValueAtTime(24, now + 0.42);
        gain.gain.setValueAtTime(0.65 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain);
        gain.connect(extOut);
        osc.start(now);
        osc.stop(now + 0.50);
    }

    // Short tactical radio PTT squelch chirp before/after voice transmissions
    playCommsSquelch(isTail = false) {
        if (this.muted || !this.ctx) return;
        this.resume();
        const now = this.ctx.currentTime;
        const intOut = this.getInteriorBus ? this.getInteriorBus() : (this.masterOut || this.ctx.destination);

        // Filtered static micro-burst
        const bufLen = Math.floor(this.ctx.sampleRate * 0.045);
        const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buf;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(isTail ? 1400 : 1900, now);
        bp.Q.setValueAtTime(1.8, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.09 * this.masterVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

        noise.connect(bp);
        bp.connect(gain);
        gain.connect(intOut);
        noise.start(now);

        // Crisp PTT tone pip
        const osc = this.ctx.createOscillator();
        const tGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isTail ? 880 : 1240, now);
        tGain.gain.setValueAtTime(0.045 * this.masterVolume, now);
        tGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
        osc.connect(tGain);
        tGain.connect(intOut);
        osc.start(now);
        osc.stop(now + 0.032);
    }

    // Loads the pre-rendered neural comms manifest and decodes every clip once.
    loadCommsManifest() {
        if (this.commsLoadStarted || typeof fetch === 'undefined') return;
        this.commsLoadStarted = true;
        fetch('audio/comms/manifest.json')
            .then((res) => res && res.ok ? res.json() : null)
            .then((manifest) => {
                if (!manifest || !manifest.clips) return;
                this.commsManifest = manifest;
                this.commsLookups = manifest.lookups || {};
                Object.entries(manifest.clips).forEach(([id, clip]) => {
                    fetch(clip.file)
                        .then((res) => res && res.ok ? res.arrayBuffer() : null)
                        .then((data) => {
                            if (!data || !this.ctx) return;
                            this.ctx.decodeAudioData(data).then((buffer) => {
                                this.commsBuffers[id] = buffer;
                            }).catch(() => {});
                        })
                        .catch(() => {});
                });
            })
            .catch(() => {});
    }

    normalizeCommsKey(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    findCommsClip(text, opts) {
        if (opts.id && this.commsBuffers[opts.id]) return opts.id;
        const keys = [opts.id, text, opts.cooldownKey];
        for (const key of keys) {
            const id = this.commsLookups[this.normalizeCommsKey(key)];
            if (id && this.commsBuffers[id]) return id;
        }
        return null;
    }

    // Plays a decoded clip through a walkie-talkie DSP chain with a quiet carrier bed.
    playCommsClip(id) {
        const buffer = this.commsBuffers[id];
        if (!buffer || !this.ctx) return false;
        this.resume();
        const now = this.ctx.currentTime;
        const out = this.getInteriorBus ? this.getInteriorBus() : (this.masterOut || this.ctx.destination);

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = 0.985 + Math.random() * 0.03;

        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(320, now);
        highpass.Q.value = 0.7;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(3100, now);
        lowpass.Q.value = 0.7;

        const saturation = this.ctx.createWaveShaper();
        saturation.curve = this.makeDistortionCurve(8);
        saturation.oversample = '2x';

        const voiceGain = this.ctx.createGain();
        voiceGain.gain.setValueAtTime(0.92 * this.masterVolume, now);

        src.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(saturation);
        saturation.connect(voiceGain);
        voiceGain.connect(out);

        // Subtle radio carrier static under the voice.
        let staticSrc = null;
        if (this.whiteNoiseBuffer) {
            staticSrc = this.ctx.createBufferSource();
            staticSrc.buffer = this.whiteNoiseBuffer;
            staticSrc.loop = true;
            const carrier = this.ctx.createBiquadFilter();
            carrier.type = 'bandpass';
            carrier.frequency.setValueAtTime(1850, now);
            carrier.Q.value = 0.8;
            const staticGain = this.ctx.createGain();
            staticGain.gain.setValueAtTime(0.0001, now);
            staticGain.gain.linearRampToValueAtTime(0.012 * this.masterVolume, now + 0.06);
            staticGain.gain.setValueAtTime(0.012 * this.masterVolume, now + Math.max(0.06, buffer.duration - 0.08));
            staticGain.gain.linearRampToValueAtTime(0.0001, now + buffer.duration);
            staticSrc.connect(carrier);
            carrier.connect(staticGain);
            staticGain.connect(out);
            staticSrc.start(now);
            staticSrc.stop(now + buffer.duration + 0.02);
        }

        src.onended = () => {
            if (!this.muted) this.playCommsSquelch(true);
        };
        src.start(now);
        return true;
    }

    // Tactical AI & Orbital Commander Voice Narration (Web Speech API + HUD Subtitles)
    speakComms(text, opts = {}) {
        if (!text || this.muted || this.commsMuted) return false;
        const speaker = opts.speaker || 'AI';
        const priority = opts.priority !== undefined ? opts.priority : 1;
        const cooldownKey = opts.cooldownKey || null;
        const cooldownMs = opts.cooldownMs !== undefined ? opts.cooldownMs : 6000;
        const nowMs = Date.now();

        if (cooldownKey) {
            const last = this.commsCategoryTimes[cooldownKey] || 0;
            if (nowMs - last < cooldownMs) return false;
        }

        const hasTTS = (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined');
        if (hasTTS && window.speechSynthesis.speaking && priority < 2) {
            return false;
        }

        this.lastCommsTime = nowMs;
        if (cooldownKey) this.commsCategoryTimes[cooldownKey] = nowMs;

        // Update HUD radio subtitle bar if present
        if (typeof document !== 'undefined') {
            const box = document.getElementById('hudComms');
            const spkEl = document.getElementById('hudCommsSpeaker');
            const txtEl = document.getElementById('hudCommsText');
            if (box && spkEl && txtEl) {
                spkEl.textContent = speaker === 'COMMAND' ? 'ORBITAL CMD' : 'TAC-AI';
                spkEl.className = 'hud-comms-speaker ' + (speaker === 'COMMAND' ? 'cmd' : 'ai');
                txtEl.textContent = text;
                box.classList.remove('hidden');
                if (this._commsHideTimer) clearTimeout(this._commsHideTimer);
                this._commsHideTimer = setTimeout(() => {
                    box.classList.add('hidden');
                }, Math.max(4200, Math.min(7500, text.length * 65)));
            }
        }

        this.playCommsSquelch(false);

        // Prefer the pre-rendered neural clip; dynamic lines fall back to browser TTS.
        let playedClip = false;
        if (this.ctx) {
            const clipId = this.findCommsClip(text, opts);
            if (clipId) playedClip = this.playCommsClip(clipId);
        }

        if (!playedClip && hasTTS) {
            try {
                if (priority >= 2) window.speechSynthesis.cancel();
                const utt = new SpeechSynthesisUtterance(text);
                const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
                if (voices && voices.length > 0) {
                    const enVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
                    const preferred = enVoices.find(v => /daniel|guy|david|mark|aria|google us|natural/i.test(v.name)) || enVoices[0] || voices[0];
                    if (preferred) utt.voice = preferred;
                }
                if (speaker === 'COMMAND') {
                    utt.pitch = 0.88;
                    utt.rate = 1.02;
                    utt.volume = Math.min(1, 0.85 * (this.masterVolume / 0.48));
                } else {
                    utt.pitch = 1.04;
                    utt.rate = 1.06;
                    utt.volume = Math.min(1, 0.80 * (this.masterVolume / 0.48));
                }
                utt.onend = () => {
                    if (!this.muted) this.playCommsSquelch(true);
                };
                window.speechSynthesis.speak(utt);
            } catch (e) {}
        }
        return true;
    }
}

window.soundManager = new SoundManager();

/**
 * hooks/useGameSounds.ts
 *
 * Programmatic sound system for FlightCraft.
 * All sounds synthesized via expo-audio — no audio files needed.
 *
 * Setup:
 *   expo install expo-audio
 *
 * Each sound is generated as a WAV data URI and played via expo-audio AudioPlayer.
 * Sounds respect the user's mute preference stored in AsyncStorage.
 *
 * Usage:
 *   const sounds = useGameSounds();
 *   sounds.hubBuy();
 *   sounds.planeBuy();
 *   sounds.routeCreate();
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────
// STORAGE KEY
// ─────────────────────────────────────────────────────────────────

const SFX_KEY = "@flightcraft:sfx_enabled";
const MUSIC_KEY = "@flightcraft:music_enabled";

// ─────────────────────────────────────────────────────────────────
// WAV SYNTHESIS — generates PCM audio data as base64
// ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 22050;

function generateWav(
  notes: {
    freq: number;
    duration: number;
    volume?: number;
    type?: "sine" | "square" | "sawtooth";
  }[],
): string {
  // Calculate total samples
  const totalSamples = notes.reduce(
    (sum, n) => sum + Math.floor(SAMPLE_RATE * n.duration),
    0,
  );

  const buffer = new Float32Array(totalSamples);
  let offset = 0;

  notes.forEach(({ freq, duration, volume = 0.3, type = "sine" }) => {
    const numSamples = Math.floor(SAMPLE_RATE * duration);
    const attackSamples = Math.floor(numSamples * 0.05);
    const releaseSamples = Math.floor(numSamples * 0.3);

    for (let i = 0; i < numSamples; i++) {
      const t = i / SAMPLE_RATE;

      // Waveform
      let sample = 0;
      if (type === "sine") {
        sample = Math.sin(2 * Math.PI * freq * t);
      } else if (type === "square") {
        sample = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
      } else if (type === "sawtooth") {
        sample = 2 * ((freq * t) % 1) - 1;
      }

      // Envelope: attack + sustain + release
      let env = volume;
      if (i < attackSamples) {
        env *= i / attackSamples;
      } else if (i > numSamples - releaseSamples) {
        env *= (numSamples - i) / releaseSamples;
      }

      buffer[offset + i] = sample * env;
    }
    offset += numSamples;
  });

  // Convert float samples to 16-bit PCM
  const pcm = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(buffer[i] * 32767)));
  }

  // WAV header
  const dataLength = pcm.byteLength;
  const headerLength = 44;
  const wavBuffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(wavBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true); // sample rate
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  // Write PCM data
  const pcmView = new Int16Array(wavBuffer, 44);
  pcmView.set(pcm);

  // Convert to base64
  const bytes = new Uint8Array(wavBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

// ─────────────────────────────────────────────────────────────────
// SOUND LIBRARY — all programmatically generated
// ─────────────────────────────────────────────────────────────────

const SOUNDS = {
  // Subtle tap — very short, quiet
  tap: () =>
    generateWav([{ freq: 800, duration: 0.04, volume: 0.15, type: "sine" }]),

  // Hub purchase — ascending ding
  hubBuy: () =>
    generateWav([
      { freq: 440, duration: 0.08, volume: 0.25, type: "sine" },
      { freq: 660, duration: 0.18, volume: 0.3, type: "sine" },
    ]),

  // Plane purchase — deeper, mechanical
  planeBuy: () =>
    generateWav([
      { freq: 220, duration: 0.1, volume: 0.2, type: "sine" },
      { freq: 330, duration: 0.1, volume: 0.25, type: "sine" },
      { freq: 440, duration: 0.2, volume: 0.3, type: "sine" },
    ]),

  // Route created — 3-note ascending chime (C E G)
  routeCreate: () =>
    generateWav([
      { freq: 523, duration: 0.12, volume: 0.28, type: "sine" },
      { freq: 659, duration: 0.12, volume: 0.28, type: "sine" },
      { freq: 784, duration: 0.22, volume: 0.3, type: "sine" },
    ]),

  // Plane arrives — soft whoosh landing
  planeArrive: () =>
    generateWav([
      { freq: 600, duration: 0.05, volume: 0.15, type: "sine" },
      { freq: 400, duration: 0.08, volume: 0.18, type: "sine" },
      { freq: 880, duration: 0.12, volume: 0.2, type: "sine" },
    ]),

  // Mission complete — 2-note success
  missionComplete: () =>
    generateWav([
      { freq: 523, duration: 0.18, volume: 0.3, type: "sine" },
      { freq: 784, duration: 0.32, volume: 0.35, type: "sine" },
    ]),

  // Achievement — 4-note fanfare (C E G C')
  achievement: () =>
    generateWav([
      { freq: 523, duration: 0.12, volume: 0.3, type: "sine" },
      { freq: 659, duration: 0.12, volume: 0.3, type: "sine" },
      { freq: 784, duration: 0.12, volume: 0.3, type: "sine" },
      { freq: 1047, duration: 0.3, volume: 0.35, type: "sine" },
    ]),

  // Day advance — soft clock tick
  dayAdvance: () =>
    generateWav([
      { freq: 440, duration: 0.06, volume: 0.2, type: "sine" },
      { freq: 550, duration: 0.1, volume: 0.2, type: "sine" },
    ]),

  // Revenue positive — bright cash ting
  revenuePositive: () =>
    generateWav([
      { freq: 1200, duration: 0.05, volume: 0.18, type: "sine" },
      { freq: 880, duration: 0.1, volume: 0.15, type: "sine" },
    ]),

  // Revenue negative — low thud
  revenueNegative: () =>
    generateWav([
      { freq: 180, duration: 0.12, volume: 0.2, type: "sine" },
      { freq: 140, duration: 0.12, volume: 0.18, type: "sine" },
    ]),

  // Error — descending buzz
  error: () =>
    generateWav([
      { freq: 300, duration: 0.08, volume: 0.25, type: "square" },
      { freq: 200, duration: 0.15, volume: 0.2, type: "square" },
    ]),

  // Hub sold
  hubSell: () =>
    generateWav([
      { freq: 660, duration: 0.1, volume: 0.25, type: "sine" },
      { freq: 440, duration: 0.18, volume: 0.2, type: "sine" },
    ]),
};

// ─────────────────────────────────────────────────────────────────
// SOUND MANAGER SINGLETON
// ─────────────────────────────────────────────────────────────────

class SoundManager {
  private sfxEnabled = true;
  private loaded = false;

  async init() {
    if (this.loaded) return;
    try {
      // expo-audio handles audio mode automatically
      const stored = await AsyncStorage.getItem(SFX_KEY);
      this.sfxEnabled = stored !== "false";
      this.loaded = true;
    } catch {}
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    AsyncStorage.setItem(SFX_KEY, enabled ? "true" : "false");
  }

  isSfxEnabled() {
    return this.sfxEnabled;
  }

  async play(soundKey: keyof typeof SOUNDS) {
    if (!this.sfxEnabled) return;
    try {
      const uri = SOUNDS[soundKey]();
      const player = createAudioPlayer({ uri });
      player.play();
      // Release after sound duration + buffer
      setTimeout(() => {
        try {
          player.remove();
        } catch {}
      }, 2000);
    } catch {} // never crash on audio failure
  }
}

const manager = new SoundManager();

// ─────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────

export function useGameSounds() {
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    manager.init();
  }, []);

  const play = useCallback((key: keyof typeof SOUNDS) => {
    manager.play(key);
  }, []);

  return {
    // UI
    tap: () => play("tap"),
    error: () => play("error"),

    // Game actions
    hubBuy: () => play("hubBuy"),
    hubSell: () => play("hubSell"),
    planeBuy: () => play("planeBuy"),
    routeCreate: () => play("routeCreate"),
    planeArrive: () => play("planeArrive"),

    // Rewards
    missionComplete: () => play("missionComplete"),
    achievement: () => play("achievement"),
    dayAdvance: () => play("dayAdvance"),

    // Revenue pops
    revenuePositive: () => play("revenuePositive"),
    revenueNegative: () => play("revenueNegative"),

    // Settings
    setSfxEnabled: (v: boolean) => manager.setSfxEnabled(v),
    isSfxEnabled: () => manager.isSfxEnabled(),
  };
}

// Convenience export for use outside React components
export const gameSounds = {
  play: (key: keyof typeof SOUNDS) => manager.play(key),
};

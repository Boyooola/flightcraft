/**
 * hooks/useGameSounds.ts
 *
 * SFX + background music using expo-audio.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

const SFX_KEY = "@flightcraft:sfx_enabled";
const MUSIC_KEY = "@flightcraft:music_enabled";

const MUSIC_FILE = require("../assets/sounds/main.mp3");

const SAMPLE_RATE = 22050;

function generateWav(
  notes: {
    freq: number;
    duration: number;
    volume?: number;
    type?: "sine" | "square" | "sawtooth";
  }[],
): string {
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

      let sample = 0;
      if (type === "sine") {
        sample = Math.sin(2 * Math.PI * freq * t);
      } else if (type === "square") {
        sample = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
      } else {
        sample = 2 * ((freq * t) % 1) - 1;
      }

      let env = volume;
      if (i < attackSamples && attackSamples > 0) {
        env *= i / attackSamples;
      } else if (i > numSamples - releaseSamples && releaseSamples > 0) {
        env *= (numSamples - i) / releaseSamples;
      }

      buffer[offset + i] = sample * env;
    }

    offset += numSamples;
  });

  const pcm = new Int16Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(buffer[i] * 32767)));
  }

  const dataLength = pcm.byteLength;
  const wavBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wavBuffer);

  function writeString(pos: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(pos + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  new Int16Array(wavBuffer, 44).set(pcm);

  const bytes = new Uint8Array(wavBuffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:audio/wav;base64,${btoa(binary)}`;
}

const SOUNDS = {
  tap: () =>
    generateWav([{ freq: 800, duration: 0.04, volume: 0.15, type: "sine" }]),

  hubBuy: () =>
    generateWav([
      { freq: 440, duration: 0.08, volume: 0.25, type: "sine" },
      { freq: 660, duration: 0.18, volume: 0.3, type: "sine" },
    ]),

  planeBuy: () =>
    generateWav([
      { freq: 220, duration: 0.1, volume: 0.2, type: "sine" },
      { freq: 330, duration: 0.1, volume: 0.25, type: "sine" },
      { freq: 440, duration: 0.2, volume: 0.3, type: "sine" },
    ]),

  routeCreate: () =>
    generateWav([
      { freq: 523, duration: 0.12, volume: 0.28, type: "sine" },
      { freq: 659, duration: 0.12, volume: 0.28, type: "sine" },
      { freq: 784, duration: 0.22, volume: 0.3, type: "sine" },
    ]),

  planeArrive: () =>
    generateWav([
      { freq: 600, duration: 0.05, volume: 0.15, type: "sine" },
      { freq: 400, duration: 0.08, volume: 0.18, type: "sine" },
      { freq: 880, duration: 0.12, volume: 0.2, type: "sine" },
    ]),

  missionComplete: () =>
    generateWav([
      { freq: 523, duration: 0.18, volume: 0.3, type: "sine" },
      { freq: 784, duration: 0.32, volume: 0.35, type: "sine" },
    ]),

  achievement: () =>
    generateWav([
      { freq: 523, duration: 0.12, volume: 0.3, type: "sine" },
      { freq: 659, duration: 0.12, volume: 0.3, type: "sine" },
      { freq: 784, duration: 0.12, volume: 0.3, type: "sine" },
      { freq: 1047, duration: 0.3, volume: 0.35, type: "sine" },
    ]),

  dayAdvance: () =>
    generateWav([
      { freq: 440, duration: 0.06, volume: 0.2, type: "sine" },
      { freq: 550, duration: 0.1, volume: 0.2, type: "sine" },
    ]),

  revenuePositive: () =>
    generateWav([
      { freq: 1200, duration: 0.05, volume: 0.18, type: "sine" },
      { freq: 880, duration: 0.1, volume: 0.15, type: "sine" },
    ]),

  revenueNegative: () =>
    generateWav([
      { freq: 180, duration: 0.12, volume: 0.2, type: "sine" },
      { freq: 140, duration: 0.12, volume: 0.18, type: "sine" },
    ]),

  error: () =>
    generateWav([
      { freq: 300, duration: 0.08, volume: 0.25, type: "square" },
      { freq: 200, duration: 0.15, volume: 0.2, type: "square" },
    ]),

  hubSell: () =>
    generateWav([
      { freq: 660, duration: 0.1, volume: 0.25, type: "sine" },
      { freq: 440, duration: 0.18, volume: 0.2, type: "sine" },
    ]),
};

class SoundManager {
  private sfxEnabled = true;
  private musicEnabled = true;
  private loaded = false;
  private musicPlayer: any = null;
  private musicLoopTimer: ReturnType<typeof setInterval> | null = null;

  async init() {
    if (this.loaded) return;

    try {
      await setIsAudioActiveAsync(true);
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "mixWithOthers",
      });

      const storedSfx = await AsyncStorage.getItem(SFX_KEY);
      const storedMusic = await AsyncStorage.getItem(MUSIC_KEY);

      this.sfxEnabled = storedSfx !== "false";
      this.musicEnabled = storedMusic !== "false";
      this.loaded = true;

      if (this.musicEnabled) {
        this.playMusic();
      }
    } catch (err) {
      console.warn("[GameSounds] init failed", err);
    }
  }

  playMusic() {
    if (!this.musicEnabled) return;

    try {
      if (!this.musicPlayer) {
        this.musicPlayer = createAudioPlayer(MUSIC_FILE);
      }

      this.musicPlayer.volume = 0.2;
      this.musicPlayer.seekTo?.(0);
      this.musicPlayer.play();

      // Fallback loop. Adjust 60000 to your MP3 length in milliseconds.
      if (!this.musicLoopTimer) {
        this.musicLoopTimer = setInterval(() => {
          if (!this.musicEnabled || !this.musicPlayer) return;

          try {
            this.musicPlayer.volume = 0.2;
            this.musicPlayer.seekTo?.(0);
            this.musicPlayer.play();
          } catch {}
        }, 60000);
      }
    } catch (err) {
      console.warn("[GameSounds] music failed", err);
    }
  }

  stopMusic() {
    try {
      if (this.musicLoopTimer) {
        clearInterval(this.musicLoopTimer);
        this.musicLoopTimer = null;
      }

      this.musicPlayer?.pause?.();
    } catch {}
  }

  async setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    await AsyncStorage.setItem(MUSIC_KEY, enabled ? "true" : "false");

    if (enabled) {
      this.playMusic();
    } else {
      this.stopMusic();
    }
  }

  isMusicEnabled() {
    return this.musicEnabled;
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    AsyncStorage.setItem(SFX_KEY, enabled ? "true" : "false");
  }

  isSfxEnabled() {
    return this.sfxEnabled;
  }

  play(soundKey: keyof typeof SOUNDS) {
    if (!this.sfxEnabled) return;

    try {
      const uri = SOUNDS[soundKey]();
      const player = createAudioPlayer({ uri });

      player.seekTo?.(0);
      player.play();

      setTimeout(() => {
        try {
          player.remove?.();
        } catch {}
      }, 2000);
    } catch (err) {
      console.warn("[GameSounds] sfx failed", soundKey, err);
    }
  }
}

const manager = new SoundManager();

export function useGameSounds() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    manager.init();
  }, []);

  const play = useCallback((key: keyof typeof SOUNDS) => {
    manager.play(key);
  }, []);

  return {
    tap: () => play("tap"),
    error: () => play("error"),

    hubBuy: () => play("hubBuy"),
    hubSell: () => play("hubSell"),
    planeBuy: () => play("planeBuy"),
    routeCreate: () => play("routeCreate"),
    planeArrive: () => play("planeArrive"),

    missionComplete: () => play("missionComplete"),
    achievement: () => play("achievement"),
    dayAdvance: () => play("dayAdvance"),

    revenuePositive: () => play("revenuePositive"),
    revenueNegative: () => play("revenueNegative"),

    playMusic: () => manager.playMusic(),
    stopMusic: () => manager.stopMusic(),

    setSfxEnabled: (v: boolean) => manager.setSfxEnabled(v),
    isSfxEnabled: () => manager.isSfxEnabled(),

    setMusicEnabled: (v: boolean) => manager.setMusicEnabled(v),
    isMusicEnabled: () => manager.isMusicEnabled(),
  };
}

export const gameSounds = {
  play: (key: keyof typeof SOUNDS) => manager.play(key),
  playMusic: () => manager.playMusic(),
  stopMusic: () => manager.stopMusic(),
};

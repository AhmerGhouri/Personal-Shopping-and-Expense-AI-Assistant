import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type WakeWordStatus = {
  enabled: boolean;
  running: boolean;
  listening: boolean;
  lastError: string | null;
  microphone: boolean;
  notifications: boolean;
  /** "Display over other apps": lets the app open itself when the phone is unlocked. */
  overlay: boolean;
  /** Full-screen notifications: open the app on a locked or sleeping phone. */
  fullScreen: boolean;
};
export type WakeWordEvent = { type: 'detected' | 'error'; message: string | null };
export type SettingsPage = 'overlay' | 'fullScreen' | 'battery' | 'app';

interface WakeWordModule {
  getStatus(): Promise<WakeWordStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  consumeWake(): Promise<boolean>;
  isLocked(): Promise<boolean>;
  unlock(): Promise<boolean>;
  openSettings(page: SettingsPage): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const native = Platform.OS === 'android' ? NativeModules.WakeWord as WakeWordModule | undefined : undefined;
const emitter = native ? new NativeEventEmitter(native) : null;

/** Android-only. On other platforms every call is a harmless no-op. */
export const wakeWord = {
  available: !!native,
  getStatus: () => native?.getStatus() ?? Promise.resolve(null),
  start: () => native?.start() ?? Promise.resolve(),
  stop: () => native?.stop() ?? Promise.resolve(),
  pause: () => native?.pause(),
  resume: () => native?.resume(),
  consumeWake: () => native?.consumeWake() ?? Promise.resolve(false),
  isLocked: () => native?.isLocked() ?? Promise.resolve(false),
  unlock: () => native?.unlock() ?? Promise.resolve(true),
  openSettings: (page: SettingsPage) => native?.openSettings(page),
  onEvent: (callback: (event: WakeWordEvent) => void) => emitter?.addListener('WakeWordEvent', callback),
};

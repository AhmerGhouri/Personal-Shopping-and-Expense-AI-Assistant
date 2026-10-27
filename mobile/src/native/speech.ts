import { NativeEventEmitter, NativeModules } from 'react-native';

interface SpeechModule {
  speak(text: string, language: string): Promise<string>;
  stop(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const native = NativeModules.VoiceSpeech as SpeechModule | undefined;
const emitter = native ? new NativeEventEmitter(native) : null;
export type SpeechEvent = { utteranceId: string };

export const speech = {
  speak(text: string, language: string): Promise<string> {
    if (!native) return Promise.reject(new Error('VoiceSpeech is unavailable. Rebuild the native application.'));
    return native.speak(text, language);
  },
  async stop(): Promise<void> { await native?.stop(); },
  onFinish(callback: (event: SpeechEvent) => void) {
    return emitter?.addListener('VoiceSpeechFinished', callback);
  },
  onError(callback: (event: SpeechEvent) => void) {
    return emitter?.addListener('VoiceSpeechError', callback);
  },
};

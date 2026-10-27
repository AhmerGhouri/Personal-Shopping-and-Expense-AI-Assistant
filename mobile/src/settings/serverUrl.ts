import { Dirs, FileSystem } from 'react-native-file-access';
import { config } from '../config';

const settingsPath = `${Dirs.DocumentDir}/server-settings.json`;

/** Accepts "192.168.1.9:8000" or a full URL and returns "http://192.168.1.9:8000". */
export function normalizeServerUrl(input: string): string {
  let value = input.trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  // A bare IP almost always means the default backend port.
  if (/^https?:\/\/\d{1,3}(\.\d{1,3}){3}$/i.test(value)) value = `${value}:8000`;
  return value;
}

export function isValidServerUrl(value: string): boolean {
  return /^https?:\/\/[^\s/:]+(:\d{1,5})?(\/[^\s]*)?$/i.test(value);
}

export async function loadServerUrl(): Promise<string> {
  try {
    if (await FileSystem.exists(settingsPath)) {
      const saved = JSON.parse(await FileSystem.readFile(settingsPath)) as { serverUrl?: unknown };
      if (typeof saved.serverUrl === 'string' && isValidServerUrl(saved.serverUrl)) return saved.serverUrl;
    }
  } catch { /* Fall back to the built-in default. */ }
  return config.defaultApiUrl;
}

export async function saveServerUrl(serverUrl: string): Promise<void> {
  await FileSystem.writeFile(settingsPath, JSON.stringify({ serverUrl }));
}

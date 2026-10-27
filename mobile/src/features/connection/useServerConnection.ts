import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkHealth } from '../../api/assistant';
import { config } from '../../config';
import { loadServerUrl, saveServerUrl } from '../../settings/serverUrl';

export type ConnectionState = 'checking' | 'online' | 'offline';

export function useServerConnection() {
  const [serverUrl, setServerUrl] = useState<string>(config.defaultApiUrl);
  const [state, setState] = useState<ConnectionState>('checking');
  const [mode, setMode] = useState<'groq' | 'demo' | null>(null);
  const latest = useRef(0);

  const check = useCallback(async (url: string) => {
    const attempt = ++latest.current;
    setState('checking');
    try {
      const result = await checkHealth(url);
      if (attempt !== latest.current) return;
      setMode(result.mode);
      setState('online');
    } catch {
      if (attempt === latest.current) setState('offline');
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadServerUrl().then(url => { if (active) { setServerUrl(url); void check(url); } });
    return () => { active = false; };
  }, [check]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void check(serverUrl); });
    return () => subscription.remove();
  }, [check, serverUrl]);

  const update = useCallback(async (url: string) => {
    setServerUrl(url);
    await saveServerUrl(url);
    await check(url);
  }, [check]);

  return { serverUrl, state, mode, recheck: () => check(serverUrl), update };
}

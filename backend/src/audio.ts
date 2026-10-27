import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError } from './assistant.ts';

const execFileAsync = promisify(execFile);

export async function normalizeAudio(audio: Buffer, executable = 'ffmpeg'): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'voice-assistant-'));
  try {
    const input = join(directory, 'recording');
    const output = join(directory, 'normalized.wav');
    await writeFile(input, audio);
    try {
      await execFileAsync(executable, [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-protocol_whitelist', 'file,pipe', '-i', input,
        '-t', '31', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output,
      ], { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(503, 'FFmpeg is not installed on the backend.');
      throw new ApiError(422, 'Could not decode this recording. Please record again.');
    }
    const wav = await readFile(output);
    // 16 kHz, mono, signed 16-bit PCM plus a small WAV header allowance.
    if (wav.length > 30 * 16000 * 2 + 4096) {
      throw new ApiError(422, 'Keep recordings within 30 seconds.');
    }
    if (wav.length < 512) throw new ApiError(422, 'The recording is too short.');
    return wav;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

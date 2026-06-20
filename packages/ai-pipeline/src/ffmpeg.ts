import { spawn } from 'node:child_process';

/**
 * Thin wrappers around the ffmpeg/ffprobe binaries. The worker host (Railway)
 * must have ffmpeg installed; the binaries are invoked directly (no native
 * bindings) so this stays dependency-light.
 */

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

/** Run a command, collecting stdout as a Buffer (for binary pipe output). */
function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d) => out.push(d as Buffer));
    child.stderr.on('data', (d) => err.push(d as Buffer));
    child.on('error', (e) =>
      reject(new Error(`${cmd} failed to start (is it installed?): ${e.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err).toString().slice(-500)}`));
    });
  });
}

export interface MediaInfo {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}

/** Probe duration / dimensions / audio presence with ffprobe. */
export async function probeMedia(filePath: string): Promise<MediaInfo> {
  const stdout = await run(FFPROBE, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const json = JSON.parse(stdout.toString() || '{}') as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const video = json.streams?.find((s) => s.codec_type === 'video');
  const hasAudio = Boolean(json.streams?.some((s) => s.codec_type === 'audio'));
  const duration = json.format?.duration ? Number(json.format.duration) : null;
  return {
    durationSec: duration && Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio,
  };
}

/** Extract a single JPEG frame at `timeSec`, returned as a Buffer. */
export async function extractFrame(filePath: string, timeSec: number): Promise<Buffer> {
  return run(FFMPEG, [
    '-ss',
    Math.max(0, timeSec).toString(),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    '-f',
    'image2',
    '-c:v',
    'mjpeg',
    'pipe:1',
  ]);
}

/**
 * Extract a downscaled 9x8 grayscale frame as raw bytes (72 bytes) for dHash.
 * 9 wide so each row yields 8 adjacent-pixel comparisons → 64-bit hash.
 */
export async function extractGray9x8(filePath: string, timeSec: number): Promise<Buffer> {
  return run(FFMPEG, [
    '-ss',
    Math.max(0, timeSec).toString(),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-vf',
    'scale=9:8',
    '-pix_fmt',
    'gray',
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
}

/** Extract mono 16kHz low-bitrate MP3 audio to `destPath` (small for Whisper). */
export async function extractAudio(filePath: string, destPath: string): Promise<void> {
  await run(FFMPEG, [
    '-i',
    filePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '32k',
    '-y',
    destPath,
  ]);
}

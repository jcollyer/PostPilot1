import { createReadStream } from 'node:fs';
import { join } from 'node:path';

import { getOpenAI, TRANSCRIBE_MODEL } from '../config';
import { extractAudio } from '../ffmpeg';
import type { MediaInfo } from '../ffmpeg';

/**
 * Transcribe a video's speech with Whisper. Returns null when the clip has no
 * audio track (common for drone/B-roll) — the rest of the pipeline degrades
 * gracefully and leans on the visual frames instead.
 */
export async function transcribeVideo(params: {
  localPath: string;
  info: MediaInfo;
  tmpDir: string;
}): Promise<string | null> {
  if (!params.info.hasAudio) return null;

  const audioPath = join(params.tmpDir, 'audio.mp3');
  try {
    await extractAudio(params.localPath, audioPath);
  } catch {
    return null; // no usable audio
  }

  const result = await getOpenAI().audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: TRANSCRIBE_MODEL,
    response_format: 'text',
  });

  const text = typeof result === 'string' ? result : ((result as { text?: string }).text ?? '');
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

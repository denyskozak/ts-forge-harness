import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { SPEECH_LANGUAGES } from '../shared/types';

const execute = promisify(execFile);
let active: AbortController | undefined;
export async function speechStatus() {
  const candidates = process.env.FORGE_WHISPER_BIN
    ? [process.env.FORGE_WHISPER_BIN]
    : ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];
  const binary = (
    await Promise.all(
      candidates.map(async (file) => {
        try {
          await access(file, constants.X_OK);
          return file;
        } catch {
          return undefined;
        }
      }),
    )
  ).find(Boolean);
  const model =
    process.env.FORGE_WHISPER_MODEL ||
    path.join(homedir(), '.cache', 'ts-forge', 'whisper', 'ggml-base.bin');
  if (!binary)
    return {
      ready: false,
      error: 'Install whisper.cpp with brew install whisper-cpp, then restart Forge.',
    };
  try {
    await access(model, constants.R_OK);
  } catch {
    return {
      ready: false,
      error:
        'Download the multilingual ggml-base.bin model. See README: Local voice input, or set FORGE_WHISPER_MODEL before starting Forge.',
    };
  }
  return { ready: true, binary, model };
}

export function validateSpeechAudio(value: unknown): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error('Expected PCM WAV audio.');
  const wav = Buffer.from(value);
  if (
    wav.length < 44 ||
    wav.length > 44 + 16000 * 2 * 120 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    wav.readUInt32LE(16) !== 16 ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.readUInt32LE(24) !== 16000 ||
    wav.readUInt32LE(28) !== 32000 ||
    wav.readUInt16LE(32) !== 2 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.toString('ascii', 36, 40) !== 'data' ||
    wav.readUInt32LE(40) !== wav.length - 44 ||
    wav.readUInt32LE(4) !== wav.length - 8 ||
    (wav.length - 44) % 2 !== 0
  ) {
    throw new Error('Audio must be mono 16 kHz PCM WAV, at most two minutes.');
  }
  return wav;
}

export function cancelSpeech() {
  active?.abort();
}

export async function transcribeSpeech(value: unknown, language: unknown) {
  if (active) throw new Error('Voice transcription is already running.');
  if (
    typeof language !== 'string' ||
    !['en-US', ...SPEECH_LANGUAGES.map((item) => item.value)].includes(language)
  )
    throw new Error('Unsupported voice language.');
  const wav = validateSpeechAudio(value);
  // Whisper can hallucinate short phrases on digital silence. Do not infer on it.
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2)
    peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  if (peak <= 2) return '';
  const controller = new AbortController();
  active = controller;
  let directory: string | undefined;
  try {
    const status = await speechStatus();
    if (!status.ready || !status.binary || !status.model) throw new Error(status.error);
    directory = await mkdtemp(path.join(tmpdir(), 'forge-speech-'));
    const input = path.join(directory, 'audio.wav');
    const output = path.join(directory, 'transcript');
    await writeFile(input, wav, { mode: 0o600 });
    const { stderr } = await execute(
      status.binary,
      [
        '-m',
        status.model,
        '-f',
        input,
        '-l',
        language === 'auto' ? 'en' : language.split('-')[0],
        '-otxt',
        '-of',
        output,
        '-nt',
        '-t',
        '4',
      ],
      {
        signal: controller.signal,
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
    ).catch((error: NodeJS.ErrnoException & { killed?: boolean }) => {
      if (controller.signal.aborted) throw new Error('Voice transcription was cancelled.');
      if (error.killed) throw new Error('Local transcription timed out. Try a shorter recording.');
      throw new Error('Whisper could not run. Check the installed whisper-cli and model file.');
    });
    const text = (await readFile(output + '.txt', 'utf8')).trim();
    if (text.length > 16000) throw new Error('Transcription exceeded the text limit.');
    if (!text && /error/i.test(stderr))
      throw new Error('Whisper could not transcribe the recording.');
    return text;
  } finally {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      if (active === controller) active = undefined;
    }
  }
}

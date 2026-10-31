import { _electron as electron, expect } from '@playwright/test';
import electronPath from 'electron';
import { mkdtemp, mkdir, rm, access, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The upstream whisper.cpp JFK sample is human speech, injected as the microphone.
// Recording, decoding, IPC and inference all use the real production implementation.
const audio =
  process.env.FORGE_VOICE_FIXTURE || path.join(os.homedir(), '.cache/ts-forge/whisper/jfk.wav');
await access(audio);
const data = await mkdtemp(path.join(os.tmpdir(), 'forge-voice-live-'));
let app;
try {
  app = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test', FORGE_TEST_DATA: data },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const status = await page.evaluate(() => window.forge.speechStatus());
  if (!status.ready) throw new Error(status.error);
  const composer = page.getByRole('textbox', { name: 'Message Forge' });
  await page.evaluate(
    async (bytes) => {
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer);
      const destination = context.createMediaStreamDestination();
      // Only the microphone source is replaced. All recorder/decoder/IPC/model code is real.
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => {
          await context.resume();
          const source = context.createBufferSource();
          source.buffer = decoded;
          source.loop = true;
          source.connect(destination);
          source.start();
          window.__fixtureSource = source;
          return destination.stream;
        },
      });
    },
    Array.from(await readFile(audio)),
  );
  await composer.fill('Draft:');
  await page.getByRole('button', { name: 'Start voice input' }).click();
  await expect(page.getByRole('button', { name: 'Stop voice input' })).toBeEnabled();
  await page.waitForTimeout(13000);
  await expect(composer).toHaveValue('Draft:');
  await page.getByRole('button', { name: 'Stop voice input' }).click();
  await expect(page.getByRole('button', { name: 'Start voice input' })).toBeVisible({
    timeout: 120000,
  });
  console.log('Draft after transcription:', await composer.inputValue());
  console.log('Notifications:', await page.locator('.toast').allTextContents());
  await expect(composer).toHaveValue(/Draft:.*ask not what your country can do for you/is, {
    timeout: 5000,
  });
  await expect(page.getByRole('button', { name: 'Start voice input' })).toBeVisible();
  if (errors.length) throw new Error(errors.join('\n'));
  const state = await page.evaluate(() => window.forge.state());
  if (state.sessions.length) throw new Error('Voice input unexpectedly sent a task.');
  const transcript = await composer.inputValue();
  await mkdir('.forge-test-results', { recursive: true });
  await page.screenshot({ path: '.forge-test-results/voice-live.png' });
  await writeFile(
    '.forge-test-results/voice-live.json',
    JSON.stringify({ transcript, errors, passed: true }, null, 2),
  );
  console.log(
    'PASS: real audio → MediaRecorder → PCM WAV → IPC → whisper.cpp → editable draft\n' +
      transcript,
  );
} finally {
  await app?.close();
  await rm(data, { recursive: true, force: true });
}

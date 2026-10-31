import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeVoiceWav } from '../src/voice-audio';
import { validateSpeechAudio, transcribeSpeech } from '../electron/speech';

test('voice WAV is bounded mono PCM and clamps microphone samples', () => {
  const wav = encodeVoiceWav(new Float32Array([-2, -1, 0, 1, 2]));
  const valid = validateSpeechAudio(wav);
  assert.equal(valid.readUInt32LE(24), 16000);
  assert.equal(valid.readInt16LE(44), -32768);
  assert.equal(valid.readInt16LE(52), 32767);
});
test('rejects malformed, oversized and unsupported audio before running a process', async () => {
  assert.throws(() => validateSpeechAudio('not audio'));
  assert.throws(() => validateSpeechAudio(new Uint8Array(2)));
  const wrongRate = encodeVoiceWav(new Float32Array(10));
  new DataView(wrongRate.buffer).setUint32(24, 48000, true);
  assert.throws(() => validateSpeechAudio(wrongRate));
  assert.throws(() => validateSpeechAudio(encodeVoiceWav(new Float32Array(16000 * 121))));
  await assert.rejects(
    transcribeSpeech(encodeVoiceWav(new Float32Array(10)), '--output=bad'),
    /language/,
  );
});

test('digital silence produces no invented transcript and needs no model', async () => {
  assert.equal(await transcribeSpeech(encodeVoiceWav(new Float32Array(16000)), 'auto'), '');
});

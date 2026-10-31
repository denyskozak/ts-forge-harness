import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { SpeechLanguage } from '../../shared/types';
import { api } from '../api';
import { recordingToWav } from '../voice-audio';

export function useVoiceInput({
  language,
  onTranscript,
  onError,
}: {
  language: SpeechLanguage;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'listening' | 'stopping'>('idle');
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioRef = useRef<AudioContext | undefined>(undefined);
  const animationRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const callbacks = useRef({ onTranscript, onError });
  callbacks.current = { onTranscript, onError };
  const stopVisualization = useCallback(() => {
    clearTimeout(timerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    void audioRef.current?.close().catch(() => {});
    audioRef.current = undefined;
  }, []);
  const drawWaveform = useCallback((analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animationRef.current = requestAnimationFrame(() => drawWaveform(analyser));
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(samples);
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth * ratio;
      const height = canvas.clientHeight * ratio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#c79b78';
      const bars = 22;
      const gap = 2 * ratio;
      const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
      for (let index = 0; index < bars; index++) {
        const sample = samples[Math.floor((index / bars) * samples.length)] / 255;
        const barHeight = Math.max(2 * ratio, sample * height * 0.9);
        context.globalAlpha = 0.45 + sample * 0.55;
        context.fillRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
      }
      context.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const token = ++generation.current;
    setState('starting');
    try {
      const status = await api.speechStatus();
      if (token !== generation.current) return;
      if (!status.ready)
        throw new Error(status.error || 'Local speech recognition is not configured.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (token !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const audio = new AudioContext();
      audioRef.current = audio;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      audio.createMediaStreamSource(stream).connect(analyser);
      await audio.resume();
      if (token !== generation.current) return;
      drawWaveform(analyser);
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        generation.current++;
        busy.current = false;
        stopVisualization();
        setState('idle');
        callbacks.current.onError('Microphone recording failed. Please try again.');
      };
      recorder.onstop = async () => {
        if (token !== generation.current) return;
        stopVisualization();
        setState('stopping');
        try {
          const wav = await recordingToWav(new Blob(chunks, { type: recorder.mimeType }));
          if (token !== generation.current) return;
          const text = await api.transcribeSpeech(wav, language);
          if (token !== generation.current) return;
          if (text.trim()) callbacks.current.onTranscript(text);
          else callbacks.current.onError('No speech was detected. Please try again.');
        } catch (error) {
          if (token === generation.current) callbacks.current.onError((error as Error).message);
        } finally {
          if (token === generation.current) {
            busy.current = false;
            recorderRef.current = undefined;
            setState('idle');
          }
        }
      };
      recorder.start(1000);
      setState('listening');
      timerRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 120000);
    } catch (error) {
      if (token === generation.current) {
        stopVisualization();
        busy.current = false;
        setState('idle');
        callbacks.current.onError((error as Error).message);
      }
    }
  }, [drawWaveform, language, stopVisualization]);
  const stop = useCallback(() => {
    if (recorderRef.current?.state !== 'recording') return;
    setState('stopping');
    recorderRef.current.stop();
  }, []);
  useEffect(
    () => () => {
      generation.current++;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state === 'recording') recorder.stop();
      }
      stopVisualization();
      void api.cancelSpeech().catch(() => {});
    },
    [stopVisualization],
  );
  return {
    canvasRef: canvasRef as RefObject<HTMLCanvasElement>,
    state,
    active: state !== 'idle',
    start,
    stop,
  };
}

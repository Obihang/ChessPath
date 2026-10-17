import { CoachMode } from '../types/chess';

/**
 * Utility functions for PCM audio processing, WAV header creation,
 * markdown stripping, length cap enforcement, and move classification.
 */

/**
 * Converts raw PCM audio bytes (16-bit mono) into a valid WAV ArrayBuffer with a 44-byte RIFF header.
 */
export function pcmToWav(
  pcmBuffer: ArrayBuffer,
  sampleRate: number = 24000,
  numChannels: number = 1
): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcmBuffer);
  const pcmLength = pcmBytes.length;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, pcmLength, true);

  // Write PCM data
  new Uint8Array(wavBuffer, 44).set(pcmBytes);

  return wavBuffer;
}

/**
 * Converts base64 string to ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Strips markdown, bullet points, headers, bold, italics, code blocks, etc.
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#~]/g, '')
    .replace(/^[\s-•*+>]+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Enforces strict word and sentence count caps per coach mode.
 */
export function enforceLengthCaps(rawText: string, mode: CoachMode): string {
  if (!rawText) return '';
  let clean = stripMarkdown(rawText).replace(/\s+/g, ' ').trim();

  let maxWords = 30;
  let maxSentences = 2;

  switch (mode) {
    case 'learning':
      maxSentences = 2;
      maxWords = 30;
      break;
    case 'criticizing':
      maxSentences = 2;
      maxWords = 25;
      break;
    case 'simple':
      maxSentences = 1;
      maxWords = 12;
      break;
    case 'competitive':
      maxSentences = 2;
      maxWords = 15;
      break;
  }

  // 1. Truncate by sentence limit if matching punctuation exists
  const sentenceMatches = clean.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (sentenceMatches && sentenceMatches.length > 0) {
    clean = sentenceMatches.slice(0, maxSentences).join('').trim();
  } else {
    const parts = clean.split(/[.!?]/).filter(Boolean);
    clean = parts.slice(0, maxSentences).join('. ').trim();
  }

  // 2. Truncate by word limit
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    clean = words.slice(0, maxWords).join(' ');
  }

  if (clean && !clean.endsWith('.') && !clean.endsWith('!') && !clean.endsWith('?')) {
    clean += '.';
  }

  return clean;
}

/**
 * Classifies move based on centipawn loss and engine flags.
 */
export function classifyMoveThresholds(
  cpLoss: number,
  isBestMove: boolean = false,
  isSacrifice: boolean = false
): 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' {
  if (isBestMove || (isSacrifice && cpLoss <= 25)) {
    return 'great';
  }
  if (cpLoss > 250) {
    return 'blunder';
  }
  if (cpLoss > 100) {
    return 'mistake';
  }
  if (cpLoss > 50) {
    return 'inaccuracy';
  }
  return 'good';
}

export interface PcmProcessingOptions {
  sampleRate?: number; // default 24000
  isFirstChunk?: boolean;
  isLastChunk?: boolean;
  isFullClip?: boolean;
}

/**
 * Processes raw 16-bit little-endian mono PCM audio:
 * 1. Guarantees even byte length.
 * 2. Converts to Float32Array directly (no WAV round trip).
 * 3. Trims the last 120 ms (2880 samples at 24000 Hz) if isLastChunk / isFullClip.
 * 4. Applies a 20 ms fade-in (480 samples) if isFirstChunk / isFullClip.
 * 5. Applies an 80 ms fade-out (1920 samples) if isLastChunk / isFullClip.
 */
export function processPcmToFloat32(
  pcmBuffer: ArrayBuffer,
  options: PcmProcessingOptions = {}
): Float32Array {
  const sampleRate = options.sampleRate || 24000;
  const isFirst = options.isFirstChunk ?? options.isFullClip ?? true;
  const isLast = options.isLastChunk ?? options.isFullClip ?? true;

  let bytes = new Uint8Array(pcmBuffer);
  // Ensure even byte length (16-bit = 2 bytes per sample)
  if (bytes.byteLength % 2 !== 0) {
    bytes = bytes.subarray(0, bytes.byteLength - 1);
  }

  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalSamples = bytes.byteLength / 2;

  if (totalSamples === 0) {
    return new Float32Array(0);
  }

  // 120 ms trim at 24000 Hz = 2880 samples
  const trimSamples = isLast ? Math.round(0.12 * sampleRate) : 0;
  const usableSamples = Math.max(0, totalSamples - trimSamples);

  const float32 = new Float32Array(usableSamples);

  for (let i = 0; i < usableSamples; i++) {
    const val = dataView.getInt16(i * 2, true);
    float32[i] = val < 0 ? val / 32768.0 : val / 32767.0;
  }

  if (float32.length === 0) {
    return float32;
  }

  // 20 ms fade-in at 24000 Hz = 480 samples
  if (isFirst) {
    const fadeInSamples = Math.round(0.02 * sampleRate); // 480
    const fadeLen = Math.min(fadeInSamples, float32.length);
    for (let i = 0; i < fadeLen; i++) {
      float32[i] *= i / fadeInSamples;
    }
  }

  // 80 ms fade-out at 24000 Hz = 1920 samples
  if (isLast) {
    const fadeOutSamples = Math.round(0.08 * sampleRate); // 1920
    const startFadeOut = Math.max(0, float32.length - fadeOutSamples);
    const fadeOutLen = float32.length - startFadeOut;
    if (fadeOutLen > 0) {
      for (let i = startFadeOut; i < float32.length; i++) {
        const samplesFromEnd = float32.length - 1 - i;
        float32[i] *= samplesFromEnd / fadeOutSamples;
      }
    }
  }

  return float32;
}

/**
 * Dev-only test for PCM processing pipeline.
 * Validates even byte length enforcement, 120 ms trimming, 20 ms fade-in, 80 ms fade-out,
 * and zero-crossing at end (no sample discontinuity).
 */
export function testPcmProcessingPipeline(): {
  success: boolean;
  originalBytes: number;
  processedSamples: number;
  lastSampleValue: number;
  message: string;
} {
  // Create synthetic 16-bit PCM buffer with 20001 bytes (odd byte length!)
  const sampleCount = 10000;
  const oddByteLength = sampleCount * 2 + 1; // 20001 bytes
  const syntheticBuffer = new ArrayBuffer(oddByteLength);
  const view = new DataView(syntheticBuffer);

  // Fill with 440 Hz sine wave at full amplitude
  for (let i = 0; i < sampleCount; i++) {
    const sampleVal = Math.floor(Math.sin((2 * Math.PI * 440 * i) / 24000) * 30000);
    view.setInt16(i * 2, sampleVal, true);
  }
  // Set odd last byte
  new Uint8Array(syntheticBuffer)[oddByteLength - 1] = 0xff;

  const float32 = processPcmToFloat32(syntheticBuffer, { isFullClip: true });

  // Expected samples: 10000 - 2880 (120ms trim) = 7120 samples
  const expectedSamples = sampleCount - 2880;
  const passedLength = float32.length === expectedSamples;

  // Check fade-in at index 0
  const passedFadeIn = Math.abs(float32[0]) === 0;

  // Check fade-out at end (last sample should be 0.0)
  const lastSampleVal = float32[float32.length - 1];
  const passedFadeOut = Math.abs(lastSampleVal) < 0.0001;

  const success = passedLength && passedFadeIn && passedFadeOut;

  const message = success
    ? `PCM Pipeline Test PASSED: Odd bytes (20001 -> 20000) converted to Float32 (${float32.length} samples after 120ms trim). Fade-in (0.0) and zero-discontinuity fade-out (${lastSampleVal.toFixed(6)}) verified.`
    : `PCM Pipeline Test FAILED: expected ${expectedSamples} samples, got ${float32.length}, last sample ${lastSampleVal}`;

  return {
    success,
    originalBytes: oddByteLength,
    processedSamples: float32.length,
    lastSampleValue: lastSampleVal,
    message,
  };
}

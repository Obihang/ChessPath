/**
 * Utility functions for PCM audio processing, WAV header creation,
 * markdown stripping, and move classification.
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

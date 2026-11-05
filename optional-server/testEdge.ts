import {
  CHROMIUM_FULL_VERSION,
  SEC_MS_GEC_VERSION,
  TRUSTED_CLIENT_TOKEN,
  generateSecMsGec,
} from './edgeDrm';
import { synthesizeEdgeMp3, hasValidMp3Header } from './edgeTtsServer';

async function runEdgeTest() {
  console.log('=== Optional Edge Neural TTS Protocol Test ===');
  console.log(`Chromium Version : ${CHROMIUM_FULL_VERSION}`);
  console.log(`Sec-MS-GEC-Ver   : ${SEC_MS_GEC_VERSION}`);
  console.log(`Trusted Token    : ${TRUSTED_CLIENT_TOKEN}`);

  const token = generateSecMsGec();
  if (!/^[0-9A-F]{64}$/.test(token)) {
    throw new Error(`Invalid Sec-MS-GEC token format: ${token}`);
  }
  console.log(`Generated Token  : ${token}`);

  const text = 'Knight to f3 develops a piece toward the center.';
  const voice = 'en-US-AndrewNeural';
  console.log(`Requesting Edge TTS audio for voice "${voice}"...`);

  const mp3Buffer = await synthesizeEdgeMp3(text, voice, 8000);
  if (!hasValidMp3Header(mp3Buffer)) {
    throw new Error(
      `Expected valid MP3 header (ID3 or 0xFF 0xFB/0xF3), got first bytes: ${mp3Buffer
        .subarray(0, 4)
        .toString('hex')}`
    );
  }

  console.log(
    `✓ Edge TTS test passed: received ${mp3Buffer.length} bytes with valid MP3 header (0x${mp3Buffer
      .subarray(0, 4)
      .toString('hex')})`
  );
}

runEdgeTest().catch((err) => {
  console.error('❌ Edge TTS test failed:', err?.message || err);
  process.exit(1);
});

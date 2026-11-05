# Optional Edge Neural TTS Proxy Server

ChessPath works out-of-the-box as a 100% static web app (GitHub Pages) and standalone Android APK (Capacitor) using **Gemini TTS** (official API with the user's API key in Settings) and **Standard Device TTS** (offline browser speech synthesis).

This folder contains the standalone, self-hostable Microsoft Edge Read Aloud WebSocket proxy (`optional-server/`). It is **not** part of the main app build or CI.

## Constants (`edgeDrm.ts`)
Synchronized with [`rany2/edge-tts`](https://github.com/rany2/edge-tts):
- `TRUSTED_CLIENT_TOKEN`: `6A5AA1D4EAFF4E9FB37E23D68491D6F4`
- `CHROMIUM_FULL_VERSION`: `143.0.3650.75`
- `SEC_MS_GEC_VERSION`: `1-143.0.3650.75`

## Usage

### 1. Run the Server
From the repository root (or inside `optional-server/`):
```bash
npx tsx optional-server/edgeTtsServer.ts
```
By default, it listens on `http://localhost:8787` and accepts `GET /?voice=en-US-AndrewNeural&text=Hello`.

### 2. Verify MP3 Header (`test:edge`)
```bash
npm --prefix optional-server run test:edge
```
This connects to the Edge Read Aloud WebSocket endpoint, synthesizes a sample chess coaching phrase, and verifies that the response starts with a valid MP3 frame sync (`0xFF 0xFB` / `0xFF 0xF3`) or `ID3` header.

### 3. Configure in ChessPath
Host this server behind an `https://` endpoint you control, then open **ChessPath → Settings → Voice proxy URL** and enter your `https://` URL. Once an `https://` URL is configured, the **Edge Neural TTS (Custom Proxy)** option becomes available in the Speech Engine selector. If the proxy ever returns an error or becomes unreachable, ChessPath displays the exact error and automatically falls back to **Gemini TTS**.

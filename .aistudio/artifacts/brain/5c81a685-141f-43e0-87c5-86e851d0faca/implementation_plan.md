# ChessPath: Comprehensive Offline Chess Academy & Training Suite

A personalized, 100% static, zero-backend chess learning progressive web application (PWA) and native Android application (via Capacitor) designed to deploy seamlessly to GitHub Pages, build into offline Android APKs, run completely offline, and guide players from beginner rules through tactical mastery, openings, gambits, and interactive AI voice coaching.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following enhancements and requirements have been incorporated into the project roadmap:
> 1. **Static Architecture & Direct Gemini API**: 100% static React/Vite SPA deployable to GitHub Pages. Optional client-side Gemini calls using a user-supplied API key saved strictly in `localStorage`. All non-AI features work fully offline.
> 2. **Locally Bundled Offline Stockfish**: Bundled in `/public/engine/` and precached via service worker and embedded in the APK assets.
> 3. **Beginner Engine Elo Calibration**: Skill Level 0 with shallow depths and occasional deliberate blunders for <1300 Elo.
> 4. **Runtime Line Validation**: Runtime validation of all puzzle and opening moves using `chess.js`.
> 5. **Freely Licensed SVG Pieces**: Standard Cburnett vector chess pieces with licensing attribution in the README.
> 6. **Voice Coach Integration**:
>    - Offline Web Speech API TTS by default + optional Gemini Natural Voice (`gemini-3.8-flash-lite-tts`).
>    - Phonetic chess notation converter (`Nf3` $\rightarrow$ "knight to f3", `O-O` $\rightarrow$ "castles kingside", `exd5` $\rightarrow$ "pawn takes on d5").
>    - Voice input with dual support: Capacitor speech recognition on Android with graceful fallback to browser Web Speech API.
>    - Speech concurrency control: auto-cancellation on new messages or player board moves.
> 7. **Stage 7 Android APK & Desktop Packaging**:
>    - **Dual Build Targets**: Switchable via `VITE_TARGET` (`pages` uses repo subpath base; `android` uses relative `./` base).
>    - **Capacitor Android Integration**: Native APK project with all assets and Stockfish single-threaded WASM bundled in `android/app/src/main/assets/public/`.
>    - **GitHub Actions Workflow**: Builds debug APK automatically on every push and uploads as a downloadable workflow artifact (no keystores or secrets committed).
>    - **Mobile/Android Polish**: Native dark slate status bar styling, splash screen, hardware back button listener, and Screen Wake Lock during active games.
> 8. **Staged Implementation**: We will build and test in modular stages, pausing immediately after Stage 1 for your review before proceeding to subsequent stages.

---

## 1. Overview & Core Concept

- **What It Does**: ChessPath provides a comprehensive, structured chess curriculum, openings and gambits library, tactical puzzles, adjustable offline engine play, pass-and-play, and an encouraging voice coach in a lightweight, installable web app and native Android APK.
- **Target Audience**: Beginners through intermediate and advanced players wanting an accessible, distraction-free chess tutor on web, desktop, and mobile.
- **Key Value**: Works 100% offline, requires no accounts, requires no subscriptions, and is completely free and open-source.

---

## 2. Voice Coach & Android Hardware Integration

### Dual-Tier Speech Engine
- **Spoken Audio**: Web Speech API `window.speechSynthesis` by default; optional `gemini-3.8-flash-lite-tts` with local audio caching.
- **Phonetic Conversion**: Automatically translates algebraic chess moves to natural English speech.
- **Microphone Input**: Checks for Capacitor speech recognition plugin when running native on Android; falls back to browser `webkitSpeechRecognition` / `SpeechRecognition`; hides mic button cleanly when unavailable.
- **Screen Wake Lock**: Activates `navigator.wakeLock.request('screen')` during active Play games to prevent mobile screens from dimming during calculation.
- **Hardware Back Button**: Listens for Android back button events (via `@capacitor/app` or history stack) to close modals, dismiss coach drawers, or navigate back cleanly.

---

## 3. Staged Development & Testing Roadmap

### Stage 1: Core Board, Play Modes & Settings *(Current Target — Pausing Here For Testing)*
- **Interactive Board**: Fluid tap-to-move AND drag-and-drop, legal move dots, capture indicators, check alerts, last-move highlights, and pawn promotion modal.
- **Rules Engine**: `chess.js` integration for move generation, FEN/PGN serialization, threefold repetition, 50-move rule, stalemate, and checkmate.
- **Play Mode — Vs AI**:
  - Color selection: White, Black, or Random.
  - Difficulty presets: Beginner (800–1200 Elo with Skill Level 0, shallow depth & deliberate weak moves), Intermediate (1300–1700 Elo), Advanced (1800–2200+ Elo).
  - Time controls: Untimed, Blitz 3+2, Blitz 5+3, Rapid 10+0.
  - Stockfish Web Worker running locally from `public/engine/`.
- **Play Mode — Pass-and-Play**:
  - Dual chess clocks with increment.
  - Optional board auto-flip each turn.
  - Move list with algebraic notation, takeback/undo toggle, and PGN export.
- **Settings Screen**:
  - Board theme selector (Walnut/Maple, Forest Green, Slate Blue).
  - Sound effects toggle (synthesized Web Audio oscillator beeps/thumps).
  - Coordinates toggle (algebraic labels on borders).
  - Voice coach settings (voice on/off, speech rate, volume, natural voice toggle).
  - Gemini API key input (saved strictly in `localStorage`).
- **Pause & Verification**: Deliver Stage 1, verify compile, test board responsiveness and bot play, and await your testing feedback!

### Stage 2: Learn Curriculum (Levels 1–3 Seeded)
- Complete structured lessons for Levels 1 (Absolute Basics), 2 (Fundamentals), and 3 (Tactics).
- Interactive challenge board per lesson with instant validation, step-by-step nudges, spoken mentor audio, and end-of-lesson quizzes.
- Free progression (skip ahead allowed).

### Stage 3: Openings and Gambits Library
- 20+ major openings and 15+ rich gambits with ideas, pawn structures, traps, and variations.
- Runtime validation of all moves via `chess.js`.
- "Train this line" spaced repetition trainer.

### Stage 4: Practice & Tactics Puzzles
- Thematic puzzles (forks, pins, skewers, discovered checks, smothered mate, back-rank mate).
- Daily puzzle, Puzzle Rush survival mode, and endgame drills (Lucena, Philidor, King+Pawn).

### Stage 5: Gemini AI Coach & Voice Chat
- Position-aware explanations, subtle hints, game review blunder summaries, and opening quizzes.
- Integrated voice input (microphone) and spoken audio playback with phonetic notation conversion.
- Friendly "Add your key in Settings" notice with zero degradation of offline features when no key is present.

### Stage 6: Progress, PWA & Web Packaging
- Progress dashboard with Elo tracking and JSON backup export/import.
- `vite-plugin-pwa` offline precaching (including engine assets) and in-app install prompt.
- Screen Wake Lock during active play.

### Stage 7: Android APK & Desktop Packaging
- `capacitor.config.ts` configuration and Android project scaffold.
- Configurable base path in `vite.config.ts` (`VITE_TARGET=pages` vs `VITE_TARGET=android`).
- GitHub Actions CI workflow (`.github/workflows/build-apk.yml`) building debug APK and uploading workflow artifacts on push.
- Android polish: status bar styling, splash screen, hardware back button handler.
- Comprehensive `README.md` with: local setup, GitHub Pages deployment, Android APK local building and sideloading, downloading artifacts from GitHub Actions, PWA desktop install guide, and piece licensing attribution.

---

## 4. Technical Architecture (Static SPA & Capacitor)

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ChessPath Hybrid Application Canvas                  │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                          Top App Bar                           │   │
│   │   [ ChessPath ]    [ Mode Selector ]    [ Settings / Install ] │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────┴────────────────────────────────┐   │
│   │                     Active View Container                      │   │
│   │     Play (Vs AI / Pass-and-Play) · Learn · Openings · Practice │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────┼────────────────────────────────┐   │
│   │                               ▼                                │   │
│   │                   Shared Interactive Board                     │   │
│   │       (Cburnett SVG Pieces · Tap/Drag · Web Audio SFX)         │   │
│   └────────────────────────────────────────────────────────────────┘   │
│            │                 │                 │                       │
│            ▼                 ▼                 ▼                       │
│   ┌─────────────────┐ ┌──────────────┐ ┌───────────────┐               │
│   │  chess.js Logic │ │ Stockfish WW │ │ Speech Engine │               │
│   │ (Legal Moves)   │ │ (Local WASM) │ │ (Web/Capacitor│               │
│   └─────────────────┘ └──────────────┘ └───────────────┘               │
│                                                │                       │
│                                                ▼                       │
│                                      ┌──────────────────┐              │
│                                      │ Gemini Client SDK│              │
│                                      │ (Optional AI)    │              │
│                                      └──────────────────┘              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                    Targets: Web PWA · Android APK
```

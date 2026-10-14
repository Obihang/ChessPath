# ChessPath — Free Offline Chess Academy & AI Coach

**ChessPath** is a personalized, completely free chess learning progressive web application (PWA) and native Android application. It takes players from absolute beginner fundamentals through grandmaster openings, gambits, tactical mastery, and offline engine play with an encouraging voice coach.

- **No accounts or sign-ups**
- **No ads, trackers, or paywalls**
- **100% offline & client-side** (runs in your browser and on your phone)
- **Local Stockfish 19 Lite WASM engine** (single-threaded with embedded NNUE network) and background Web Worker Minimax fallback

---

## ♟ Features

### 1. Structured Curriculum (Learn)
- **Level 1 (Absolute Basics)**: The board, coordinates, piece movement & captures, check vs checkmate, stalemate, castling, en passant, pawn promotion, piece values, and algebraic notation.
- **Level 2 (Fundamentals)**: Golden opening principles, center control, knight/bishop development, king safety, ladder mate, queen & king checkmate, rook & king checkmate, and passed pawn square rule.
- **Level 3 (Tactics)**: Knight forks, absolute & relative pins, skewers, discovered attacks, double check, smothered mate, Arabian mate, deflections, clearance sacrifices, and mating patterns.
- **Levels 4–6**: Strategy, master endgames, and advanced calculation frameworks.
- Interactive demonstration board for every lesson with instant feedback, progressive hints, and level mastery quizzes.

### 2. Openings & Gambits Library
- **20+ Major Openings**: Italian Game, Ruy Lopez, Sicilian Defense (Najdorf/Dragon), French, Caro-Kann, Scandinavian, Four Knights, Queen's Gambit, King's Indian, Nimzo-Indian, London System, Grünfeld, Dutch, English, and Réti.
- **18+ Rich Gambits**: King's Gambit, Evans Gambit, Danish, Scotch Gambit, Vienna, Smith-Morra, Benko, Budapest, Albin Counter, Blackmar-Diemer, Englund, Latvian, Halloween, Fried Liver Attack, Marshall Attack, Stafford, and Grob.
- **Interactive Move Stepper**: Step through lines forward and backward with plain-language explanations of pawn levers, key squares, and traps.
- **Spaced Repetition (SRS) Trainer**: Train openings from memory; weak lines are automatically scheduled for review.

### 3. Play Modes
- **Vs Computer (Offline Engine)**: Real Stockfish 19 Lite WASM running client-side with calibrated UCI Elo and skill levels: Beginner (Level 0, 1320 Elo with shallow search & deliberate blunder rate), Casual (Level 2, 1450 Elo), Intermediate (Level 6, 1750 Elo), Advanced (Level 12, 2100 Elo), up to Master (Level 20, 2500+ Elo). Untimed or timed (Blitz 3+2, Blitz 5+3, Rapid 10+0). Supported by a non-blocking background Minimax Web Worker fallback.
- **Pass & Play**: Two players on one device with dual clocks, increments, auto-flip option, move history, takebacks, and PGN export.

### 4. Practice & Tactics
- **Curated Tactics**: Puzzles categorized by motif (Forks, Pins, Skewers, Discovered Attacks, Mate-in-1, Mate-in-2, Smothered Mate, Endgames) with Elo estimation.
- **Daily Tactical Challenge**: Fresh puzzle every calendar day.
- **Puzzle Rush**: 3-minute survival sprint with 3 strikes.
- **Endgame Drills**: Convert winning endgame positions (King & Queen, Two Rooks, King & Rook, King & Pawn opposition) against the computer.

### 5. AI Voice Coach (Gemini)
- **Position Explanations**: Evaluates the current board and explains ideas in plain English.
- **Tactical Hints**: Nudges you in the right direction without spoiling the move.
- **Post-Game Review**: Identifies mistakes and provides 2–3 key lessons.
- **Dual-Tier Speech**: Web Speech API (`speechSynthesis`) offline by default + optional Gemini Natural Voice (`gemini-3.8-flash-lite-tts`).
- **Phonetic Notation**: Converts chess notation to spoken English (e.g., *Nf3* $\rightarrow$ "knight to f3", *O-O* $\rightarrow$ "castles kingside", *exd5* $\rightarrow$ "pawn takes on d5").
- **Voice Input**: Microphone button in chat using Web Speech recognition.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+ and npm

### Installation
```bash
git clone https://github.com/Obihang/ChessPath.git
cd ChessPath
npm install
```

### Running Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Setting up the Gemini AI Coach

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. Open ChessPath, click the **Settings** (gear) icon in the top right.
3. Paste your key in the **Gemini AI Tutor Key** field.
4. Your key is stored only in the browser's `localStorage` and sent only to Google's Gemini API when AI features are used, never to any other server and never committed to Git.
5. *Note: If no key is set, all non-AI features (rules, lessons, puzzles, offline Stockfish, openings) work 100% free and offline.*

---

## 🌐 Deploying to GitHub Pages

ChessPath is a 100% static client-side single-page app (SPA) that deploys directly to GitHub Pages.

### Option A: Using the `gh-pages` Branch
1. In your repository, install `gh-pages`:
   ```bash
   npm install -D gh-pages
   ```
2. In `package.json`, add:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```
3. Set your repository name base path in `vite.config.ts` or deploy with:
   ```bash
   VITE_BASE_PATH="/ChessPath/" npm run deploy
   ```
4. In your GitHub repo settings $\rightarrow$ **Pages**, set Source to `gh-pages` branch.

### Option B: Automatic GitHub Actions
Pushing to the `main` branch automatically triggers `.github/workflows/deploy.yml`, which builds the app with base path `/ChessPath/` and deploys it to GitHub Pages.

---

## 📱 Building the Android APK (Capacitor)

### 1. Build Web Assets for Android
```bash
VITE_TARGET=android npm run build
```

### 2. Initialize and Sync Android
```bash
npx cap add android
npx cap sync android
```

### 3. Open in Android Studio or Build with Gradle
```bash
# Open in Android Studio:
npx cap open android

# Or build debug APK directly via command line:
cd android
./gradlew assembleDebug
```
The output APK is generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📦 Downloading APK from GitHub Actions

1. Go to your repository on GitHub.
2. Click the **Actions** tab.
3. Select the latest run of the **Build Android Debug APK** workflow.
4. Scroll down to the **Artifacts** section at the bottom of the page.
5. Click **chesspath-debug-apk** to download the zipped `.apk` file.

### Sideloading onto Android
1. Transfer the `.apk` file to your Android phone (or download directly on your phone).
2. Open the file in your phone's File Manager.
3. If prompted, enable **Install from unknown sources** in your device settings.
4. Tap **Install** and launch ChessPath!

---

## 💻 Installing as a Desktop PWA

### Google Chrome / Microsoft Edge
1. Open the deployed website URL in Chrome or Edge.
2. Look for the **Install ChessPath** icon in the address bar (or click the **Install App** button in the header).
3. Click **Install**. ChessPath will launch in a standalone, distraction-free desktop window with offline support.

---

## 📜 License & Attribution

- **License**: This project is licensed under the **GNU General Public License v3.0 (GPLv3)**. See the [LICENSE](./LICENSE) file for details.
- **Vector Chess Pieces**: Designed by **Colin M. L. Burnett (Cburnett)**, hosted on Wikimedia Commons and licensed under **Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)**.
- **Stockfish Engine**: Copyright (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and Stockfish contributors. Licensed under the **GNU General Public License v3.0 (GPLv3)**.
- **chess.js**: Copyright (c) Jeff Hlywa. Licensed under the **BSD-2-Clause License**.
- **Icons**: Lucide Icons licensed under the **ISC License**.

---

Enjoy playing and learning with ChessPath!

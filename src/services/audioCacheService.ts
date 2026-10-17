/**
 * IndexedDB Audio Cache Service for caching Gemini TTS WAV audio clips.
 * Keyed by `${voice}:${cleanText}`.
 */

const DB_NAME = 'chesspath_audio_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_clips';

interface AudioCacheRecord {
  key: string;
  audioBuffer: ArrayBuffer;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

export const audioCacheService = {
  async getClip(text: string, voice: string): Promise<ArrayBuffer | null> {
    const key = `${voice}:${text.trim().toLowerCase()}`;
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const rec = req.result as AudioCacheRecord | undefined;
          if (rec && rec.audioBuffer) {
            resolve(rec.audioBuffer);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async saveClip(text: string, voice: string, audioBuffer: ArrayBuffer): Promise<void> {
    const key = `${voice}:${text.trim().toLowerCase()}`;
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: AudioCacheRecord = {
          key,
          audioBuffer,
          timestamp: Date.now(),
        };

        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Failed to cache audio in IndexedDB:', e);
    }
  },

  async clearCache(): Promise<void> {
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    } catch {
      // Ignored
    }
  },

  /**
   * Pre-generates and caches in IndexedDB short TTS clips for verdict phrases
   * ("Great move.", "Good move.", "Inaccuracy.", "Mistake.", "Blunder.") for the selected voice.
   * Runs in background with rate-limiting between calls.
   */
  async pregenerateVerdictPhrases(
    voice: string,
    generateFn: (text: string) => Promise<{ success: boolean; audioBuffer?: ArrayBuffer }>
  ): Promise<void> {
    const phrases = ['Great move.', 'Good move.', 'Inaccuracy.', 'Mistake.', 'Blunder.'];
    for (const phrase of phrases) {
      try {
        const existing = await this.getClip(phrase, voice);
        if (!existing) {
          const res = await generateFn(phrase);
          if (res.success && res.audioBuffer) {
            await this.saveClip(phrase, voice, res.audioBuffer);
          }
          // Rate limit background pre-generation (600 ms pause)
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (err) {
        console.warn('Verdict pregeneration step error:', err);
      }
    }
  },
};


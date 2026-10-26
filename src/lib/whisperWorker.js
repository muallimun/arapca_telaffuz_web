// src/lib/whisperWorker.js
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;

async function loadModel() {
  if (!transcriber) {
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base', 
      {
        dtype: 'q8',
        progress_callback: (progress) => {
          self.postMessage({ status: 'progress', data: progress });
        }
      }
    );
  }
  return transcriber;
}

self.onmessage = async (event) => {
  const { type, audioData, language } = event.data;

  if (type === 'transcribe') {
    try {
      self.postMessage({ status: 'loading' });
      const model = await loadModel();

      self.postMessage({ status: 'transcribing' });

      const output = await model(audioData, {
        language: language || 'ar',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        // --- HALÜSİNASYON VE TEKRARI ÖNLEME AYARLARI ---
        no_repeat_ngram_size: 3,   // Aynı 3 kelimenin arka arkaya tekrarlanmasını engeller
        repetition_penalty: 1.2,   // Tekrar eden kelimelere ceza uygular
        max_new_tokens: 100,       // Kısa cümleler için maksimum token sınırı
      });

      self.postMessage({ status: 'completed', text: output.text });
    } catch (error) {
      console.error("Whisper Worker Hatası:", error);
      self.postMessage({ status: 'error', error: error.message });
    }
  }
};
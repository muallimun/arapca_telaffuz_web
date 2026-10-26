// src/lib/whisperWorker.js
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber: any = null;

async function loadModel() {
  if (!transcriber) {
    // DÜZELTME: Daha doğru sonuçlar için 'base' modeline geçildi
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base', 
      {
        dtype: 'q8', // 8-bit niceleme (hız ve boyut dengesi)
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
      });

      self.postMessage({ status: 'completed', text: output.text });
        } catch (error: any) {
      console.error("Whisper Worker Hatası:", error);
      self.postMessage({ status: 'error', error: error.message });
    }
  }
};
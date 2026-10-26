import { DictionaryItem, DialogueLine } from "@/types/data";

export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Çoktan seçmeli test için şıklar üret
export function generateMultipleChoiceOptions(
  correctItem: DictionaryItem,
  allVocabulary: DictionaryItem[]
): { text: string; isCorrect: boolean }[] {
  const correctText = correctItem.anlam_tr;
  const distractors = allVocabulary
    .filter(item => item.id !== correctItem.id)
    .map(item => item.anlam_tr);
  
  const shuffledDistractors = shuffleArray(distractors).slice(0, 3);
  
  return shuffleArray([
    { text: correctText, isCorrect: true },
    ...shuffledDistractors.map(text => ({ text, isCorrect: false }))
  ]);
}

// Boşluk Doldurma için cümle ve şıklar üret
export function generateFillInBlanks(
  lines: DialogueLine[],
  vocabulary: DictionaryItem[]
): { sentenceWithBlank: string, options: { text: string; isCorrect: boolean }[], originalWord: string }[] {
  
  const questions: { sentenceWithBlank: string, options: { text: string; isCorrect: boolean }[], originalWord: string }[] = [];

  // Her cümleyi tara
  lines.forEach((line) => {
    const words = line.arapca.split(" ");
    
    // Cümledeki kelimeleri sözlükle eşleştir
    words.forEach((word) => {
      const cleanWord = word.replace(/[.,!?؟،]/g, "");
      const vocabItem = vocabulary.find(v => 
        v.mufret?.includes(cleanWord) || 
        v.mazi?.includes(cleanWord) || 
        cleanWord.includes(v.mufret || "___")
      );

      if (vocabItem && cleanWord.length > 2) {
        // Bulunan kelimeyi boşlukla değiştir
        const sentenceWithBlank = line.arapca.replace(word, "______");
        
        // Şıkları oluştur (1 doğru Arapça kelime, 3 yanlış Arapça kelime)
        const correctText = cleanWord;
        const wrongOptions = shuffleArray(vocabulary.filter(v => v.id !== vocabItem.id))
          .slice(0, 3)
          .map(v => v.mufret || v.mazi || "")
          .filter(w => w !== "");

        if (wrongOptions.length === 3) {
          questions.push({
            sentenceWithBlank,
            originalWord: cleanWord,
            options: shuffleArray([
              { text: correctText, isCorrect: true },
              ...wrongOptions.map(text => ({ text, isCorrect: false }))
            ])
          });
        }
      }
    });
  });

  // Rastgele 5 soru seç (çok uzun olmasın)
  return shuffleArray(questions).slice(0, 5);
}
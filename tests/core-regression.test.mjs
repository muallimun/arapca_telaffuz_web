import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const requireFromRoot = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Bellek içi localStorage simülasyonu (zustand persist için)
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => (memoryStorage.has(key) ? memoryStorage.get(key) : null),
  setItem: (key, val) => memoryStorage.set(key, String(val)),
  removeItem: (key) => memoryStorage.delete(key),
  clear: () => memoryStorage.clear(),
};
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

const moduleCache = new Map();

function resolveModuleFilePath(specifier, parentDir) {
  let baseTarget;
  if (specifier.startsWith("@/")) {
    baseTarget = path.join(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    baseTarget = path.resolve(parentDir, specifier);
  } else {
    return null; // Harici npm paketi
  }

  const candidates = [
    baseTarget,
    `${baseTarget}.ts`,
    `${baseTarget}.tsx`,
    `${baseTarget}.js`,
    `${baseTarget}.json`,
    path.join(baseTarget, "index.ts"),
    path.join(baseTarget, "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Modül çözümlenemedi: ${specifier} (ebeveyn: ${parentDir})`);
}

function loadTsModule(specifier, parentDir = projectRoot) {
  const resolvedPath = resolveModuleFilePath(specifier, parentDir);
  if (!resolvedPath) {
    return requireFromRoot(specifier);
  }

  if (moduleCache.has(resolvedPath)) {
    return moduleCache.get(resolvedPath).exports;
  }

  if (resolvedPath.endsWith(".json")) {
    const jsonData = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    moduleCache.set(resolvedPath, { exports: jsonData });
    return jsonData;
  }

  const source = fs.readFileSync(resolvedPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: resolvedPath,
  });

  const mod = { exports: {} };
  moduleCache.set(resolvedPath, mod);

  const dirname = path.dirname(resolvedPath);
  const customRequire = (childSpecifier) => loadTsModule(childSpecifier, dirname);

  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) { ${transpiled.outputText}\n})`,
    { filename: resolvedPath }
  );
  wrapper(mod.exports, customRequire, mod, resolvedPath, dirname);

  return mod.exports;
}

const arabicNlp = loadTsModule("@/lib/arabicNlpEngine");
const audioAnalysis = loadTsModule("@/lib/audioAnalysis");
const userStoreMod = loadTsModule("@/store/userStore");
const quizMod = loadTsModule("@/lib/quiz");
const dataMod = loadTsModule("@/lib/data");

// ============================================================================
// 1. Mahreç ve Kök Ünsüz Kalkanı Testi
// ============================================================================
test("1. Mahreç ve Kök Ünsüz Kalkanı: استغفار vs استغفال ve صباح vs سباح", () => {
  const resIstighfar = arabicNlp.evaluateSingleWord("اِسْتِغْفَار", "اِسْتِغْفَال");
  assert.ok(
    resIstighfar.score <= 58,
    `استغفار yerine استغفال okunduğunda puan <= 58 olmalı (Alınan: ${resIstighfar.score})`
  );
  assert.ok(
    resIstighfar.status === "wrong" || resIstighfar.status === "warning",
    `Durum wrong veya warning olmalı (Alınan: ${resIstighfar.status})`
  );

  const resSabah = arabicNlp.evaluateSingleWord("صَبَاح", "سَبَاح");
  assert.ok(
    resSabah.score <= 58,
    `صباح yerine سباح okunduğunda puan <= 58 olmalı (Alınan: ${resSabah.score})`
  );
  assert.ok(
    resSabah.status === "wrong" || resSabah.status === "warning",
    `Durum wrong veya warning olmalı (Alınan: ${resSabah.status})`
  );
});

// ============================================================================
// 2. Şedde ve Hareke Farkı Testi + Akustik Med/Şedde Süre Kontrolü
// ============================================================================
test("2. Şedde ve Hareke Farkı: كَتَبَ vs كُتِبَ ve دَرَّسَ vs دَرَسَ", () => {
  const resVowel = arabicNlp.evaluateSingleWord("كَتَبَ", "كُتِبَ");
  assert.ok(
    resVowel.score < 80,
    `كَتَبَ yerine كُتِبَ okunduğunda puan < 80 olmalı (Alınan: ${resVowel.score})`
  );
  assert.equal(resVowel.status, "warning");

  const resShadda = arabicNlp.evaluateSingleWord("دَرَّسَ", "دَرَسَ");
  assert.ok(
    resShadda.score < 80,
    `دَرَّسَ yerine دَرَسَ okunduğunda puan < 80 olmalı (Alınan: ${resShadda.score})`
  );
  assert.equal(resShadda.status, "warning");

  // Harekesiz STT çıktısında akustik Med/Şedde süre kontrolü
  const shortDurationEval = arabicNlp.evaluateSentenceWords("دَرَّسَ", "درس", {
    userDurationSec: 0.25,
    refDurationSec: 1.1,
  });
  assert.ok(
    shortDurationEval.diacriticNote?.includes("Akustik Süre Uyarısı"),
    "Harekesiz STT çıktısında şedde/med süresi kısa kaldığında Akustik Süre Uyarısı üretilmeli"
  );
});

// ============================================================================
// 3. Parantez İçi Sayı ve % Sembolü Soyma Testi
// ============================================================================
test("3. Parantez İçi Sayı ve % Sembolü Soyma: (40%) ve (167) tam okumada 100 puan", () => {
  const line40Pct = "هَذَا الْقَمِيصُ عَلَيْهِ خَصْمٌ أَرْبَعُونَ بِالْمِائَةِ (40%).";
  const spoken40Pct = "هَذَا الْقَمِيصُ عَلَيْهِ خَصْمٌ أَرْبَعُونَ بِالْمِائَةِ";
  const eval40 = arabicNlp.evaluateSentenceWords(line40Pct, spoken40Pct);
  assert.equal(
    eval40.overallScore,
    100,
    `(40%) içeren cümle doğru okunduğunda 100 tam puan almalı (Alınan: ${eval40.overallScore})`
  );

  const line167 = "رَقْمُ الغُرْفَةِ مِائَةٌ وَسَبْعَةٌ وَسِتُّونَ (167).";
  const spoken167 = "رَقْمُ الغُرْفَةِ مِائَةٌ وَسَبْعَةٌ وَسِتُّونَ";
  const eval167 = arabicNlp.evaluateSentenceWords(line167, spoken167);
  assert.equal(
    eval167.overallScore,
    100,
    `(167) içeren cümle doğru okunduğunda 100 tam puan almalı (Alınan: ${eval167.overallScore})`
  );
});

// ============================================================================
// 4. Boş STT Çıktısında Sahte Puan Üretmeme Testi
// ============================================================================
test("4. Boş STT Çıktısında Sahte Puan Üretmeme: score: null, overallScore: 0, isEvaluated: false", () => {
  const dspEmpty = audioAnalysis.evaluateAcousticDspSentence(
    "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ",
    new Array(48).fill(0.25),
    new Array(48).fill(0.25),
    1.8,
    1.8,
    ""
  );

  assert.equal(dspEmpty.score, null);
  assert.equal(dspEmpty.overallScore, 0);
  assert.equal(dspEmpty.isEvaluated, false);
  assert.equal(dspEmpty.isTextRecognized, false);
  assert.equal(dspEmpty.words.length, 0);
});

// ============================================================================
// 5. DTW Ritim Algoritması Testi
// ============================================================================
test("5. DTW Ritim Algoritması: özdeş zarf 100, düz gürültü <= 35, sessizlik 0", () => {
  const naturalRefEnvelope = Array.from({ length: 48 }, (_, i) => {
    const wave = Math.sin((i / 48) * Math.PI * 6);
    return wave > 0 ? 0.15 + wave * 0.75 : 0.04;
  });

  const identicalScore = audioAnalysis.calculateRhythmMatch(
    naturalRefEnvelope,
    naturalRefEnvelope
  );
  assert.equal(
    identicalScore,
    100,
    `Özdeş ses zarfı 100 puan almalı (Alınan: ${identicalScore})`
  );

  const flatNoiseEnvelope = new Array(48).fill(0.5);
  const flatNoiseScore = audioAnalysis.calculateRhythmMatch(
    naturalRefEnvelope,
    flatNoiseEnvelope
  );
  assert.ok(
    flatNoiseScore <= 35,
    `Düz sabit gürültü (flat noise) <= 35 puan almalı (Alınan: ${flatNoiseScore})`
  );

  const silenceEnvelope = new Array(48).fill(0.01);
  const silenceScore = audioAnalysis.calculateRhythmMatch(
    naturalRefEnvelope,
    silenceEnvelope
  );
  assert.equal(
    silenceScore,
    0,
    `Sessizlik 0 puan almalı (Alınan: ${silenceScore})`
  );
});

// ============================================================================
// 6. SRS Aynı Gün Tek Kademe Sınırı ve JSON Merge Tekilleştirme Testi
// ============================================================================
test("6. SRS Aynı Gün Tek Kademe Sınırı ve JSON Merge Tekilleştirme (Idempotency)", () => {
  const useUserStore = userStoreMod.useUserStore;
  useUserStore.getState().resetProgress();

  // Bir kelimeyi önce hatalı işaretle (stage 0, status: learning)
  useUserStore.getState().recordItemAttempt("word_test_1", "word", false);
  const afterFail = useUserStore.getState().srsRecords["word_test_1"];
  assert.equal(afterFail.stage, 0);

  // Aynı gün içinde üst üste 3 kez doğru cevapla -> stage en fazla 1 kademe (0 -> 1) ilerlemeli!
  useUserStore.getState().recordItemAttempt("word_test_1", "word", true);
  const afterFirstSuccess = useUserStore.getState().srsRecords["word_test_1"];
  assert.equal(afterFirstSuccess.stage, 1);

  useUserStore.getState().recordItemAttempt("word_test_1", "word", true);
  useUserStore.getState().recordItemAttempt("word_test_1", "word", true);
  const afterRepeatedSameDaySuccess =
    useUserStore.getState().srsRecords["word_test_1"];
  assert.equal(
    afterRepeatedSameDaySuccess.stage,
    1,
    "Aynı gün içinde art arda doğru cevaplanan öğe en fazla 1 SRS kademesi atlamalı"
  );

  // JSON Merge Tekilleştirme (Idempotency) Testi
  useUserStore.getState().recordPronunciationScore(80);
  useUserStore.getState().toggleLearnedWord("1");
  const backupJson = useUserStore.getState().exportProgress();

  const scoresBeforeMerge =
    useUserStore.getState().pronunciationScores.length;
  const learnedBeforeMerge = useUserStore.getState().learnedWords.length;
  const xpBeforeMerge = useUserStore.getState().activityXp;

  // Aynı yedeği "merge" modunda tekrar içe aktar -> mükerrer kayıt oluşmamalı
  const importedOk = useUserStore.getState().importProgress(backupJson, "merge");
  assert.equal(importedOk, true);
  assert.equal(
    useUserStore.getState().pronunciationScores.length,
    scoresBeforeMerge,
    "Aynı yedek merge edildiğinde pronunciationScores ikiye katlanmamalı"
  );
  assert.equal(
    useUserStore.getState().learnedWords.length,
    learnedBeforeMerge,
    "Aynı yedek merge edildiğinde learnedWords ikiye katlanmamalı"
  );
  assert.equal(
    useUserStore.getState().activityXp,
    xpBeforeMerge,
    "Aynı yedek merge edildiğinde activityXp şişmemeli"
  );
});

// ============================================================================
// 7. Faz E: Pedagojik Diyalog Metadatası, Unicode Standardizasyonu ve Akıllı Çeldirici Testi
// ============================================================================
test("7. 60 Diyalog Pedagojik Metadata, CEFR Sıralaması ve Akıllı Çeldirici Kontrolü", () => {
  assert.equal(dataMod.diyaloglar.length, 60);
  for (const dlg of dataMod.diyaloglar) {
    assert.ok(dlg.cefr, `${dlg.id} için cefr tanımlı olmalı`);
    assert.ok(dlg.zorluk >= 1 && dlg.zorluk <= 4, `${dlg.id} için zorluk 1..4 olmalı`);
    assert.ok(
      Array.isArray(dlg.etiketler) && dlg.etiketler.length > 0,
      `${dlg.id} için etiketler dizisi dolu olmalı`
    );
    assert.ok(dlg.kaynak_unite, `${dlg.id} için kaynak_unite tanımlı olmalı`);
    for (const line of dlg.satirlar) {
      assert.ok(
        !line.arapca.includes("\u0640"),
        `${dlg.id} satır ${line.sira} içinde tatweel (ـ) bulunmamalı`
      );
    }
  }

  // Pedagojik sıralamada tüm A1'ler A2'lerden önce gelmeli
  const sorted = dataMod.getDialoguesSortedPedagogically();
  const rankMap = { A1: 1, A2: 2, B1: 3, B2: 4 };
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      rankMap[sorted[i].seviye] >= rankMap[sorted[i - 1].seviye],
      `Pedagojik sıralama A1 -> A2 -> B1 -> B2 sırasını korumalı (${sorted[i - 1].id}:${sorted[i - 1].seviye} -> ${sorted[i].id}:${sorted[i].seviye})`
    );
  }

  // Akıllı çeldirici (Smart Distractor) aynı sözcük türünü seçmeli
  const sampleVerb = dataMod.sozluk.find(
    (w) => quizMod.normalizeWordPartOfSpeech(w.tur) === "fiil"
  );
  if (sampleVerb) {
    const distractors = quizMod.selectSmartWordDistractors(
      sampleVerb,
      dataMod.sozluk,
      3
    );
    assert.equal(distractors.length, 3);
    assert.ok(
      distractors.every(
        (d) => quizMod.normalizeWordPartOfSpeech(d.tur) === "fiil"
      ),
      "Fiil olan hedef kelime için seçilen tüm çeldiriciler fiil olmalı"
    );
  }
});

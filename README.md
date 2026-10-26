# 🎙️ İnteraktif Arapça Diyalog, Sözlük ve Yapay Zeka Telaffuz Stüdyosu

Bu proje; günlük Arapça konuşma kalıplarını, diyalog metinlerini, morfolojik kelime analizlerini ve **tarayıcı içi yapay zeka (Whisper WASM + DSP)** destekli mahreç/telaffuz koçluğunu tek bir çatı altında sunan modern bir **Next.js** eğitim platformudur.

---

## ✨ Öne Çıkan Özellikler

### 1. 🎧 Diyalog Stüdyosu (60 Günlük Diyalog)
* **4 Farklı Çalışma Modu:**
  1. **Dinle ve İncele:** Satır satır seslendirme, kelime bazlı anlık sözlük (`WordTooltip`) ve cümle tekrarı (`🔁 Tekrarla`).
  2. **Telaffuz & Mahreç Stüdyosu:** Her repliği gölgeleme (shadowing) tekniğiyle seslendirip anında puanlama ve **Otomatik Gölgeleme Akışı** (`autoShadowingFlow`).
  3. **Karşılıklı Rol Yapma (Roleplay):** Diyalogdaki karakterlerden birini seçerek gerçek zamanlı karşılıklı konuşma pratiği.
  4. **Diyalog Sözlüğü:** Sadece ilgili diyalogda geçen kelimelerin çekimli halleri, kökleri ve morfolojik notlarıyla listelenmesi.
* **5 Görünüm Seçeneği:** *Alt Alta*, *İki Sütun*, *Sadece Arapça*, *Sadece Türkçe* ve *Tıkla-Gör (Bulanık Çeviri)*.
* **Çift Katmanlı Ses Motoru:** Yerel yüksek kaliteli `.mp3` ses dosyaları ve bulunmayan metinler/kelimeler için otomatik **Neural TTS (`/api/tts`)** yedekleme sistemi.

### 2. 🎯 Gölgeleme (Shadowing) & 38 Çiftlik Mahreç Koçu
* **Hibrit Ses Tanıma:** Tarayıcı içi **Whisper AI (WASM / 16kHz DSP `.wav`)** ve **Web Speech API** desteği.
* **Çift Hizalama Algoritması:**
  * **Needleman-Wunsch Kelime Hizalama:** Okuma sırasında kelime atlama veya fazladan kelime ekleme durumlarında cümle kaymasını önler.
  * **2D Levenshtein Karakter Hizalama:** Harf bazlı doğruluk analizi yapar.
* **38 Mahreç Karışıklık Çifti Analizi:** *Peltek-Keskin* (`ث/س`, `ذ/ز`, `ظ/ض`), *Boğaz Harfleri* (`ح/ه`, `ع/ء`, `غ/خ`) ve *Kalın-İnce Sesler* (`ص/س`, `ط/ت`, `ق/ك`, `ض/د`) arasındaki hataları tespit edip özel artikülasyon ipuçları sunar.
* **Kök Harf Kalkanı:** Kelimenin anlamını değiştiren asli kök harf hatalarında puanı otomatik olarak maksimum **%58** ile sınırlandırır.
* **Çift 48-Bar RMS Dalga Formu (Waveform):** Referans ses ile kullanıcı ses zarfını görsel olarak karşılaştırır (2 aşamalı yerel MP3 ve Neural TTS dalga formu çıkarımı).
* **Mikro-Drill & Adaptif Hız Koçluğu:** Hatalı telaffuz edilen tek bir kelimeye odaklanma (*"🎯 Sadece Bu Kelimeyi Çalış"*) ve zorlanılan cümlelerde otomatik `0.75x` yavaşlatılmış dinleme önerisi.
* **Kelime Çekim Pratiği:** İsimlerde *Müfret / Cemî*, fiillerde *Mâzî / Muzâri / Masdar* formlarını tek pencereden ayrı ayrı seslendirme.

### 3. 📖 5 Kademeli Morfolojik Sözlük Motoru (`src/lib/dict.ts`)
Diyalog içindeki herhangi bir kelimeye tıklandığında 5 aşamalı çözümleme yapar:
1. **Doğrudan Eşleşme:** Harekesiz ve normalize edilmiş tam metin kontrolü.
2. **Ön ve Son Ek Soyma (Prefix/Suffix Stripping):** Harf-i tarif (`ال`), bağlaç/harf-i cer (`و، ف، ب، ل، ك، س`) ve muttasıl zamirlerin (`ها، هم، كم، نا...`) ayrıştırılması.
3. **Tâ-i Merbûta (`ت -> ة`) İzafet Onarımı:** Zamir bitiştiğinde açık tâ'ya dönüşen kelimelerin sözlükteki kapalı tâ formuna eşlenmesi.
4. **Fiil Çekim Çözücüsü:** Muzâri, mâzî ve emir fiil çekim eklerinin soyularak sülâsî/mezîd mâzî kök formuna ulaşılması.
5. **3'lü Kök İskeleti (Root Skeleton) Eşleştirmesi:** Kırık çoğul (cemî mükesser) ve türemiş kelimelerin 3 harfli kök dizilimi üzerinden yakalanması.

### 4. 🧠 İnteraktif Alıştırma Merkezi (`/alistirmalar`)
* **4 Farklı Oyun Modu:**
  * **Kelime Kartları (`Flashcard`):** 3B çevirmeli kartlar, klavye kısayolları (`Space`, `⬅️`, `➡️`) ve kart üzerinden doğrudan telaffuz koçuna bağlanma.
  * **Çoktan Seçmeli Test (`MultipleChoice`):** Anlık geri bildirimli kelime ve cümle testleri.
  * **Boşluk Doldurma (`FillInBlanks`):** Diyalog cümleleri içinden akıllı rastgele kelime seçimi ile bağlamsal test.
  * **Eşleştirme Oyunu (`MatchingGame`):** Süre ve hamle odaklı Arapça-Türkçe kart eşleştirme.
* **Akıllı Kelime Havuzları:** Diyalog bazlı çalışmanın yanı sıra **"⭐ Favori Kelimelerim"** ve telaffuzda zorlanılan **"🎙️ Mahreç Tekrarı (Zayıf Kelimeler)"** özel havuzları.

### 5. 🎨 3B Dokunsal (Tactile) Tasarım & Kişiselleştirme
* **Göz Yormayan Okuma Teması:** Sıcak fildişi/krem gündüz modu (`#FDFBF7` / `#F7EFE1`), zümrüt yeşili (`#0CA678`) ve lavanta (`#6741D9`) 3B basılabilir buton/kart mimarisi ve tam **Gece Modu (Dark Mode)** desteği.
* **Özel Tipografi:** Okunabilirliği artırılmış `Arakom` Arapça font ailesi ve dinamik punto ölçeklendirme (`--arabic-scale`).
* **İlerleme Takibi & Yedekleme:** Günlük çalışma süresi hedefi (`studyMinutes / dailyGoalMinutes`), günlük seri (streak) takibi, `.json` formatında tam yedek indirme/geri yükleme, canlı mikrofon testi ve **PWA (Uygulama Olarak Yükleme)** desteği.

---

## 🛠️ Teknoloji Yığını

* **Çatı (Framework):** [Next.js 15+](https://nextjs.org) (App Router, TypeScript)
* **Stil & UI:** Tailwind CSS, 3B Tactile CSS Değişkenleri, Lucide Icons, Canvas Confetti
* **Durum Yönetimi (State):** Zustand (`localStorage` kalıcılığı ve JSON yedekleme ile)
* **Ses & Yapay Zeka (DSP / AI):**
  * `@xenova/transformers` (Tarayıcı içi Whisper-Tiny/Base WASM ASR)
  * Web Audio API (`AudioContext`, 16kHz PCM `.wav` kodlayıcı, 48-bar RMS zarf çıkarıcı)
  * Edge / Google Neural TTS API Köprüsü (`/api/tts`)

---

## 📂 Proje Dizin Yapısı

```text
├── public/
│   ├── fonts/               # Arakom.ttf Arapça eğitim fontu
│   ├── mp3/                 # Diyalog ses dosyaları ve manifest.json
│   └── manifest.json        # PWA yapılandırması
├── src/
│   ├── app/
│   │   ├── alistirmalar/    # Kelime kartları, test, boşluk doldurma ve eşleştirme
│   │   ├── api/tts/         # Çevrimiçi Neural TTS ses üretim uç noktası
│   │   ├── ayarlar/         # Ses, font, hedef, mikrofon testi ve JSON yedekleme
│   │   ├── diyalog/[id]/    # 4 modlu interaktif diyalog ve telaffuz stüdyosu
│   │   ├── sozluk/          # Morfolojik arama ve telaffuz destekli genel sözlük
│   │   ├── globals.css      # 3B dokunsal tasarım sistemi ve tema değişkenleri
│   │   └── page.tsx         # İlerleme panosu, günlük hedef ve diyalog listesi
│   ├── components/
│   │   ├── exercises/       # Flashcard, MultipleChoice, FillInBlanks, MatchingGame
│   │   ├── layout/          # Header (PWA & Gece modu) ve mobil navigasyon
│   │   └── ui/              # ShadowingModal (Telaffuz Koçu) ve WordTooltip
│   ├── data/                # Diyaloglar ve sözlük JSON veri kaynakları
│   ├── lib/
│   │   ├── arabicNlpEngine.ts # 38 mahreç çifti, Needleman-Wunsch & Levenshtein motoru
│   │   ├── audio.ts         # Hibrit MP3 / Neural TTS ses yöneticisi
│   │   ├── dict.ts          # 5 kademeli morfolojik Arapça kelime çözücü
│   │   └── whisperClient.ts # Web Worker tabanlı Whisper WASM istemcisi
│   └── store/
│       └── userStore.ts     # İlerleme, seri, favoriler ve zayıf kelimeler deposu
└── next.config.ts           # WASM SharedArrayBuffer (COOP/COEP credentialless) ayarları
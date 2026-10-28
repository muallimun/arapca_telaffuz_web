# 🕌 Arapça Telaffuz ve Diyalog Asistanı (`app.muallimun.net`)

![Version](https://img.shields.io/badge/Sürüm-v2.0.0-059669?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)
![PWA](https://img.shields.io/badge/PWA-Çevrimdışı_Destekli-6741D9?style=for-the-badge)
![Whisper AI](https://img.shields.io/badge/AI-Whisper_WebGPU_%26_WASM-0CA678?style=for-the-badge)
![CEFR](https://img.shields.io/badge/CEFR-A1--B2_(60_Diyalog)-D97706?style=for-the-badge)

**Arapça Telaffuz ve Diyalog Asistanı (`app.muallimun.net`)** — CEFR (A1–B2) uyumlu 60 günlük konuşma diyaloğu, 16kHz DSP + Yapay Zeka (Whisper & Web Speech) destekli 38 Çiftlik Mahreç Koçu, Morfolojik Kök Çözümleyici, Kalıp İfadeler Kütüphanesi, 5 Modlu İnteraktif Alıştırma Merkezi ve Akıllı A4 PDF Çalışma Kağıdı Üreticisi içeren yeni nesil Progressive Web App (PWA) eğitim platformudur.

🌐 **Canlı Uygulama:** [https://app.muallimun.net](https://app.muallimun.net)  
🏛️ **Ana Portal:** [https://muallimun.net](https://muallimun.net)

---

## ✨ Öne Çıkan Özellikler

### 1. 📚 Diyalog Kütüphanesi (60 Diyalog / A1–B2)
- **Zengin Görselli 60 Günlük Konuşma Diyaloğu:** Başlangıç (A1), Orta (A2–B1) ve İleri (B1–B2) kurlarına ayrılmış gerçek hayat senaryoları.
- **Doğal MP3 Seslendirme & Karaoke Kelime Takibi:** Cümle bazlı doğal seslendirme, canlı kelime renklendirme ve ok (`▼`) takibi.
- **5 Farklı Görünüm Modu:** `Alt Alta`, `İki Sütun`, `Sadece Arapça`, `Sadece Türkçe` ve `Tıkla Gör` okuma düzenleri.
- **Esnek Dinleme & Gölgeleme Kontrolü:** Hız kontrolü (`0.5x – 1.25x`), cümle/diyalog döngüsü (loop: `1x`, `2x`, `3x`, `5x`, `∞`) ve canlı geri sayım çubuğuna sahip **Cümleler Arası Gölgeleme Boşluğu** (`Yok`, `2 Saniye Bekle`, `Cümle Süresi Kadar Boşluk`).

### 2. 🎙️ Gölgeleme & 38 Çiftlik Mahreç Koçu (`ShadowingModal`)
- **Çift Motorlu Ses Tanıma Mimarisi:** Hızlı Tarayıcı Motoru (Web Speech API) ve tarayıcı içi yerel **Yapay Zeka (Whisper — WebGPU & WASM otomatik geçişli)** desteğiyle Chrome, Firefox, Edge, Safari ve mobil tarayıcılarda tam uyumluluk.
- **16kHz DSP Akustik Dalga ve Fonetik Analiz:** Referans ses ile kullanıcı sesinin 48 barlık dalga formu, ritim, süre ve hece enerjisi karşılaştırması.
- **Arapça Vakıf ve İmla Duyarlılığı:** Durak (`ة/ه`, `ى/ي`), hemze, şedde ve med kurallarına duyarlı kelime bazlı doğruluk puanlaması ve **Kök Harf Kalkanı**.
- **38 Çiftlik Mahreç Rehberi & Adaptif Koçluk:** Boğaz (halk: `ح/ه`, `ع/أ`), kalın (isti'lâ: `ص/س`, `ض/د`, `ط/ت`, `ظ/ذ`, `ق/ك`), peltek (`ث/س`, `ذ/ز`) harfler, şedde ve med uzatmaları için **Adaptif Telaffuz Koçu** geri bildirimleri, tek kelime odaklı mikro-antrenman (*Sadece Bu Kelimeyi Çalış*) ve 16-bit PCM `.wav` ses kaydı indirme.

### 3. 🎭 Gerçek Mikrofonlu Diyalog Canlandırma (Rol Yapma / Roleplay)
- **İnteraktif Karakter Simülasyonu:** Diyalogdaki karakterlerden birini (`A` veya `B` rolü) seçerek karşılıklı diyalog canlandırma, isteğe bağlı metin gizleme (ezberden konuşma) modu.
- **Otomatik Sıra ve Canlı Ses Dalgası:** Sıra kullanıcıya geldiğinde otomatik açılan 16kHz mikrofon dinlemesi, canlı ses dalgası, konuşma bitince otomatik algılama ve gerçek zamanlı replik puanlaması.
- **Rol Yapma Performans Karnesi:** Diyalog sonunda otomatik olarak ekrana kaydırılan performans özeti, ilgili repliğe odaklanan tıklanabilir replik puan rozetleri (`#1: %88`, `#3: %92`) ve başarı kartı paylaşımı.

### 4. 🧠 Morfolojik Kök Çözümleyici & ✨ Kalıp İfadeler (`arabicNlpEngine` & `arabicIdioms`)
- **Morfolojik Kök ve Kalıp Analizi (`WordTooltip`):** Diyalog içindeki herhangi bir Arapça kelimeye tıklandığında açılan bilgi kartında sülâsî kök (misal, ecvef ve istif'âl bâbı dahil), kelime türü (*İsim / Fiil / Edat / Özel İsim*), müfret-cemî veya mâzî-muzâri-emir çekimleri ile önek-kök-sonek ayrıştırması.
- **✨ Kalıp İfadeler ve Deyimler (التعبيرات الاصطلاحية):** Diyaloglarda geçen deyim ve kalıp ifadeler için harfiyen anlam, deyimsel anlam, pedagojik kullanım notu, sesli dinleme ve telaffuz pratiği.

### 5. 🎮 İnteraktif Alıştırma Merkezi (5 Farklı Mod)
- **Zengin Kaynak Filtreleri:** `Tüm Sözlük`, `✨ Kalıp İfadeler`, `💬 Diyalog Cümleleri`, `🔀 Karışık`, `❤️ Favorilerim` ve `⚡ Zorlandıklarım (Akıllı Hata Defteri)`.
- **5 Pedagojik Alıştırma Türü:**
  1. **3B Kelime & Kalıp İfade Kartları (`Flashcard`):** Sesli, örnek cümleli ve morfolojik detaylı çevrilebilir kartlar.
  2. **Çoktan Seçmeli Test (`MultipleChoice`):** Arapça ↔ Türkçe çift yönlü, sesli ve ipucu destekli test.
  3. **Ok Çizerek Eşleştirme (`MatchingGame`):** Sağ sütunda Arapça, sol sütunda Türkçe anlamların yer aldığı, SVG ok çizimli pedagojik eşleştirme oyunu.
  4. **Boşluk Doldurma & Sanal Klavyeli İmla (`FillInBlanks` + `ArabicVirtualKeyboard`):** Dinleyerek cümledeki eksik kelimeyi yazma, hareke/hemze toleransı ve mobil çift klavye çakışmasını önleyen dahili Arapça sanal klavye.
  5. **🧩 Dinle ve Sırala / Cümle Kurma (`SentenceBuilder`):** Diyalog cümlesini dinleyip karışık verilen Arapça kelimeleri sağdan sola (`RTL`) doğru sırayla dizerek sentaks (nahiv) pratiği yapma.

### 6. ⚡ Zorlandıklarım (Akıllı Hata Defteri & Aralıklı Tekrar)
- **Spaced Repetition (Aralıklı Tekrar) Mantığı:** Alıştırmalarda yanlış cevaplanan veya telaffuz stüdyosunda `%70`'in altında kalınan kelime, kalıp ifade ve cümleleri otomatik olarak **Zorlandıklarım** havuzuna kaydeder.
- **Otomatik İyileşme Takibi:** Öğrenci bu maddeleri alıştırmalarda doğru yanıtladıkça veya telaffuz koçunda `%85+` başarı sağladıkça listeden otomatik olarak düşürür.

### 7. 🖨️ Akıllı A4 PDF & Çalışma Kağıdı Üreticisi (`DialoguePdfModal`)
- **Öğretmen ve Öğrenciler İçin A4 Ders Materyali:** İki sütunlu Arapça–Türkçe diyalog tablosu, renkli kelime listesi ve **✨ Kalıp İfadeler ve Deyimler** tablosu.
- **Yazılı Yoklama / Çalışma Kağıdı Modu:** Arapça kelimeleri veya Türkçe çevirileri noktalı yazı alanı ile gizleyen boşluk doldurma modu, üstte **Ad-Soyad / Sınıf / Tarih / Puan** bilgi şeridi ve sayfa sonunda ters çevrilmiş **Cevap Anahtarı**.

### 8. 🏆 Görsel Başarı Kartı Üretici & Paylaşım (`ShareAchievementModal`)
- **Yüksek Çözünürlüklü PNG Başarı Kartı:** HTML5 Canvas ile öğrencinin seviye, XP, seri, telaffuz ortalaması ve diyalog başarısını gösteren özel tasarım kart üretimi.
- **Tek Tıkla Sosyal Paylaşım:** Web Share API, WhatsApp ve Telegram üzerinden tıklanabilir `https://app.muallimun.net` bağlantısıyla paylaşım.

### 9. ⚙️ Gelişmiş Tipografi, Ayarlar ve PWA Altyapısı
- **5 Seçkin Arapça Eğitim Fontu:** *Arakom (Varsayılan)*, *Amiri*, *Scheherazade New*, *Noto Naskh Arabic* ve *Lateef* yazı tipleri ile 4 kademeli boyut ölçekleme ve canlı önizleme.
- **Göz Yormayan Temalar & Mobil Ergonomi:** *Sıcak Krem (Gündüz)* ve *Gece Modu* temaları, dinleme ve rol yapma sırasında mobil ekranın kararmasını önleyen **Screen Wake Lock API** ve tam çevrimdışı (Offline) çalışma desteği.
- **Taşınabilir Veri Yönetimi:** Tüm çalışma geçmişini, favorileri ve hata defterini JSON dosyası olarak **Dışa Aktarma (Yedekleme)** ve **İçe Aktarma (Geri Yükleme)**.

---

## 🛠️ Teknoloji Yığını

| Katman | Teknoloji |
| :--- | :--- |
| **Çatı (Framework)** | Next.js 16 (App Router) & React 19 |
| **Dil** | TypeScript 5 |
| **Stil & Tasarım** | Tailwind CSS v4, Özel Arapça Tipografi & RTL Desteği |
| **Durum Yönetimi (State)** | Zustand (`localStorage` kalıcılığı ile) |
| **Ses & DSP Analizi** | Web Audio API (16kHz PCM örnekleme, RMS Zarf Analizi, Dinamik Zaman Bükme / DTW) |
| **Yapay Zeka & STT** | `@huggingface/transformers` (Whisper Web Worker — WebGPU & WASM) + Web Speech API |
| **PWA & Çevrimdışı** | Özel Service Worker (`sw.js`), Web App Manifest, Screen Wake Lock API |

---

## 🚀 Kurulum ve Çalıştırma

Projeyi yerel bilgisayarınızda çalıştırmak için aşağıdaki adımları izleyin:

```bash
# 1. Bağımlılıkları yükleyin
npm install

# 2. Geliştirme sunucusunu başlatın (http://localhost:3000)
npm run dev

# 3. Üretim (Production) derlemesi oluşturun
npm run build

# 4. Üretim sunucusunu başlatın
npm start
```

---

## 🌐 İletişim ve Bağlantılar

- **Uygulama Adresi:** [https://app.muallimun.net](https://app.muallimun.net)
- **Web Sitesi:** [https://muallimun.net](https://muallimun.net)
- **Telegram Kanalı:** [https://t.me/muallimun](https://t.me/muallimun)
- **WhatsApp Kanalı:** [WhatsApp Kanalımıza Katılın](https://whatsapp.com/channel/0029VaAif947oQhgdaDMjK1Q)
- **YouTube:** [@MuallimunNet](https://www.youtube.com/@MuallimunNet)

---

<div align="center">
  <strong>© 2026 Arapça Telaffuz ve Diyalog Asistanı — Muallimun Eğitim Teknolojileri</strong>
</div>

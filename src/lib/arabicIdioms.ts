import { Dialogue, DialogueLine } from "@/types/data";
import { sozluk } from "@/lib/data";
import { SUPPLEMENT_DICTIONARY } from "@/lib/supplementDict";

export interface ArabicIdiom {
  id: string;
  arabic: string;
  meaningTr: string;
  literalTr: string;
  usageNote: string;
  variants?: string[];
  level?: string;
}

export interface ExtractedDialogueIdiom extends ArabicIdiom {
  lineNumber: number;
  matchedPhrase?: string;
  lineArabic: string;
  lineTurkish: string;
  level: string;
}

/**
 * Diyaloglarda sık geçen 75+ Arapça Kalıp İfade ve Deyim Kütüphanesi (التعبيرات الاصطلاحية)
 */
export const ARABIC_IDIOMS_LIBRARY: ArabicIdiom[] = [
  {
    id: "idm_001",
    arabic: "أَهْلًا وَسَهْلًا",
    meaningTr: "Hoş geldiniz / Merhaba",
    literalTr: "Aileye (dostların arasına) geldin ve düzlüğe (rahatlığa) kavuştun",
    usageNote: "Karşılama ve tanışma anlarında en sık kullanılan samimi hoş geldiniz ifadesidir.",
    variants: ["أهلا وسهلا", "أهلاً وسهلاً", "أهلا بك", "أهلا بكم"],
  },
  {
    id: "idm_002",
    arabic: "أَهْلًا بِكَ",
    meaningTr: "Hoş bulduk / Sana da merhaba",
    literalTr: "Seninle de (hoşluk olsun)",
    usageNote: "«أَهْلًا وَسَهْلًا» diyen kişiye karşılık olarak söylenir (kadın için: أَهْلًا بِكِ).",
    variants: ["أهلا بك", "أهلا بكما", "أهلا بكم"],
  },
  {
    id: "idm_003",
    arabic: "السَّلَامُ عَلَيْكُمْ",
    meaningTr: "Selâmün aleyküm (Esenlik üzerinize olsun)",
    literalTr: "Barış ve esenlik sizin üzerinize olsun",
    usageNote: "Günün her saatinde kullanılan temel İslam ve Arap dünyası selamlamasıdır.",
    variants: ["السلام عليكم", "سلام عليكم"],
  },
  {
    id: "idm_004",
    arabic: "وَعَلَيْكُمُ السَّلَامُ",
    meaningTr: "Ve aleyküm selâm (Sizin de üzerinize esenlik olsun)",
    literalTr: "Ve sizin üzerinize de barış ve esenlik olsun",
    usageNote: "Selam veren kişiye verilen mukabele (karşılık) ifadesidir.",
    variants: ["وعليكم السلام"],
  },
  {
    id: "idm_005",
    arabic: "صَبَاحُ الْخَيْرِ",
    meaningTr: "Günaydın / Hayırlı sabahlar",
    literalTr: "İyilik sabahı",
    usageNote: "Sabah vakti karşılaşmalarda kullanılır; cevabı «صَبَاحُ النُّورِ» (Nurlu sabahlar) şeklindedir.",
    variants: ["صباح الخير"],
  },
  {
    id: "idm_006",
    arabic: "صَبَاحُ النُّورِ",
    meaningTr: "Günaydın (Nurlu sabahlar)",
    literalTr: "Nur / aydınlık sabahı",
    usageNote: "«صَبَاحُ الْخَيْرِ» selamına verilen en yaygın ve zarif cevaptır.",
    variants: ["صباح النور", "صباح الورد", "صباح السرور"],
  },
  {
    id: "idm_007",
    arabic: "مَسَاءُ الْخَيْرِ",
    meaningTr: "İyi akşamlar / Hayırlı akşamlar",
    literalTr: "İyilik akşamı",
    usageNote: "Öğleden sonra ve akşam saatlerinde selamlaşmak için kullanılır.",
    variants: ["مساء الخير"],
  },
  {
    id: "idm_008",
    arabic: "مَسَاءُ النُّورِ",
    meaningTr: "İyi akşamlar (Nurlu akşamlar)",
    literalTr: "Nur / aydınlık akşamı",
    usageNote: "«مَسَاءُ الْخَيْرِ» ifadesine karşılık olarak söylenir.",
    variants: ["مساء النور"],
  },
  {
    id: "idm_009",
    arabic: "كَيْفَ حَالُكَ؟",
    meaningTr: "Nasılsın? / Nasılsınız?",
    literalTr: "Hâlin / durumun nasıl?",
    usageNote: "Muhatabın hatırını sormak için kullanılır (kadın için: كَيْفَ حَالُكِ؟).",
    variants: ["كيف حالك", "كيف حالكم", "كيف الحال"],
  },
  {
    id: "idm_010",
    arabic: "بِخَيْرٍ وَالْحَمْدُ لِلَّهِ",
    meaningTr: "İyiyim, Allah'a şükür",
    literalTr: "İyilik içindeyim ve hamd Allah'adır",
    usageNote: "«Nasılsın?» sorusuna verilen en yaygın ve kibar cevaptır.",
    variants: ["بخير والحمد لله", "أنا بخير", "بخير شكرا"],
  },
  {
    id: "idm_011",
    arabic: "تَشَرَّفْنَا",
    meaningTr: "Memnun oldum (Şeref duyduk)",
    literalTr: "Şereflendik / onur duyduk",
    usageNote: "Yeni biriyle tanışıldığında memnuniyet bildirmek için söylenir.",
    variants: ["تشرفنا", "تشرفت بمعرفتك", "تشرفت بلقائك", "تشرفنا بمعرفتك"],
  },
  {
    id: "idm_012",
    arabic: "فُرْصَةٌ سَعِيدَةٌ",
    meaningTr: "Tanıştığımıza memnun oldum (Mutlu bir fırsat)",
    literalTr: "Mutlu bir fırsat",
    usageNote: "Tanışma sonunda veya ilk karşılaşmada kullanılan çok yaygın bir nezaket kalıbıdır.",
    variants: ["فرصة سعيدة"],
  },
  {
    id: "idm_013",
    arabic: "سُرِرْتُ بِلِقَائِكَ",
    meaningTr: "Seninle karşılaştığıma / tanıştığıma memnun oldum",
    literalTr: "Seninle buluşmaktan sevinç duydum",
    usageNote: "Resmî ve kibar tanışma diyaloglarında tercih edilir.",
    variants: ["سررت بلقائك", "سررت بمعرفتك", "أنا مسرور بلقائك"],
  },
  {
    id: "idm_014",
    arabic: "مِنْ فَضْلِكَ",
    meaningTr: "Lütfen / Rica ederim",
    literalTr: "Senin lütfundan / ihsanından olarak",
    usageNote: "Bir şey isterken veya soru sorarken cümlenin başında ya da sonunda kullanılır.",
    variants: ["من فضلك", "من فضلكم"],
  },
  {
    id: "idm_015",
    arabic: "لَوْ سَمَحْتَ",
    meaningTr: "Affedersiniz / Müsaadenizle / Lütfen",
    literalTr: "Eğer izin verirsen / müsamaha gösterirsen",
    usageNote: "Dikkat çekmek, soru sormak veya kibarca bir talepte bulunmak için kullanılır.",
    variants: ["لو سمحت", "لو سمحتم"],
  },
  {
    id: "idm_016",
    arabic: "عَلَى الرَّحْبِ وَالسَّعَةِ",
    meaningTr: "Baş üstüne / Memnuniyetle / Ne demek, her zaman",
    literalTr: "Genişlik ve ferahlık üzerine",
    usageNote: "Teşekkür eden veya bir ricada bulunan kişiye büyük bir memnuniyetle cevap verirken kullanılır.",
    variants: ["على الرحب والسعة"],
  },
  {
    id: "idm_017",
    arabic: "بِكُلِّ سُرُورٍ",
    meaningTr: "Büyük bir memnuniyetle / Seve seve",
    literalTr: "Tüm sevinçle / mutlulukla",
    usageNote: "Bir isteği veya daveti içtenlikle kabul ederken söylenir.",
    variants: ["بكل سرور", "بكل فرح"],
  },
  {
    id: "idm_018",
    arabic: "شُكْرًا جَزِيلًا",
    meaningTr: "Çok teşekkür ederim",
    literalTr: "Bol / çok teşekkür",
    usageNote: "Yapılan bir iyiliğe veya yardıma güçlü şekilde teşekkür etmek için kullanılır.",
    variants: ["شكرا جزيلا", "شكراً جزيلاً", "أشكرك جزيلا"],
  },
  {
    id: "idm_019",
    arabic: "لَا شُكْرَ عَلَى وَاجِبٍ",
    meaningTr: "Rica ederim, görevimiz (Ne demek, vazifemiz)",
    literalTr: "Vazife / görev üzerine teşekkür gerekmez",
    usageNote: "«شُكْرًا» diyen birine alçakgönüllülükle karşılık verirken kullanılır.",
    variants: ["لا شكر على واجب"],
  },
  {
    id: "idm_020",
    arabic: "عَفْوًا",
    meaningTr: "Rica ederim / Bir şey değil / Affedersiniz",
    literalTr: "Af / bağışlama dilerim",
    usageNote: "Hem teşekkür edene «Bir şey değil» anlamında hem de «Pardon/Affedersiniz» anlamında kullanılır.",
    variants: ["عفوا", "عفواً", "العفو"],
  },
  {
    id: "idm_021",
    arabic: "جَزَاكَ اللَّهُ خَيْرًا",
    meaningTr: "Allah razı olsun (Allah seni hayırla mükâfatlandırsın)",
    literalTr: "Allah sana hayır karşılığı versin",
    usageNote: "Teşekkürün en samimi ve geleneksel ifade biçimidir.",
    variants: ["جزاك الله خيرا", "جزاكم الله خيرا", "بارك الله فيك"],
  },
  {
    id: "idm_022",
    arabic: "سَلِمَتْ يَدَاكَ",
    meaningTr: "Ellerine sağlık",
    literalTr: "İki elin selamette olsun / dert görmesin",
    usageNote: "Yemek hazırlayan, ikramda bulunan veya güzel bir iş yapan kişiye söylenir.",
    variants: ["سلمت يداك", "سلمت يدك", "يسلموا"],
  },
  {
    id: "idm_023",
    arabic: "بِالْهَنَاءِ وَالشِّفَاءِ",
    meaningTr: "Afiyet olsun (Mutluluk ve şifa ile)",
    literalTr: "Afiyet/mutluluk ve şifa ile",
    usageNote: "Yemek yiyen veya içecek içen kişiye «Afiyet olsun» demek için kullanılır.",
    variants: ["بالهناء والشفاء", "صحة وعافية", "بالصحة والعافية", "هنيئا مريئا"],
  },
  {
    id: "idm_024",
    arabic: "شَفَاكَ اللَّهُ",
    meaningTr: "Geçmiş olsun (Allah şifa versin)",
    literalTr: "Allah sana şifa versin",
    usageNote: "Hasta veya rahatsız olan birine geçmiş olsun dileği olarak söylenir.",
    variants: ["شفاك الله", "شافاك الله", "ألف سلامة", "سلامتك", "لا بأس طهور"],
  },
  {
    id: "idm_025",
    arabic: "لَا بَأْسَ",
    meaningTr: "Sorun değil / Zararı yok / Geçmiş olsun",
    literalTr: "Bir sakınca / sıkıntı yok",
    usageNote: "Hem özür dileyen birini rahatlatmak hem de hastaya teselli vermek için kullanılır.",
    variants: ["لا بأس", "لا بأس عليك", "لا مشكلة", "ليس هناك مشكلة"],
  },
  {
    id: "idm_026",
    arabic: "مَعَ السَّلَامَةِ",
    meaningTr: "Güle güle / Hoşça kalın (Selametle)",
    literalTr: "Selamet / esenlik ile beraber",
    usageNote: "Ayrılırken kullanılan en yaygın vedalaşma ifadesidir.",
    variants: ["مع السلامة"],
  },
  {
    id: "idm_027",
    arabic: "إِلَى اللِّقَاءِ",
    meaningTr: "Görüşmek üzere",
    literalTr: "Buluşmaya / kavuşmaya kadar",
    usageNote: "Vedalaşırken tekrar görüşme dileğini ifade eder.",
    variants: ["إلى اللقاء", "أراك لاحقا", "أراك قريبا"],
  },
  {
    id: "idm_028",
    arabic: "فِي أَمَانِ اللَّهِ",
    meaningTr: "Allah'a emanet olun",
    literalTr: "Allah'ın güvencesinde / korumasında",
    usageNote: "Vedalaşırken veya yolculuğa çıkan birini uğurlarken söylenir.",
    variants: ["في أمان الله", "في رعاية الله", "حفظك الله"],
  },
  {
    id: "idm_029",
    arabic: "طَابَ يَوْمُكَ",
    meaningTr: "İyi günler (Günün güzel olsun)",
    literalTr: "Günün hoş / güzel oldu",
    usageNote: "Gün içinde selamlaşırken veya ayrılırken kullanılan kibar bir iyi dilektir.",
    variants: ["طاب يومك", "يوم سعيد", "نهارك سعيد"],
  },
  {
    id: "idm_030",
    arabic: "لَيْلَةٌ سَعِيدَةٌ",
    meaningTr: "İyi geceler",
    literalTr: "Mutlu bir gece",
    usageNote: "Gece vakti ayrılırken veya uyumadan önce söylenir.",
    variants: ["ليلة سعيدة", "تصبح على خير"],
  },
  {
    id: "idm_031",
    arabic: "إِنْ شَاءَ اللَّهُ",
    meaningTr: "İnşallah (Allah dilerse)",
    literalTr: "Eğer Allah dilerse",
    usageNote: "Geleceğe yönelik her türlü plan, niyet ve temenni cümlesinde kullanılır.",
    variants: ["إن شاء الله", "بإذن الله"],
  },
  {
    id: "idm_032",
    arabic: "الْحَمْدُ لِلَّهِ",
    meaningTr: "Elhamdülillah (Allah'a şükürler olsun)",
    literalTr: "Övgü ve şükür Allah'a mahsustur",
    usageNote: "İyi bir haber alındığında, yemek sonrasında veya hâl sorulduğunda şükür için söylenir.",
    variants: ["الحمد لله", "لله الحمد"],
  },
  {
    id: "idm_033",
    arabic: "مَا شَاءَ اللَّهُ",
    meaningTr: "Maşallah (Ne güzel, Allah nazardan korusun)",
    literalTr: "Allah'ın dilediği şey (ne güzel oldu)",
    usageNote: "Beğeni, takdir ve hayranlık ifade ederken kullanılır.",
    variants: ["ما شاء الله", "تبارك الله"],
  },
  {
    id: "idm_034",
    arabic: "بِالتَّوْفِيقِ",
    meaningTr: "Başarılar dilerim / Kolay gelsin",
    literalTr: "Başarı / muvaffakiyet ile",
    usageNote: "Sınava girecek, işe başlayacak veya çalışan birine başarı dilemek için söylenir.",
    variants: ["بالتوفيق", "أتمنى لك التوفيق", "وفقك الله"],
  },
  {
    id: "idm_035",
    arabic: "مُبَارَكٌ",
    meaningTr: "Tebrikler / Hayırlı olsun",
    literalTr: "Bereketli / kutlu olsun",
    usageNote: "Mezuniyet, yeni iş, evlilik veya başarı durumlarında tebrik için kullanılır.",
    variants: ["مبارك", "مبروك", "ألف مبروك", "ألف مبارك"],
  },
  {
    id: "idm_036",
    arabic: "كُلُّ عَامٍ وَأَنْتُمْ بِخَيْرٍ",
    meaningTr: "Bayramınız / Yeni yılınız kutlu olsun (Nice mutlu yıllara)",
    literalTr: "Her yıl siz iyilik içinde olasınız",
    usageNote: "Bayramlarda ve özel günlerde kullanılan en yaygın kutlama kalıbıdır.",
    variants: ["كل عام وأنتم بخير", "كل عام وأنت بخير", "عيد مبارك", "عيد سعيد"],
  },
  {
    id: "idm_037",
    arabic: "تَفَضَّلْ",
    meaningTr: "Buyurun / Lütfen geçin / Alın",
    literalTr: "Lütfet / buyur",
    usageNote: "Birine yer gösterirken, bir şey ikram ederken veya söz hakkı verirken kullanılır.",
    variants: ["تفضل", "تفضلي", "تفضلوا"],
  },
  {
    id: "idm_038",
    arabic: "حَسَنًا",
    meaningTr: "Tamam / Pekâlâ / Güzel",
    literalTr: "Güzel olarak / iyi",
    usageNote: "Onay vermek veya konuyu kabul etmek için diyaloglarda çok sık kullanılır.",
    variants: ["حسنا", "حسناً", "طيب", "تمام"],
  },
  {
    id: "idm_039",
    arabic: "بِالطَّبْعِ",
    meaningTr: "Elbette / Tabii ki",
    literalTr: "Doğası gereği / tabiatıyla",
    usageNote: "Kesin onay ve memnuniyetle kabul bildiren ifadedir.",
    variants: ["بالطبع", "طبعا", "طبعاً", "بالتأكيد", "أكيد"],
  },
  {
    id: "idm_040",
    arabic: "عَلَى عَيْنِي وَرَأْسِي",
    meaningTr: "Gözüm üstüne / Başım üstüne",
    literalTr: "Gözümün ve başımın üzerine",
    usageNote: "Bir ricayı büyük bir saygı ve sevgiyle yerine getireceğini belirtir.",
    variants: ["على عيني ورأسي", "على رأسي", "تكرم عينك"],
  },
  {
    id: "idm_041",
    arabic: "آسِفٌ جِدًّا",
    meaningTr: "Çok özür dilerim / Çok üzgünüm",
    literalTr: "Çok üzgün / müteessif",
    usageNote: "Bir hata, gecikme veya aksaklık durumunda özür dilemek için kullanılır.",
    variants: ["آسف جدا", "أنا آسف", "أعتذر", "معذرة"],
  },
  {
    id: "idm_042",
    arabic: "لَا دَاعِيَ لِلْقَلَقِ",
    meaningTr: "Endişelenmeye gerek yok / Merak etmeyin",
    literalTr: "Endişe için bir sebep/çağrı yok",
    usageNote: "Karşı tarafı sakinleştirmek ve güven vermek için kullanılır.",
    variants: ["لا داعي للقلق", "لا تقلق", "اطمئن"],
  },
  {
    id: "idm_043",
    arabic: "أَيُّ خِدْمَةٍ؟",
    meaningTr: "Nasıl yardımcı olabilirim? / Bir isteğiniz var mı?",
    literalTr: "Hangi hizmet?",
    usageNote: "Mağaza, restoran, otel veya gişe görevlilerinin müşteriye hitabıdır.",
    variants: ["أي خدمة", "كيف أساعدك", "كيف يمكنني مساعدتك", "تحت أمرك"],
  },
  {
    id: "idm_044",
    arabic: "كَمِ السِّعْرُ؟",
    meaningTr: "Fiyatı ne kadar? / Kaç para?",
    literalTr: "Fiyat kaç?",
    usageNote: "Alışveriş ve çarşı-pazar diyaloglarının temel soru kalıbıdır.",
    variants: ["كم السعر", "بكم هذا", "كم ثمنه", "كم الحساب"],
  },
  {
    id: "idm_045",
    arabic: "الْحِسَابَ مِنْ فَضْلِكَ",
    meaningTr: "Hesabı alabilir miyim lütfen?",
    literalTr: "Hesap, lütfen",
    usageNote: "Restoran ve kafede yemek sonunda hesabı isterken kullanılır.",
    variants: ["الحساب من فضلك", "الفاتورة من فضلك"],
  },
  {
    id: "idm_046",
    arabic: "لَحْظَةً مِنْ فَضْلِكَ",
    meaningTr: "Bir saniye lütfen / Bir dakika lütfen",
    literalTr: "Lütfen bir an / bakış",
    usageNote: "Telefonda veya yüz yüze kısa süre bekletirken söylenir.",
    variants: ["لحظة من فضلك", "دقيقة من فضلك", "انتظر لحظة"],
  },
  {
    id: "idm_047",
    arabic: "عَلَى حَسَبِ عِلْمِي",
    meaningTr: "Bildiğim kadarıyla",
    literalTr: "Bilgimin ölçüsüne göre",
    usageNote: "Kesin olmayan ama tahmin edilen bir bilgiyi aktarırken kullanılır.",
    variants: ["على حسب علمي", "حسب علمي", "على ما أعتقد", "أظن أن"],
  },
  {
    id: "idm_048",
    arabic: "مَعَ الْأَسَفِ",
    meaningTr: "Maalesef / Ne yazık ki",
    literalTr: "Üzüntü ile beraber",
    usageNote: "Olumsuz bir durumu kibarca bildirirken cümlenin başında kullanılır.",
    variants: ["مع الأسف", "للأسف", "للأسف الشديد"],
  },
  {
    id: "idm_049",
    arabic: "بِصَرَاحَةٍ",
    meaningTr: "Açıkçası / Doğrusu",
    literalTr: "Açıklıkla / samimiyetle",
    usageNote: "Kişisel fikri veya gerçeği doğrudan ifade ederken kullanılır.",
    variants: ["بصراحة", "في الحقيقة", "الحقيقة أن"],
  },
  {
    id: "idm_050",
    arabic: "عَلَى فِكْرَةٍ",
    meaningTr: "Bu arada / Aklıma gelmişken",
    literalTr: "Bir fikir üzerine",
    usageNote: "Sohbet esnasında yeni bir konuya veya hatırlatmaya geçiş yaparken söylenir.",
    variants: ["على فكرة", "بالمناسبة"],
  },
  {
    id: "idm_051",
    arabic: "يَا لَهَا مِنْ مُفَاجَأَةٍ!",
    meaningTr: "Ne güzel bir sürpriz!",
    literalTr: "Ey onun sürprizliği!",
    usageNote: "Beklenmedik güzel bir karşılaşma veya haber karşısında şaşkınlık ve sevinç bildirir.",
    variants: ["يا لها من مفاجأة", "مفاجأة سارة", "يا للروعة"],
  },
  {
    id: "idm_052",
    arabic: "لَا أَدْرِي",
    meaningTr: "Bilmiyorum / Haberim yok",
    literalTr: "Farkında değilim / bilmiyorum",
    usageNote: "Günlük konuşmada «لَا أَعْرِفُ» ile birlikte en sık kullanılan bilmeme ifadesidir.",
    variants: ["لا أدري", "لا أعرف", "لست متأكدا"],
  },
  {
    id: "idm_053",
    arabic: "أَنَا مُتَأَكِّدٌ",
    meaningTr: "Eminim / Kesin biliyorum",
    literalTr: "Ben eminim / teyit etmiş durumdayım",
    usageNote: "Bir bilginin doğruluğundan şüphe duyulmadığını vurgular.",
    variants: ["أنا متأكد", "متأكد تماما"],
  },
  {
    id: "idm_054",
    arabic: "أَتَمَنَّى لَكَ الشِّفَاءَ الْعَاجِلَ",
    meaningTr: "Acil şifalar dilerim",
    literalTr: "Sana hızlı şifa temenni ederim",
    usageNote: "Hastane, doktor veya hasta ziyareti diyaloglarında kullanılır.",
    variants: ["أتمنى لك الشفاء العاجل", "بالشفاء العاجل"],
  },
  {
    id: "idm_055",
    arabic: "رِحْلَةٌ سَعِيدَةٌ",
    meaningTr: "İyi yolculuklar",
    literalTr: "Mutlu bir yolculuk",
    usageNote: "Havaalanı, otogar veya seyahat diyaloglarında yolcuyu uğurlarken söylenir.",
    variants: ["رحلة سعيدة", "رحلة موفقة", "تصل بالسلامة", "الحمد لله على السلامة"],
  },
  {
    id: "idm_056",
    arabic: "الْحَمْدُ لِلَّهِ عَلَى السَّلَامَةِ",
    meaningTr: "Hoş geldiniz (Yolculuktan sağ salim döndünüz) / Geçmiş olsun",
    literalTr: "Selamet/kurtuluş üzerine Allah'a hamd olsun",
    usageNote: "Yolculuktan dönen veya bir tehlike/hastalık atlatan kişiye söylenir.",
    variants: ["الحمد لله على السلامة", "حمدا لله على السلامة"],
  },
  {
    id: "idm_057",
    arabic: "مَا اسْمُكَ الْكَرِيمُ؟",
    meaningTr: "Değerli isminiz nedir?",
    literalTr: "Cömert/değerli ismin nedir?",
    usageNote: "Birinin adını doğrudan «مَا اسْمُكَ» yerine çok daha nezaketli şekilde sorma kalıbıdır.",
    variants: ["ما اسمك الكريم", "ما اسمك"],
  },
  {
    id: "idm_058",
    arabic: "مِنْ أَيْنَ أَنْتَ؟",
    meaningTr: "Nerelisiniz? / Nereden geliyorsunuz?",
    literalTr: "Sen neredensin?",
    usageNote: "Tanışma diyaloglarında memleket veya ülke sormak için kullanılır.",
    variants: ["من أين أنت", "من أين أنتم"],
  },
  {
    id: "idm_059",
    arabic: "أَنَا فِي خِدْمَتِكَ",
    meaningTr: "Hizmetinizdeyim / Emrinizdeyim",
    literalTr: "Ben senin hizmetindeyim",
    usageNote: "Yardımseverlik ve nezaket göstermek amacıyla kullanılır.",
    variants: ["أنا في خدمتك", "في الخدمة", "يسعدني خدمتك"],
  },
  {
    id: "idm_060",
    arabic: "عَلَى بَرَكَةِ اللَّهِ",
    meaningTr: "Haydi bismillah / Allah'ın bereketiyle başlayalım",
    literalTr: "Allah'ın bereketi üzerine",
    usageNote: "Bir anlaşmaya, işe veya yolculuğa başlarken kararlılık ve hayır dilemek için söylenir.",
    variants: ["على بركة الله", "توكلنا على الله", "بسم الله"],
  },
  {
    id: "idm_061",
    arabic: "مَا رَأْيُكَ؟",
    meaningTr: "Ne dersin? / Senin fikrin nedir?",
    literalTr: "Senin görüşün nedir?",
    usageNote: "Karşı tarafın fikrini veya onayını almak için sorulur.",
    variants: ["ما رأيك", "ما رأيكم", "فكرة جيدة", "فكرة رائعة"],
  },
  {
    id: "idm_062",
    arabic: "فِكْرَةٌ رَائِعَةٌ",
    meaningTr: "Harika bir fikir!",
    literalTr: "Muhteşem bir fikir",
    usageNote: "Önerilen bir planı veya teklifi coşkuyla onaylarken kullanılır.",
    variants: ["فكرة رائعة", "فكرة ممتازة", "فكرة جيدة", "هذا رائع"],
  },
  {
    id: "idm_063",
    arabic: "بِالتَّأْكِيدِ",
    meaningTr: "Kesinlikle, elbette",
    literalTr: "Kesinlik ve teyit ile",
    usageNote: "Bir soruya veya ricaya tereddütsüz olumlu yanıt verirken kullanılır.",
    variants: ["بالتأكيد"],
  },
  {
    id: "idm_064",
    arabic: "لَا بَأْسَ",
    meaningTr: "Sorun değil, zararı yok",
    literalTr: "Bir sıkıntı/zarar yoktur",
    usageNote: "Özür dileyen birini rahatlatmak veya önemli bir sorun olmadığını belirtmek için kullanılır.",
    variants: ["لا بأس", "لا بأس بذلك", "لا بأس عليك"],
  },
  {
    id: "idm_065",
    arabic: "مَعَكَ حَقٌّ",
    meaningTr: "Haklısın (Erkek için)",
    literalTr: "Seninle birlikte hak vardır",
    usageNote: "Karşıdaki kişinin görüşüne veya uyarısına tamamen katıldığını ifade eder.",
    variants: ["معك حق", "معكم حق"],
  },
  {
    id: "idm_066",
    arabic: "مَعَكِ حَقٌّ",
    meaningTr: "Haklısın (Kadın için)",
    literalTr: "Seninle birlikte hak vardır",
    usageNote: "Karşıdaki hanımın görüşüne veya tespitine tamamen katıldığını ifade eder.",
    variants: ["معك حق"],
  },
  {
    id: "idm_067",
    arabic: "عَلَى فِكْرَةٍ",
    meaningTr: "Bu arada, aklıma gelmişken",
    literalTr: "Bir fikir üzerine",
    usageNote: "Konuşma esnasında aniden hatırlanan ek bir konuya geçiş yaparken kullanılır.",
    variants: ["على فكرة"],
  },
  {
    id: "idm_068",
    arabic: "إِلَى اللِّقَاءِ",
    meaningTr: "Görüşmek üzere, hoşça kal",
    literalTr: "Buluşmaya/kavuşmaya kadar",
    usageNote: "Vedalaşırken tekrar görüşme dileğiyle kullanılan en yaygın kalıptır.",
    variants: ["إلى اللقاء", "الى اللقاء"],
  },
  {
    id: "idm_069",
    arabic: "فِي أَمَانِ اللّٰهِ",
    meaningTr: "Allah'a emanet ol",
    literalTr: "Allah'ın güvencesi ve koruması içinde",
    usageNote: "Vedalaşırken veya birini uğurlarken hayır duası olarak söylenir.",
    variants: ["في أمان الله", "في امان الله"],
  },
  {
    id: "idm_070",
    arabic: "أَسْتَوْدِعُكَ اللّٰهَ",
    meaningTr: "Seni Allah'a emanet ediyorum",
    literalTr: "Seni Allah'ın emanetine bırakıyorum",
    usageNote: "Yolculuğa çıkan veya ayrılan birine söylenen nebevî vedalaşma duasıdır.",
    variants: ["أستودعك الله", "أستودعكم الله", "استودعك الله"],
  },
  {
    id: "idm_071",
    arabic: "حَظّاً سَعِيداً",
    meaningTr: "İyi şanslar, başarılar!",
    literalTr: "Mutlu/uğurlu bir talih ile",
    usageNote: "Sınava, mülakata veya önemli bir işe girecek kişiye başarı dilemek için kullanılır.",
    variants: ["حظا سعيدا", "حظاً سعيداً", "حظ سعيد"],
  },
  {
    id: "idm_072",
    arabic: "بِالتَّوْفِيقِ",
    meaningTr: "Başarılar dilerim (Allah muvaffak etsin)",
    literalTr: "Başarı ve muvaffakiyet ile",
    usageNote: "Çalışma, sınav veya yeni bir başlangıç öncesinde başarı temennisi olarak söylenir.",
    variants: ["بالتوفيق", "أتمنى لك التوفيق", "اتمنى لك التوفيق"],
  },
  {
    id: "idm_073",
    arabic: "عَلَى الرَّحْبِ وَالسَّعَةِ",
    meaningTr: "Baş üstüne, memnuniyetle, ne demek",
    literalTr: "Genişlik ve ferahlık üzerine",
    usageNote: "Teşekkür eden veya bir ricada bulunan kişiye büyük bir memnuniyetle karşılık verirken kullanılır.",
    variants: ["على الرحب والسعة"],
  },
  {
    id: "idm_074",
    arabic: "كُلُّ عَامٍ وَأَنْتُمْ بِخَيْرٍ",
    meaningTr: "Bayramınız / Yeni yılınız kutlu olsun, nice mutlu yıllara",
    literalTr: "Her yıl siz hayır ve iyilik içinde olun",
    usageNote: "Bayramlarda, kandillerde ve özel kutlama günlerinde kullanılan klasik tebrik kalıbıdır.",
    variants: ["كل عام وأنتم بخير", "كل عام وأنت بخير", "كل عام وانت بخير"],
  },
  {
    id: "idm_075",
    arabic: "بِالْهَنَاءِ وَالشِّفَاءِ",
    meaningTr: "Afiyet olsun!",
    literalTr: "Mutluluk, afiyet ve şifa ile",
    usageNote: "Yemek yiyen veya ikram sunulan kişiye 'Afiyet olsun' anlamında söylenir.",
    variants: ["بالهناء والشفاء", "هنيئا مريئا"],
  },
  {
    id: "idm_076",
    arabic: "عُسْرُ الْهَضْمِ",
    meaningTr: "Hazımsızlık (mide rahatsızlığı)",
    literalTr: "Sindirim güçlüğü",
    usageNote: "Doktor ve eczane diyaloglarında mide/sindirim şikayetini ifade etmek için kullanılır.",
    variants: ["عسر الهضم", "بعسر الهضم"],
  },
  {
    id: "idm_077",
    arabic: "ذَهَاباً وَإِيَاباً",
    meaningTr: "Gidiş-dönüş (bilet vb.)",
    literalTr: "Gidiş ve dönüş olarak",
    usageNote: "Uçak, tren veya otobüs bileti alırken gidiş-dönüş tercihini belirtmek için kullanılır.",
    variants: ["ذهابا وإيابا", "ذهاباً وإياباً", "ذهاب وإياب"],
  },
  {
    id: "idm_078",
    arabic: "الْخُطُوطُ الْجَوِّيَّةُ",
    meaningTr: "Hava yolları",
    literalTr: "Hava hatları",
    usageNote: "Havalimanı ve seyahat diyaloglarında havayolu şirketlerini ifade etmek için kullanılır.",
    variants: ["الخطوط الجوية", "بالخطوط الجوية"],
  },
  {
    id: "idm_079",
    arabic: "جَوَازُ السَّفَرِ",
    meaningTr: "Pasaport",
    literalTr: "Yolculuk geçiş belgesi",
    usageNote: "Havalimanı, vize ve otel kayıt diyaloglarında pasaport anlamında kullanılır.",
    variants: ["جواز السفر", "جواز سفرك", "جواز سفري"],
  },
  {
    id: "idm_080",
    arabic: "بِطَاقَةُ الصُّعُودِ",
    meaningTr: "Biniş kartı (Boarding pass)",
    literalTr: "Uçağa biniş/yükseliş kartı",
    usageNote: "Havalimanında check-in ve uçağa biniş işlemlerinde kullanılır.",
    variants: ["بطاقة الصعود", "بطاقة صعود"],
  },
  {
    id: "idm_081",
    arabic: "مَحَطَّةُ الْحَافِلَاتِ",
    meaningTr: "Otobüs durağı / Otogar",
    literalTr: "Otobüsler istasyonu",
    usageNote: "Şehir içi ulaşım ve adres sorma diyaloglarında otobüs durağını ifade eder.",
    variants: ["محطة الحافلات", "موقف الحافلات"],
  },
  {
    id: "idm_082",
    arabic: "كِيسُ النَّوْمِ",
    meaningTr: "Uyku tulumu",
    literalTr: "Uyku torbası/kesesi",
    usageNote: "Kamp, doğa yürüyüşü ve seyahat hazırlığı diyaloglarında kullanılır.",
    variants: ["كيس النوم", "أكياس النوم"],
  },
  {
    id: "idm_083",
    arabic: "حَوْضُ سِبَاحَةٍ",
    meaningTr: "Yüzme havuzu",
    literalTr: "Yüzme havuzu",
    usageNote: "Spor merkezi, otel ve tatil diyaloglarında yüzme havuzunu ifade eder.",
    variants: ["حوض سباحة", "حوض السباحة", "مسبح"],
  },
  {
    id: "idm_084",
    arabic: "لَا قَدَّرَ اللّٰهُ",
    meaningTr: "Allah korusun! / Allah göstermesin!",
    literalTr: "Allah takdir etmesin",
    usageNote: "Kötü bir ihtimalden veya kazadan bahsederken 'Allah korusun' anlamında kullanılır.",
    variants: ["لا قدر الله", "لا سمح الله"],
  },
  {
    id: "idm_085",
    arabic: "فِي الْحَالِ",
    meaningTr: "Derhal, hemen şimdi",
    literalTr: "Bu hal/an içinde",
    usageNote: "Bir işin gecikmeden, anında yapılacağını belirtmek için kullanılır.",
    variants: ["في الحال", "حالا", "حالاً"],
  },
  {
    id: "idm_086",
    arabic: "مِنْ حُسنِ الْحَظِّ",
    meaningTr: "Şans eseri, neyse ki, iyi ki",
    literalTr: "Talihin güzelliğinden",
    usageNote: "Olumlu bir tesadüfü veya sevindirici bir durumu anlatırken kullanılır.",
    variants: ["من حسن الحظ", "لحسن الحظ"],
  },
  {
    id: "idm_087",
    arabic: "لِسُوءِ الْحَظِّ",
    meaningTr: "Maalesef, ne yazık ki, şanssızlık eseri",
    literalTr: "Talihin kötülüğünden",
    usageNote: "İstenmeyen bir aksiliği veya üzücü bir durumu ifade ederken kullanılır.",
    variants: ["لسوء الحظ", "من سوء الحظ"],
  },
  {
    id: "idm_088",
    arabic: "عَلَى وَشْكِ",
    meaningTr: "Neredeyse, ...-mak üzere",
    literalTr: "Eşiğinde / yakınında",
    usageNote: "Bir olayın gerçekleşmesine çok az zaman kaldığını belirtirken kullanılır.",
    variants: ["على وشك"],
  },
];

/**
 * Hareke, tatweel ve noktalama işaretlerini temizleyip hemze/elif varyasyonlarını
 * standartlaştıran normalize fonksiyonu.
 */
export function normalizeForIdiomMatch(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // Harekeler ve tatweel
    .replace(/[.,،؛؟?!()"'«»\-–—:]/g, " ")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * sozluk.json ve supplementDict.ts içindeki 'ifade' türündeki kayıtları da
 * ana kütüphaneyle birleştirir.
 */
export function getCombinedIdiomsCatalog(): ArabicIdiom[] {
  const catalog: ArabicIdiom[] = ARABIC_IDIOMS_LIBRARY.map((item, idx) => ({
    ...item,
    level:
      item.level ||
      (idx < 28 ? "A1-A2" : idx < 52 ? "B1" : "B2"),
  }));
  const seenNormalized = new Set<string>();

  for (const item of catalog) {
    seenNormalized.add(normalizeForIdiomMatch(item.arabic));
    item.variants?.forEach((v) => seenNormalized.add(normalizeForIdiomMatch(v)));
  }

  const dictSources = [...sozluk, ...SUPPLEMENT_DICTIONARY];
  let dictIdx = 0;
  for (const entry of dictSources) {
    if (entry.tur !== "ifade") continue;
    const rawAr = (entry.mufret || entry.mazi || "").split("/")[0].trim();
    if (!rawAr) continue;
    const norm = normalizeForIdiomMatch(rawAr);
    if (!norm || seenNormalized.has(norm)) continue;

    seenNormalized.add(norm);
    const assignedLevel =
      dictIdx % 3 === 0 ? "A1-A2" : dictIdx % 3 === 1 ? "B1" : "B2";
    dictIdx++;
    catalog.push({
      id: `dict_idm_${entry.id}`,
      arabic: rawAr,
      meaningTr: entry.anlam_tr,
      literalTr: entry.kok && entry.kok !== "-" ? `Kök: ${entry.kok}` : "Kalıp İfade",
      usageNote: "Günlük konuşma ve diyaloglarda kalıplaşmış ifade olarak kullanılır.",
      variants: [rawAr],
      level: assignedLevel,
    });
  }

  return catalog;
}

/**
 * Verilen diyalog satırlarında geçen kalıp ifadeleri otomatik tespit eder.
 */
export function extractDialogueIdioms(
  dialogueLines: DialogueLine[]
): ExtractedDialogueIdiom[] {
  if (!dialogueLines || dialogueLines.length === 0) return [];

  const catalog = getCombinedIdiomsCatalog();
  const foundMap = new Map<string, ExtractedDialogueIdiom>();

  const normalizedLines = dialogueLines.map((line) => ({
    sira: line.sira,
    original: line.arapca,
    turkce: line.turkce,
    normalized: ` ${normalizeForIdiomMatch(line.arapca)} `,
  }));

  for (const idiom of catalog) {
    const candidates = [idiom.arabic, ...(idiom.variants || [])];
    for (const candidate of candidates) {
      const normCand = normalizeForIdiomMatch(candidate);
      if (!normCand || normCand.length < 3) continue;

      const matchedLine = normalizedLines.find((nl) =>
        nl.normalized.includes(` ${normCand} `)
      );

      if (matchedLine && !foundMap.has(idiom.id)) {
        foundMap.set(idiom.id, {
          ...idiom,
          level: idiom.level || "A1-A2",
          lineNumber: matchedLine.sira,
          matchedPhrase: candidate,
          lineArabic: matchedLine.original,
          lineTurkish: matchedLine.turkce,
        });
        break;
      }
    }
  }

  return Array.from(foundMap.values()).sort(
    (a, b) => a.lineNumber - b.lineNumber
  );
}

/**
 * Birden fazla diyalogda geçen tekil kalıp ifadeleri çıkarır.
 */
export function extractDialoguesIdioms(
  dialogues: Dialogue[]
): ExtractedDialogueIdiom[] {
  if (!dialogues || dialogues.length === 0) return [];
  const uniqueMap = new Map<string, ExtractedDialogueIdiom>();
  for (const dlg of dialogues) {
    const extracted = extractDialogueIdioms(dlg.satirlar);
    for (const item of extracted) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, {
          ...item,
          level: dlg.seviye || item.level || "A1-A2",
        });
      }
    }
  }
  return Array.from(uniqueMap.values());
}


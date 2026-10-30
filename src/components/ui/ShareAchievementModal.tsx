"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  Share2,
  Copy,
  Check,
  Trophy,
  Sparkles,
  GraduationCap,
  CheckCircle2,
  QrCode,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { playClick, playSuccess } from "@/lib/sfxManager";

export interface HomeworkWeakWordItem {
  arabic: string;
  turkish: string;
}

export interface ShareAchievementProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  arabicTitle?: string;
  subtitle?: string;
  levelLabel?: string;
  scorePercent: number;
  pointsText?: string;
  wordsCount: number;
  badgeType?: "dialogue" | "exercise" | "homework";
  // Ödev Sonuç Raporu (Homework Mode) Ek Özellikleri
  homeworkTitle?: string;
  completionPercent?: number;
  listenedCount?: number;
  totalLinesCount?: number;
  pronPracticedCount?: number;
  pronTargetCount?: number;
  quizCompleted?: boolean;
  weakWordsList?: HomeworkWeakWordItem[];
  dialogueId?: string;
}

export interface TeacherHomeworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  dialogueId: string;
  dialogueTitleTr: string;
  dialogueTitleAr: string;
  levelLabel: string;
  totalLines: number;
}

const APP_URL = "https://app.muallimun.net";

/**
 * Öğrenci adı, diyalog ID, tamamlanma ve uyum puanından deterministik doğrulama kodu üretir.
 */
function computeVerificationCode(
  studentName: string,
  dialogueId: string,
  completionPct: number,
  scorePct: number
): string {
  const cleanName = (studentName || "OGRENCI").trim().toUpperCase();
  const dlgNum = dialogueId.replace(/\D+/g, "").padStart(2, "0") || "01";
  const dateKey = new Date().toISOString().slice(5, 10).replace("-", "");
  const raw = `${cleanName}|${dlgNum}|${completionPct}|${scorePct}|${dateKey}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
  return `HW-${dlgNum}-${hex}`;
}

/**
 * Reed-Solomon GF(256) QR Kod Üretici (Ödev Bağlantısı için)
 */
function computeReedSolomonEC(data: number[], ecCount: number): number[] {
  const gfExp = new Array<number>(512);
  const gfLog = new Array<number>(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    gfExp[i] = x;
    gfLog[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    gfExp[i] = gfExp[i - 255];
  }
  const gfMul = (a: number, b: number) =>
    a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]];

  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], gfExp[i]);
    }
    gen = next;
  }

  const msg = [...data, ...new Array<number>(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

function generateHomeworkQrSvg(urlText: string, size = 148): string {
  // Version 5-L (37x37): 108 data codewords (up to 106 UTF-8 bytes), 26 EC codewords
  const N = 37;
  const DATA_CODEWORDS = 108;
  const EC_CODEWORDS = 26;

  const utf8Bytes = Array.from(new TextEncoder().encode(urlText)).slice(
    0,
    DATA_CODEWORDS - 2
  );

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(utf8Bytes.length, 8);
  for (const b of utf8Bytes) pushBits(b, 8);
  pushBits(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  let padToggle = true;
  while (dataBytes.length < DATA_CODEWORDS) {
    dataBytes.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  const ecBytes = computeReedSolomonEC(dataBytes, EC_CODEWORDS);
  const allCodewords = [...dataBytes, ...ecBytes];
  const fullBits: number[] = [];
  for (const cw of allCodewords) {
    for (let i = 7; i >= 0; i--) fullBits.push((cw >> i) & 1);
  }
  for (let i = 0; i < 7; i++) fullBits.push(0);

  const grid: boolean[][] = Array.from({ length: N }, () =>
    Array(N).fill(false)
  );
  const reserved: boolean[][] = Array.from({ length: N }, () =>
    Array(N).fill(false)
  );

  const placeFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
          reserved[rr][cc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
            const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            grid[rr][cc] = isBorder || isInner;
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, N - 7);
  placeFinder(N - 7, 0);

  // Version 5 Alignment Pattern centered at (30, 30) -> top-left (28, 28)
  for (let r = 28; r <= 32; r++) {
    for (let c = 28; c <= 32; c++) {
      reserved[r][c] = true;
      const isBorder = r === 28 || r === 32 || c === 28 || c === 32;
      const isCenter = r === 30 && c === 30;
      grid[r][c] = isBorder || isCenter;
    }
  }

  for (let i = 8; i < N - 8; i++) {
    if (!reserved[6][i]) {
      reserved[6][i] = true;
      grid[6][i] = i % 2 === 0;
    }
    if (!reserved[i][6]) {
      reserved[i][6] = true;
      grid[i][6] = i % 2 === 0;
    }
  }

  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][N - 1 - i] = true;
    reserved[N - 1 - i][8] = true;
  }
  grid[N - 8][8] = true;

  let bitIdx = 0;
  let upward = true;
  for (let col = N - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < N; step++) {
      const r = upward ? N - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const dataBit =
            bitIdx < fullBits.length ? fullBits[bitIdx] === 1 : false;
          bitIdx++;
          const mask0 = (r + c) % 2 === 0;
          grid[r][c] = dataBit !== mask0;
        }
      }
    }
    upward = !upward;
  }

  const formatBits = 0x77c4;
  const fBit = (i: number) => ((formatBits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) grid[8][i] = fBit(i);
  grid[8][7] = fBit(6);
  grid[8][8] = fBit(7);
  grid[7][8] = fBit(8);
  for (let i = 9; i <= 14; i++) grid[14 - i][8] = fBit(i);
  for (let i = 0; i <= 7; i++) grid[8][N - 1 - i] = fBit(i);
  for (let i = 8; i <= 14; i++) grid[N - 15 + i][8] = fBit(i);

  const quietZone = 2;
  const totalView = N + quietZone * 2;
  const rects: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) {
        rects.push(
          `<rect x="${c + quietZone}" y="${
            r + quietZone
          }" width="1" height="1" fill="#0f172a" />`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalView} ${totalView}" width="${size}" height="${size}" shape-rendering="crispEdges" style="display:block;background:#ffffff;border:2px solid #cbd5e1;border-radius:12px;">${rects.join(
    ""
  )}</svg>`;
}

/**
 * ÖĞRETMEN İÇİN "🎓 ÖDEV OLUŞTUR" MODALI
 */
export function TeacherHomeworkModal({
  isOpen,
  onClose,
  dialogueId,
  dialogueTitleTr,
  levelLabel,
  totalLines,
}: TeacherHomeworkModalProps) {
  const [homeworkNote, setHomeworkNote] = useState("10-A Sınıfı Ödevi");
  const [taskListen, setTaskListen] = useState(true);
  const [taskPron, setTaskPron] = useState(true);
  const [pronMinCount, setPronMinCount] = useState(3);
  const [taskQuiz, setTaskQuiz] = useState(true);
  const [copied, setCopied] = useState(false);

  const homeworkUrl = useMemo(() => {
    const baseOrigin =
      typeof window !== "undefined" ? window.location.origin : APP_URL;
    const params = new URLSearchParams();
    params.set("hw", "1");
    if (taskListen) params.set("listen", "1");
    if (taskPron) params.set("pron", String(Math.max(1, pronMinCount)));
    else params.set("pron", "0");
    if (taskQuiz) params.set("quiz", "1");
    else params.set("quiz", "0");
    if (homeworkNote.trim()) {
      params.set("title", homeworkNote.trim().slice(0, 45));
    }
    return `${baseOrigin}/diyalog/${dialogueId}?${params.toString()}`;
  }, [dialogueId, homeworkNote, taskListen, taskPron, pronMinCount, taskQuiz]);

  const qrSvg = useMemo(
    () => generateHomeworkQrSvg(homeworkUrl, 136),
    [homeworkUrl]
  );

  const tasksSummaryText = useMemo(() => {
    const items: string[] = [];
    if (taskListen) items.push(`• Diyaloğu Dinle ve İncele (${totalLines} Cümle)`);
    if (taskPron)
      items.push(`• En Az ${pronMinCount} Cümlede Sesli Telaffuz Çalışması Yap`);
    if (taskQuiz)
      items.push(
        "• Diyalog Alıştırmalarını (Boşluk Doldurma & Eşleştirme) Tamamla"
      );
    return items.join("\n");
  }, [taskListen, taskPron, pronMinCount, taskQuiz, totalLines]);

  const whatsappMessage = `🎓 *${
    homeworkNote.trim() || "Arapça Diyalog Ödevi"
  }*\n📖 *Diyalog:* #${dialogueId.replace("dlg_", "")} ${dialogueTitleTr} (${levelLabel})\n\n*Görevleriniz:*\n${tasksSummaryText}\n\n👇 *Ödeve Başlamak İçin Tıklayın:*\n${homeworkUrl}`;

  if (!isOpen || typeof document === "undefined") return null;

  const handleCopyUrl = async () => {
    playClick();
    try {
      await navigator.clipboard.writeText(homeworkUrl);
      setCopied(true);
      playSuccess();
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border-2 border-[#6741D9] flex items-center justify-center text-[#6741D9] dark:text-[#d0bfff] shrink-0">
              <GraduationCap size={19} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] leading-tight">
                🎓 Öğretmen Ödev Bağlantısı Oluşturucu
              </h3>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                #{dialogueId.replace("dlg_", "")} {dialogueTitleTr} ({levelLabel})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[var(--foreground)] cursor-pointer"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* 1. Sınıf / Ödev Notu */}
        <div className="space-y-1">
          <label className="block text-xs font-extrabold text-[var(--foreground)]">
            1. Sınıf / Ödev Başlığı (İsteğe Bağlı)
          </label>
          <input
            type="text"
            value={homeworkNote}
            onChange={(e) => setHomeworkNote(e.target.value)}
            placeholder="Örn: 10-A Sınıfı Haftalık Arapça Ödevi"
            maxLength={45}
            className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs font-bold text-[var(--foreground)] focus:outline-none focus:border-[#6741D9]"
          />
        </div>

        {/* 2. Görev Seçimi */}
        <div className="space-y-1.5">
          <span className="block text-xs font-extrabold text-[var(--foreground)]">
            2. Öğrenci Görevlerini Seçin
          </span>

          <div className="space-y-1.5">
            {/* Görev 1 */}
            <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] cursor-pointer hover:border-[#0CA678]">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={taskListen}
                  onChange={(e) => {
                    playClick();
                    setTaskListen(e.target.checked);
                  }}
                  className="w-4 h-4 accent-[#0CA678] rounded cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--foreground)]">
                  1. Diyaloğu Dinle ve İncele ({totalLines} Cümle)
                </span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                Dinleme
              </span>
            </label>

            {/* Görev 2 */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] hover:border-[#6741D9]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskPron}
                  onChange={(e) => {
                    playClick();
                    setTaskPron(e.target.checked);
                  }}
                  className="w-4 h-4 accent-[#6741D9] rounded cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--foreground)]">
                  2. En Az {pronMinCount} Cümlede Telaffuz Çalışması Yap
                </span>
              </label>
              <div className="flex items-center gap-1">
                {[2, 3, 5].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      playClick();
                      setTaskPron(true);
                      setPronMinCount(cnt);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border cursor-pointer ${
                      taskPron && pronMinCount === cnt
                        ? "bg-[#6741D9] text-white border-[#5230B5]"
                        : "bg-[#F7EFE1] dark:bg-[var(--surface)] text-slate-600 dark:text-slate-300 border-[#E6D7BE]"
                    }`}
                  >
                    {cnt} Cümle
                  </button>
                ))}
              </div>
            </div>

            {/* Görev 3 */}
            <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] cursor-pointer hover:border-amber-500">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={taskQuiz}
                  onChange={(e) => {
                    playClick();
                    setTaskQuiz(e.target.checked);
                  }}
                  className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--foreground)]">
                  3. Diyalog Alıştırmalarını (Boşluk Doldurma &amp; Eşleştirme) Tamamla
                </span>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 shrink-0">
                Quiz
              </span>
            </label>
          </div>
        </div>

        {/* 3. Üretilen Ödev Bağlantısı + QR Kod */}
        <div className="rounded-2xl bg-[#F7EFE1] dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] p-3 flex flex-col sm:flex-row items-center gap-3">
          <div
            className="shrink-0 bg-white p-1.5 rounded-xl border border-[#E6D7BE] shadow-2xs"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex-1 min-w-0 space-y-1.5 text-center sm:text-left w-full">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-extrabold text-[#087F5B] dark:text-[#20c997]">
              <QrCode size={14} />
              <span>Paylaşılabilir Ödev Bağlantısı &amp; QR Kod</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 leading-snug">
              Öğrenciler bu bağlantıya tıkladığında veya QR kodu okuttuğunda{" "}
              <strong>📋 Ödev Takip Çubuğu</strong> otomatik açılır ve bitirdiklerinde size{" "}
              <strong>Doğrulama Kodlu Ödev Sonuç Kartı</strong> gönderebilirler.
            </p>
            <div className="p-2 rounded-lg bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] dark:border-[var(--border)] text-[10px] font-mono text-slate-700 dark:text-slate-200 truncate">
              {homeworkUrl}
            </div>
          </div>
        </div>

        {/* 4. Aksiyon Butonları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopyUrl}
            className="py-2.5 px-4 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white font-extrabold text-xs border-b-3 border-[#3b1f8c] active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={15} />
                <span>📋 Bağlantı Kopyalandı!</span>
              </>
            ) : (
              <>
                <Copy size={15} />
                <span>📋 Bağlantıyı Kopyala</span>
              </>
            )}
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => playClick()}
            className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs border-b-3 border-emerald-800 active:translate-y-0.5 flex items-center justify-center gap-1.5 transition-all"
          >
            <Share2 size={15} />
            <span>📲 WhatsApp&apos;ta Paylaş</span>
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ShareAchievementModal({
  isOpen,
  onClose,
  title,
  arabicTitle,
  subtitle,
  levelLabel = "A1-B2",
  scorePercent,
  pointsText,
  wordsCount,
  badgeType = "dialogue",
  homeworkTitle,
  completionPercent = 100,
  listenedCount = 0,
  totalLinesCount = 0,
  pronPracticedCount = 0,
  pronTargetCount = 3,
  quizCompleted = false,
  weakWordsList = [],
  dialogueId = "dlg_01",
}: ShareAchievementProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [studentName, setStudentName] = useState<string>("");

  const isHomework = badgeType === "homework";

  const verificationCode = useMemo(
    () =>
      computeVerificationCode(
        studentName,
        dialogueId,
        completionPercent,
        scorePercent
      ),
    [studentName, dialogueId, completionPercent, scorePercent]
  );

  const weakWordsSummaryText = useMemo(() => {
    if (!weakWordsList || weakWordsList.length === 0) {
      return "Tüm hedef kelimelerde başarılı!";
    }
    return weakWordsList
      .slice(0, 4)
      .map((w) => `${w.arabic} (${w.turkish})`)
      .join(", ");
  }, [weakWordsList]);

  const shareMessage = isHomework
    ? `📋 *ÖDEV SONUÇ RAPORU — ${homeworkTitle || "Arapça Diyalog Ödevi"}*\n👤 *Öğrenci:* ${
        studentName.trim() || "Belirtilmedi"
      }\n📖 *Diyalog:* ${title} (${levelLabel})\n✅ *Tamamlanma Oranı:* %${completionPercent} (Dinleme: ${listenedCount}/${totalLinesCount} • Telaffuz: ${pronPracticedCount}/${pronTargetCount} • Alıştırma: ${
        quizCompleted ? "Tamamlandı ✓" : "Eksik"
      })\n🎙️ *Ortalama Telaffuz/Alıştırma Uyumu:* %${scorePercent}\n📌 *Tekrar Edilecek Kelimeler:* ${weakWordsSummaryText}\n🔐 *Doğrulama Kodu:* #${verificationCode}\n🌐 ${APP_URL}`
    : `🎯 Arapça Telaffuz ve Diyalog Asistanı ile "${title}" çalışmamı %${scorePercent} başarı oranıyla tamamladım! (${wordsCount} Kelime • Seviye: ${levelLabel})\n👉 Hemen ücretsiz dene: ${APP_URL}`;

  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const renderCardToCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof document !== "undefined" && "fonts" in document) {
      await document.fonts.ready;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    // 1. Arka Plan (Sıcak Krem & Zümrüt Degrade Çerçeve)
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#FDFBF7");
    bgGrad.addColorStop(0.5, "#F7EFE1");
    bgGrad.addColorStop(1, "#EFE3CE");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Dekoratif Köşe Daireleri
    ctx.save();
    ctx.fillStyle = "rgba(12, 166, 120, 0.06)";
    ctx.beginPath();
    ctx.arc(W - 80, 100, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(103, 65, 217, 0.05)";
    ctx.beginPath();
    ctx.arc(100, H - 140, 240, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dış Çerçeve
    drawRoundRect(ctx, 36, 36, W - 72, H - 72, 42);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#E6D7BE";
    ctx.stroke();

    drawRoundRect(ctx, 50, 50, W - 100, H - 100, 34);
    ctx.lineWidth = 3;
    ctx.strokeStyle = isHomework ? "#6741D9" : "#0CA678";
    ctx.stroke();

    // 2. Üst Başlık Bandı (Logo + Uygulama Adı)
    drawRoundRect(ctx, 84, 78, W - 168, 114, 28);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#E6D7BE";
    ctx.stroke();

    try {
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
        logoImg.src = "/icons/android-chrome-192x192.png";
      });
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        drawRoundRect(ctx, 106, 95, 78, 78, 20);
        ctx.fillStyle = "#F7EFE1";
        ctx.fill();
        ctx.drawImage(logoImg, 112, 101, 66, 66);
      }
    } catch {
      // ignore logo error
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#087F5B";
    ctx.font = "800 21px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      isHomework
        ? `DOĞRULAMA KODU: #${verificationCode}`
        : "EĞİTİM VE TELAFFUZ PLATFORMU",
      204,
      124
    );

    ctx.fillStyle = "#2B241D";
    ctx.font = "900 30px system-ui, -apple-system, sans-serif";
    ctx.fillText("Arapça Telaffuz ve Diyalog Asistanı", 204, 164);

    // 3. Başarı / Ödev Rozeti
    ctx.textAlign = "center";
    drawRoundRect(ctx, W / 2 - 260, 212, 520, 54, 27);
    const pillGrad = ctx.createLinearGradient(
      W / 2 - 260,
      212,
      W / 2 + 260,
      266
    );
    if (isHomework) {
      pillGrad.addColorStop(0, "#6741D9");
      pillGrad.addColorStop(1, "#4C28B5");
    } else {
      pillGrad.addColorStop(0, "#0CA678");
      pillGrad.addColorStop(1, "#087F5B");
    }
    ctx.fillStyle = pillGrad;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      isHomework
        ? `📋 ÖDEV SONUÇ RAPORU • ${(homeworkTitle || "ÖDEV").toUpperCase()}`
        : badgeType === "dialogue"
        ? "🏆 DİYALOG BAŞARI BELGESİ"
        : "🏆 ALIŞTIRMA BAŞARI KARTI",
      W / 2,
      248
    );

    // 4. Ana İçerik Kartı
    drawRoundRect(ctx, 84, 286, W - 168, isHomework ? 255 : 270, 32);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#E6D7BE";
    ctx.stroke();

    if (isHomework) {
      // Öğrenci Adı & Kur Seviyesi
      ctx.fillStyle = "#4C28B5";
      ctx.font = "800 24px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        `👤 Öğrenci: ${studentName.trim() || "İsimsiz Öğrenci"}   •   Seviye: ${levelLabel}`,
        W / 2,
        332
      );

      if (arabicTitle) {
        ctx.fillStyle = "#087F5B";
        ctx.font =
          "bold 42px 'Arakom', 'Noto Naskh Arabic', 'Amiri', system-ui, serif";
        ctx.fillText(arabicTitle, W / 2, 396);
      }

      ctx.fillStyle = "#2B241D";
      ctx.font = "900 34px system-ui, -apple-system, sans-serif";
      const truncatedTitle =
        title.length > 38 ? `${title.slice(0, 36)}...` : title;
      ctx.fillText(truncatedTitle, W / 2, arabicTitle ? 454 : 420);

      ctx.fillStyle = "#5C5142";
      ctx.font = "700 21px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        `Dinleme: ${listenedCount}/${totalLinesCount} Cümle  •  Telaffuz: ${pronPracticedCount}/${pronTargetCount} Cümle  •  Alıştırma: ${
          quizCompleted ? "Tamamlandı ✓" : "Bekliyor"
        }`,
        W / 2,
        508
      );
    } else {
      // Kur Seviye Rozeti
      drawRoundRect(ctx, W / 2 - 140, 310, 280, 44, 16);
      ctx.fillStyle = "#F3F0FF";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#6741D9";
      ctx.stroke();

      ctx.fillStyle = "#6741D9";
      ctx.font = "800 21px system-ui, -apple-system, sans-serif";
      ctx.fillText(`KUR SEVİYESİ: ${levelLabel}`, W / 2, 339);

      if (arabicTitle) {
        ctx.fillStyle = "#087F5B";
        ctx.font =
          "bold 46px 'Arakom', 'Noto Naskh Arabic', 'Amiri', system-ui, serif";
        ctx.fillText(arabicTitle, W / 2, 412);
      }

      ctx.fillStyle = "#2B241D";
      ctx.font = "900 38px system-ui, -apple-system, sans-serif";
      const truncatedTitle =
        title.length > 38 ? `${title.slice(0, 36)}...` : title;
      ctx.fillText(truncatedTitle, W / 2, arabicTitle ? 476 : 439);

      ctx.fillStyle = "#7C6F5B";
      ctx.font = "700 24px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        subtitle || "Sesli Telaffuz, Kelime ve Cümle Pratiği Tamamlandı",
        W / 2,
        526
      );
    }

    // 5. 3'lü İstatistik Kutuları
    const boxY = isHomework ? 562 : 596;
    const boxW = 286;
    const boxH = isHomework ? 168 : 195;
    const gap = 28;
    const startX = 84;

    const stats = isHomework
      ? [
          {
            label: "TAMAMLANMA ORANI",
            value: `%${completionPercent}`,
            sub:
              completionPercent >= 100
                ? "Tüm Görevler Tamam"
                : "Kısmi Tamamlama",
            bg: "#ECFDF5",
            border: "#0CA678",
            color: "#087F5B",
          },
          {
            label: "TELAFFUZ / UYUM",
            value: `%${scorePercent}`,
            sub: scorePercent >= 80 ? "Yüksek Başarı" : "Geliştirilebilir",
            bg: "#F3F0FF",
            border: "#6741D9",
            color: "#5230B5",
          },
          {
            label: "DOĞRULAMA KODU",
            value: `#${verificationCode}`,
            sub: new Date().toLocaleDateString("tr-TR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
            bg: "#FFFBEB",
            border: "#F59E0B",
            color: "#B45309",
          },
        ]
      : [
          {
            label: "BAŞARI / TELAFFUZ",
            value: `%${scorePercent}`,
            sub: scorePercent >= 85 ? "Mükemmel Uyum" : "Başarılı Pratik",
            bg: "#ECFDF5",
            border: "#0CA678",
            color: "#087F5B",
          },
          {
            label: "ÇALIŞILAN KELİME",
            value: `${wordsCount}`,
            sub: "Kelime & Kalıp",
            bg: "#F3F0FF",
            border: "#6741D9",
            color: "#5230B5",
          },
          {
            label: "DEĞERLENDİRME",
            value: pointsText || `${scorePercent * 10} Puan`,
            sub: new Date().toLocaleDateString("tr-TR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            }),
            bg: "#FFFBEB",
            border: "#F59E0B",
            color: "#B45309",
          },
        ];

    stats.forEach((st, idx) => {
      const x = startX + idx * (boxW + gap);
      drawRoundRect(ctx, x, boxY, boxW, boxH, 24);
      ctx.fillStyle = st.bg;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = st.border;
      ctx.stroke();

      ctx.fillStyle = st.color;
      ctx.font = "800 18px system-ui, -apple-system, sans-serif";
      ctx.fillText(st.label, x + boxW / 2, boxY + 40);

      ctx.font =
        idx === 2 && isHomework
          ? "900 32px ui-monospace, monospace"
          : "900 46px system-ui, -apple-system, sans-serif";
      ctx.fillText(st.value, x + boxW / 2, boxY + 102);

      ctx.fillStyle = "#5C5142";
      ctx.font = "700 19px system-ui, -apple-system, sans-serif";
      ctx.fillText(st.sub, x + boxW / 2, boxY + 144);
    });

    // Ödev modunda Zorlanılan / Tekrar Edilecek Kelimeler kutusu
    if (isHomework) {
      drawRoundRect(ctx, 84, 750, W - 168, 96, 22);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#E6D7BE";
      ctx.stroke();

      ctx.fillStyle = "#B45309";
      ctx.font = "800 18px system-ui, -apple-system, sans-serif";
      ctx.fillText(
        "📌 ZORLANDIĞI / TEKRAR ETMESİ GEREKEN KELİMELER",
        W / 2,
        782
      );

      ctx.fillStyle = "#2B241D";
      ctx.font = "700 22px system-ui, -apple-system, sans-serif";
      const truncatedWeak =
        weakWordsSummaryText.length > 68
          ? `${weakWordsSummaryText.slice(0, 66)}...`
          : weakWordsSummaryText;
      ctx.fillText(truncatedWeak, W / 2, 822);
    }

    // 6. Alt Band (app.muallimun.net)
    drawRoundRect(ctx, 84, 864, W - 168, 126, 28);
    const footerGrad = ctx.createLinearGradient(84, 864, W - 84, 990);
    footerGrad.addColorStop(0, "#087F5B");
    footerGrad.addColorStop(1, "#0CA678");
    ctx.fillStyle = footerGrad;
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 34px system-ui, -apple-system, sans-serif";
    ctx.fillText("🌐 app.muallimun.net", W / 2, 920);

    ctx.fillStyle = "#D3F9D8";
    ctx.font = "700 21px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      "60 Sesli Diyalog • 38 Mahreç Koçu • Morfolojik Sözlük • Alıştırmalar",
      W / 2,
      962
    );

    setPreviewDataUrl(canvas.toDataURL("image/png"));
  }, [
    arabicTitle,
    badgeType,
    completionPercent,
    homeworkTitle,
    isHomework,
    levelLabel,
    listenedCount,
    pointsText,
    pronPracticedCount,
    pronTargetCount,
    quizCompleted,
    scorePercent,
    studentName,
    subtitle,
    title,
    totalLinesCount,
    verificationCode,
    weakWordsSummaryText,
    wordsCount,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      void renderCardToCanvas();
    }, 40);
    return () => clearTimeout(t);
  }, [isOpen, renderCardToCanvas]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleDownloadPng = () => {
    playClick();
    if (!previewDataUrl) return;
    const a = document.createElement("a");
    a.href = previewDataUrl;
    a.download = isHomework
      ? `muallimun-odev-raporu-${verificationCode}.png`
      : "muallimun-basari-karti.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    playSuccess();
  };

  const handleNativeShare = async () => {
    playClick();
    if (sharingBusy) return;
    setSharingBusy(true);
    try {
      if (navigator.share && previewDataUrl) {
        const res = await fetch(previewDataUrl);
        const blob = await res.blob();
        const file = new File(
          [blob],
          isHomework
            ? `muallimun-odev-raporu-${verificationCode}.png`
            : "muallimun-basari-karti.png",
          {
            type: "image/png",
          }
        );

        const navWithCanShare = navigator as Navigator & {
          canShare?: (data?: ShareData) => boolean;
        };

        if (
          navWithCanShare.canShare &&
          navWithCanShare.canShare({ files: [file] })
        ) {
          await navigator.share({
            title: isHomework
              ? `Ödev Sonuç Raporu (#${verificationCode})`
              : "Arapça Telaffuz ve Diyalog Asistanı — Başarı Kartım",
            text: shareMessage,
            url: APP_URL,
            files: [file],
          });
          playSuccess();
          setSharingBusy(false);
          return;
        }

        await navigator.share({
          title: isHomework
            ? `Ödev Sonuç Raporu (#${verificationCode})`
            : "Arapça Telaffuz ve Diyalog Asistanı — Başarı Kartım",
          text: shareMessage,
          url: APP_URL,
        });
        playSuccess();
        setSharingBusy(false);
        return;
      }
      handleDownloadPng();
      await navigator.clipboard?.writeText(shareMessage);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore user cancel
    } finally {
      setSharingBusy(false);
    }
  };

  const handleCopyShareLink = async () => {
    playClick();
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedLink(true);
      playSuccess();
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore
    }
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
    APP_URL
  )}&text=${encodeURIComponent(shareMessage)}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 p-4 sm:p-5 shadow-2xl space-y-3 my-auto animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık */}
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#E2D3B8] dark:border-[var(--border-dashed)] pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 flex items-center justify-center text-amber-600 shrink-0">
              {isHomework ? <CheckCircle2 size={18} /> : <Trophy size={18} />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--foreground)] leading-tight">
                {isHomework
                  ? "📤 Öğrenci Ödev Sonuç Raporu"
                  : "Başarı Kartını Paylaş / İndir"}
              </h3>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {isHomework
                  ? `Doğrulama Kodu: #${verificationCode} • PNG İndirin veya Öğretmene Gönderin`
                  : "Görseli indirin veya tıklanabilir uygulama linkiyle paylaşın"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-[var(--foreground)] cursor-pointer"
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        {/* Öğrenci Adı Soyadı Giriş Alanı (Ödev Modunda) */}
        {isHomework && (
          <div className="rounded-xl bg-[#F3F0FF] dark:bg-[var(--lavender-bg)] border border-[#6741D9]/40 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-[#4C28B5] dark:text-[#d0bfff] flex items-center gap-1.5">
                <UserCheck size={14} />
                <span>Adınız Soyadınız / Numaranız (Rapora Yazılır):</span>
              </label>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-[#6741D9]/30 text-[10px] font-mono font-extrabold text-[#4C28B5] dark:text-indigo-200">
                <ShieldCheck size={11} />#{verificationCode}
              </span>
            </div>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Adınızı ve soyadınızı yazın (ör: Ahmet Yılmaz - 104)..."
              maxLength={40}
              className="w-full h-9 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#6741D9]/40 text-xs font-bold text-[var(--foreground)] focus:outline-none focus:border-[#6741D9]"
            />
          </div>
        )}

        {/* Gizli Yüksek Çözünürlüklü Canvas + Canlı Önizleme */}
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative rounded-2xl overflow-hidden border-2 border-[#E6D7BE] dark:border-[var(--border)] bg-[#F7EFE1] shadow-inner max-h-[34vh] sm:max-h-[42vh] w-auto mx-auto flex items-center justify-center">
          {previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt="Başarı Kartı Önizleme"
              className="max-h-[34vh] sm:max-h-[42vh] w-auto mx-auto object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 py-12 px-6">
              <Sparkles size={16} className="animate-spin text-[#0CA678]" />
              <span>Rapor kartı hazırlanıyor...</span>
            </div>
          )}
        </div>

        {/* Tıklanabilir Uygulama Linki / Rapor Özeti Kutusu */}
        <div className="rounded-xl bg-[#F7EFE1] dark:bg-[var(--background)] border border-[#E6D7BE] dark:border-[var(--border)] px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-300 block">
              {isHomework
                ? `Tamamlanma: %${completionPercent} • Uyum: %${scorePercent}`
                : "Paylaşılacak Tıklanabilir Uygulama Linki"}
            </span>
            <span className="text-xs font-extrabold text-[#087F5B] dark:text-[#20c997] truncate block">
              {isHomework
                ? `Tekrar Kelimeleri: ${weakWordsSummaryText}`
                : APP_URL}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[var(--surface)] border border-[#E6D7BE] text-xs font-extrabold text-[var(--foreground)] hover:border-[#0CA678] flex items-center gap-1 shrink-0 cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check size={13} className="text-[#0CA678]" />
                <span className="text-[#087F5B]">Kopyalandı</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>{isHomework ? "Raporu Kopyala" : "Metin + Link Kopyala"}</span>
              </>
            )}
          </button>
        </div>

        {/* Aksiyon Butonları */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleNativeShare}
              disabled={sharingBusy}
              className="py-2.5 px-4 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white font-extrabold text-xs border-b-3 border-[#087F5B] active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Share2 size={15} />
              <span>
                {isHomework
                  ? "📲 Rapor Görselini Paylaş"
                  : "📲 Paylaş (Resim + Link)"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              className="py-2.5 px-4 rounded-xl bg-[#6741D9] hover:bg-[#5230B5] text-white font-extrabold text-xs border-b-3 border-[#3b1f8c] active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download size={15} />
              <span>📥 Görseli İndir (PNG)</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs border-b-3 border-emerald-800 flex items-center justify-center gap-1.5 transition-all"
            >
              <span>
                {isHomework
                  ? "💬 WhatsApp'tan Öğretmene Gönder"
                  : "💬 WhatsApp'ta Paylaş"}
              </span>
            </a>

            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => playClick()}
              className="py-2 px-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 border-2 border-sky-400 text-sky-800 dark:text-sky-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
            >
              <span>✈️ Telegram&apos;da Paylaş</span>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

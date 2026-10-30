"use client";

import { useState, useEffect } from "react";
import {
  X,
  MessageSquarePlus,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { diyaloglar } from "@/lib/data";
import { playClick, playSuccess } from "@/lib/sfxManager";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxnozrFJ9z1X2TMsO-S1TJm70bu-mreYtuOqU96Oyu_hArYspQaQPvv9rbNeRX8zaGt/exec";

const FEEDBACK_CATEGORIES = [
  {
    id: "Hata / Eksik Kelime-Hareke",
    label: "🐞 Hata / Eksik Kelime-Hareke",
  },
  {
    id: "Öneri & Yeni Özellik",
    label: "💡 Öneri & Yeni Özellik",
  },
  {
    id: "Ses / Telaffuz Sorunu",
    label: "🔊 Ses / Telaffuz Sorunu",
  },
  {
    id: "Genel Görüş & Teşekkür",
    label: "💬 Genel Görüş & Teşekkür",
  },
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOLDOWN_STORAGE_KEY = "muallimun_feedback_last_sent_at";
const COOLDOWN_SECONDS = 60;

function getSuccessSubMessage(cat: string): string {
  if (cat === "Öneri & Yeni Özellik") {
    return "Değerli öneriniz uygulama geliştirme sürecimizde titizlikle değerlendirilecektir.";
  }
  if (cat === "Genel Görüş & Teşekkür") {
    return "Değerli görüşleriniz, desteğiniz ve güzel düşünceleriniz için içtenlikle teşekkür ederiz.";
  }
  return "Bildiriminiz incelenerek gerekli düzeltmeler en kısa sürede yapılacaktır.";
}

export function triggerFeedbackModal(initialDialogueRef?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("open-feedback-modal", {
        detail: { dialogueRef: initialDialogueRef },
      })
    );
  }
}

export function FooterFeedbackButton() {
  return (
    <button
      type="button"
      onClick={() => {
        playClick();
        triggerFeedbackModal();
      }}
      data-tooltip="Hata Bildirimi, Eksik Kelime/Hareke veya Öneri Gönderin"
      data-tooltip-pos="top"
      data-tooltip-align="right"
      aria-label="Görüş, Öneri veya Hata Bildir"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-all shadow-xs cursor-pointer"
    >
      <span>💬 Görüş, Öneri &amp; Hata Bildir</span>
    </button>
  );
}

export default function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<string>(
    FEEDBACK_CATEGORIES[0].id
  );
  const [submittedCategory, setSubmittedCategory] = useState<string>(
    FEEDBACK_CATEGORIES[0].id
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dialogueRef, setDialogueRef] = useState("Genel / Tüm Uygulama");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const custom = e as CustomEvent<{ dialogueRef?: string }>;
      if (custom.detail?.dialogueRef) {
        setDialogueRef(custom.detail.dialogueRef);
      }
      setErrorMsg(null);
      setIsSubmitted(false);
      setIsOpen(true);
    };
    window.addEventListener("open-feedback-modal", handleOpen);
    return () => window.removeEventListener("open-feedback-modal", handleOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // 60 saniye tekrar gönderim koruması sayacı
  useEffect(() => {
    if (!isOpen) return;
    const updateCooldown = () => {
      try {
        const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY);
        if (!raw) {
          setCooldownRemaining(0);
          return;
        }
        const elapsedSec = Math.floor((Date.now() - Number(raw)) / 1000);
        const rem = Math.max(0, COOLDOWN_SECONDS - elapsedSec);
        setCooldownRemaining(rem);
      } catch {
        setCooldownRemaining(0);
      }
    };
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, isSubmitted]);

  if (!isOpen) return null;

  const markSuccess = (sentCategory: string) => {
    try {
      localStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    setSubmittedCategory(sentCategory);
    setCooldownRemaining(COOLDOWN_SECONDS);
    setIsSubmitting(false);
    setIsSubmitted(true);
    setMessage("");
    playSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (website && website.trim().length > 0) {
      markSuccess(category);
      return;
    }

    if (cooldownRemaining > 0) {
      setErrorMsg(
        `Yeni bir bildirim göndermek için lütfen ${cooldownRemaining} saniye bekleyin.`
      );
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (trimmedName.length < 3) {
      setErrorMsg("Lütfen adınızı ve soyadınızı girin (en az 3 karakter).");
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }

    if (trimmedMessage.length < 10) {
      setErrorMsg(
        "Lütfen mesajınızı biraz daha detaylı yazın (en az 10 karakter)."
      );
      return;
    }

    setIsSubmitting(true);
    const currentUrl =
      typeof window !== "undefined" ? window.location.href : "";

    const payload = {
      category,
      name: trimmedName,
      email: trimmedEmail,
      dialogueRef: dialogueRef || "Genel / Tüm Uygulama",
      message: trimmedMessage,
      pageUrl: currentUrl,
      website,
    };

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data?.error) {
        setErrorMsg(data.error);
        setIsSubmitting(false);
        return;
      }

      if (res.ok && data?.ok) {
        markSuccess(category);
        return;
      }
    } catch {
      // Sunucu/ağ hatası durumunda aşağıdaki doğrudan Google Apps Script yedek kanalına geç
    }

    // Yedek Kanal: Doğrudan tarayıcıdan Google Apps Script'e no-cors ile gönderim
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          category: payload.category,
          name: payload.name,
          email: payload.email,
          dialogueRef: payload.dialogueRef,
          message: payload.message,
          pageUrl: payload.pageUrl,
        }),
      });
      markSuccess(category);
    } catch {
      setErrorMsg(
        "Bağlantı hatası oluştu. Lütfen internet bağlantınızı kontrol edip tekrar deneyin."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] print:hidden bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-[95vw] max-w-xl max-h-[90vh] flex flex-col bg-[#FDFBF7] dark:bg-[var(--surface)] rounded-3xl border-2 border-[#E6D7BE] dark:border-[var(--border)] border-b-4 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ÜST BAŞLIK */}
        <div className="bg-[#F7EFE1] dark:bg-[var(--background)] px-5 py-3.5 border-b-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0CA678] border-b-3 border-[#087F5B] text-white flex items-center justify-center shrink-0">
              <MessageSquarePlus size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--foreground)] leading-tight truncate">
                💬 İletişim &amp; Hata Bildirim Formu
              </h2>
              <p className="text-xs font-semibold text-[var(--muted)] truncate">
                Görüş, öneri ve tespit ettiğiniz kelime/hareke bildirimleriniz
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playClick();
              setIsOpen(false);
            }}
            className="w-9 h-9 rounded-xl bg-white dark:bg-[var(--surface)] border-2 border-[#E6D7BE] dark:border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* İÇERİK */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {isSubmitted ? (
            <div className="py-8 px-4 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 size={34} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-extrabold text-[var(--foreground)]">
                  Mesajınız başarıyla iletildi. İlginiz için teşekkür ederiz!
                </h3>
                <p className="text-xs sm:text-sm font-medium text-[var(--muted)] max-w-md mx-auto">
                  {getSuccessSubMessage(submittedCategory)}
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIsOpen(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#0CA678] hover:bg-[#099268] text-white text-xs sm:text-sm font-extrabold border-b-3 border-[#087F5B] cursor-pointer"
                >
                  Tamam, Kapat
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              {/* Honeypot (Gizli Spam Koruması) */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              {/* 1. Bildirim Türü Seçim Butonları */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-[var(--foreground)]">
                  Bildirim Türü
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {FEEDBACK_CATEGORIES.map((cat) => {
                    const active = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          playClick();
                          setCategory(cat.id);
                        }}
                        className={`py-2 px-3 rounded-xl border-2 text-xs font-extrabold text-left transition-all cursor-pointer ${
                          active
                            ? "bg-[#0CA678] border-[#087F5B] text-white shadow-2xs"
                            : "bg-white dark:bg-[var(--background)] border-[#E6D7BE] dark:border-[var(--border)] text-[var(--foreground)] hover:border-[#0CA678]"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Ad Soyad ve E-posta (Zorunlu) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-[var(--foreground)]">
                    Adınız ve Soyadınız{" "}
                    <span className="text-rose-600 dark:text-rose-400">
                      * Zorunlu
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs sm:text-sm font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#0CA678]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-[var(--foreground)]">
                    E-posta Adresiniz{" "}
                    <span className="text-rose-600 dark:text-rose-400">
                      * Zorunlu
                    </span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ornek@eposta.com"
                    className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs sm:text-sm font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#0CA678]"
                  />
                </div>
              </div>

              {/* 3. İlgili Diyalog / Bölüm (İsteğe Bağlı) */}
              <div className="space-y-1">
                <label className="block text-xs font-extrabold text-[var(--foreground)]">
                  İlgili Diyalog / Bölüm{" "}
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    (İsteğe Bağlı)
                  </span>
                </label>
                <select
                  value={dialogueRef}
                  onChange={(e) => setDialogueRef(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs sm:text-sm font-semibold text-[var(--foreground)] focus:outline-none focus:border-[#0CA678] cursor-pointer"
                >
                  <option value="Genel / Tüm Uygulama">
                    Genel / Tüm Uygulama
                  </option>
                  <option value="İnteraktif Sözlük & Kalıp İfadeler">
                    İnteraktif Sözlük &amp; Kalıp İfadeler
                  </option>
                  <option value="Alıştırma Merkezi & Hata Defteri">
                    Alıştırma Merkezi &amp; Hata Defteri
                  </option>
                  <option value="Telaffuz & Mahreç Stüdyosu">
                    Telaffuz &amp; Mahreç Stüdyosu
                  </option>
                  {diyaloglar.map((dlg) => {
                    const num = dlg.id.replace("dlg_", "");
                    const label = `#${num} ${dlg.baslik_tr} (${dlg.seviye})`;
                    return (
                      <option key={dlg.id} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 4. Mesajınız (Zorunlu, en az 10 karakter) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-extrabold text-[var(--foreground)]">
                    Mesajınız{" "}
                    <span className="text-rose-600 dark:text-rose-400">
                      * Zorunlu
                    </span>
                  </label>
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    En az 10 karakter ({message.trim().length}/10)
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tespit ettiğiniz hatayı, eksik kelime/harekeyi veya önerinizi buraya detaylıca yazabilirsiniz..."
                  className="w-full p-3 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs sm:text-sm font-semibold text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#0CA678] resize-y"
                />
              </div>

              {/* Hata Mesajı */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-extrabold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Alt Gönder Butonu */}
              <div className="pt-1 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setIsOpen(false);
                  }}
                  className="h-10 px-4 rounded-xl bg-white dark:bg-[var(--background)] border-2 border-[#E6D7BE] dark:border-[var(--border)] text-xs font-extrabold text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || cooldownRemaining > 0}
                  className="h-10 px-5 rounded-xl bg-[#0CA678] hover:bg-[#099268] disabled:opacity-55 text-white text-xs sm:text-sm font-extrabold border-b-3 border-[#087F5B] flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Gönderiliyor...</span>
                    </>
                  ) : cooldownRemaining > 0 ? (
                    <span>Tekrar Gönderim ({cooldownRemaining} sn)</span>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Bildirimi Gönder</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { Language, translations } from "@/lib/i18n";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations["en"]) => string;
}

const LanguageContext = React.createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key) => translations.en[key] || key,
});

/**
 * LanguageProvider — English for now, Swahili when it is ready.
 *
 * The Swahili dictionary is kept intact in lib/i18n.ts on purpose. It is the
 * mechanism we will switch on later, so deleting it would mean re-translating
 * every key from scratch. Instead the active language is pinned to English in
 * ONE place, so no screen can quietly fall back to Swahili and no string has
 * to be hand-edited back later.
 *
 * To bring Swahili back: restore `useState` from storage and delete the PIN.
 */
const PINNED_LANGUAGE: Language = "en";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Language>(PINNED_LANGUAGE);

  React.useEffect(() => {
    if (PINNED_LANGUAGE) return;
    const saved = localStorage.getItem("wangari_lang") as Language;
    if (saved && (saved === "en" || saved === "sw")) {
      setLangState(saved);
    }
  }, []);

  const setLang = (newLang: Language) => {
    if (PINNED_LANGUAGE) return;
    setLangState(newLang);
    localStorage.setItem("wangari_lang", newLang);
  };

  const t = (key: keyof typeof translations["en"]) => {
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return React.useContext(LanguageContext);
}

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LANGUAGE_STORAGE_KEY, interpolate, translations, translateDynamicText } from "./translations.js";

const I18nContext = createContext(null);

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return "zh-TW";
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLanguage === "en" || storedLanguage === "zh-TW" ? storedLanguage : "zh-TW";
}

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const value = useMemo(() => {
    function t(key, params) {
      const template = translations[language]?.[key] ?? translations["zh-TW"]?.[key] ?? key;
      return params ? interpolate(template, params) : template;
    }

    return {
      language,
      setLanguage,
      t,
      text: (content) => translateDynamicText(content, language),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

const LOCALE_KEY = "examio-i18next.locale";
const LEGACY_LOCALE_KEY = "examio.locale";

const legacyLocale = localStorage.getItem(LEGACY_LOCALE_KEY);
if (!localStorage.getItem(LOCALE_KEY) && legacyLocale) {
  localStorage.setItem(LOCALE_KEY, legacyLocale);
}

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["vi", "en", "ja"],
    defaultNS: "common",
    ns: ["common", "landing", "auth", "admin"],
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_KEY,
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

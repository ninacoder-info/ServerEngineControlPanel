import React from "react";
import { getLocale, localeCatalog } from "../locales";

function readPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

export function useTranslation() {
  const [locale, setLocale] = React.useState(getLocale);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    const handleChange = (event) =>
      setLocale(event.detail?.language || getLocale());
    window.addEventListener("serverengine:language-change", handleChange);
    return () =>
      window.removeEventListener("serverengine:language-change", handleChange);
  }, [locale]);

  const dictionary = localeCatalog[locale] || localeCatalog.en;
  const t = (key, fallback) =>
    readPath(dictionary, key) ??
    readPath(localeCatalog.en, key) ??
    fallback ??
    key;
  return { locale, t };
}

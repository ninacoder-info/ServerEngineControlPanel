import en from "./en";
import vi from "./vi";
import fr from "./fr";

export const localeCatalog = { en, vi, fr };

export function getLocale() {
  return localStorage.getItem("server-engine-language") || "en";
}

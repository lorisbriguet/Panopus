import { useAppStore } from "../stores/app-store";
import ui from "./ui";

export function useT() {
  const lang = useAppStore((s) => s.language);
  return ui[lang];
}

import { useEffect } from "react";

const APP_NAME = "PDV Restaurante";

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}

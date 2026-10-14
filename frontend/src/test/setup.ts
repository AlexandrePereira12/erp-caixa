import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // preferências de tela (tema, módulos abertos do menu) não vazam de um teste para o outro
  try {
    localStorage.clear();
  } catch {
    /* ambiente sem armazenamento */
  }
  document.documentElement.removeAttribute("data-theme");
});

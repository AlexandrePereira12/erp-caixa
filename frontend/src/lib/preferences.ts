/*
 * Preferências de tela guardadas neste navegador (tema, módulos abertos do menu).
 * É o ÚNICO arquivo que toca em localStorage: a guarda de client.test.ts garante que nenhum outro
 * lê ou grava ali, e que este não menciona token nem senha (a sessão vive só em memória).
 */
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // sem armazenamento (janela privativa, bloqueado): vale o padrão
  }
}

/** `null` apaga a preferência. Falhas de armazenamento são ignoradas: a escolha vale só até recarregar. */
export function writePreference(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento */
  }
}

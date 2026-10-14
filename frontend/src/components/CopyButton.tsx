import { useState } from "react";
import { Button } from "./Button";
import { CheckIcon, CopyIcon } from "./icons";
import { useToast } from "./Toast";

/** Copia via Clipboard API; em contexto não seguro (HTTP fora de localhost) cai em execCommand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // segue para o fallback
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export function CopyButton({ text, label, successMessage = "Copiado." }: { text: string; label: string; successMessage?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (await copyText(text)) {
      setCopied(true);
      toast.success(successMessage);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Button size="sm" onClick={handleClick} aria-label={label}>
      {copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

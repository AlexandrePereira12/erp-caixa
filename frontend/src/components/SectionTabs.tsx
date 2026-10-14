import { useRef, type KeyboardEvent } from "react";

export interface SectionTab {
  id: string;
  label: string;
}

export function tabId(prefix: string, id: string): string {
  return `${prefix}-tab-${id}`;
}

export function panelId(prefix: string, id: string): string {
  return `${prefix}-panel-${id}`;
}

/** Atributos do painel associado a uma aba (role="tabpanel" + ligação com a aba). */
export function tabPanelProps(prefix: string, id: string) {
  return { role: "tabpanel", id: panelId(prefix, id), "aria-labelledby": tabId(prefix, id), tabIndex: 0 } as const;
}

/**
 * Abas (padrão WAI-ARIA tabs): setas esquerda/direita, Home e End movem o foco e ativam a aba.
 * O conteúdo é responsabilidade de quem usa (um elemento com `tabPanelProps`).
 */
export function SectionTabs({ label, prefix, tabs, active, onChange }: { label: string; prefix: string; tabs: SectionTab[]; active: string; onChange: (id: string) => void }) {
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current.get(tab.id)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={tabId(prefix, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(prefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 transition-colors ${selected ? "border-brand font-semibold text-fg" : "border-transparent font-medium text-muted hover:text-fg"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

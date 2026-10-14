import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[hidden],[inert]") && el.getAttribute("aria-hidden") !== "true");
}

let scrollLocks = 0;

/**
 * Comportamento de modal acessível: foco inicial dentro, Tab/Shift+Tab presos no contêiner,
 * Esc fecha, rolagem do fundo travada e foco devolvido a quem abriu.
 * O elemento com `data-autofocus` recebe o foco inicial; senão o primeiro foco do `[data-modal-body]`.
 */
export function useModal(containerRef: RefObject<HTMLElement | null>, onClose: (() => void) | undefined): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = container.querySelector<HTMLElement>("[data-modal-body]");
    const initial =
      container.querySelector<HTMLElement>("[data-autofocus]") ?? (body ? focusables(body)[0] : undefined) ?? focusables(container)[0] ?? container;
    initial.focus();

    scrollLocks += 1;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (!container) return;
      if (event.key === "Escape") {
        if (onCloseRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables(container);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        container.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !container.contains(active);
      if (event.shiftKey && (outside || active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      scrollLocks -= 1;
      if (scrollLocks <= 0) {
        scrollLocks = 0;
        document.body.style.overflow = "";
      }
      if (opener?.isConnected) opener.focus();
    };
  }, [containerRef]);
}

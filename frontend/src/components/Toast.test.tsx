import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Salvo com sucesso")}>ok</button>
      <button onClick={() => toast.error("Falha ao salvar")}>erro</button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("as regiões aria-live existem antes de qualquer mensagem", () => {
    const { container } = render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    expect(container.ownerDocument.querySelector('[aria-live="polite"]')).toBeTruthy();
    expect(container.ownerDocument.querySelector('[aria-live="assertive"]')).toBeTruthy();
  });

  it("sucesso vai para a região educada (polite) e erro para a assertiva", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ok" }));
    await user.click(screen.getByRole("button", { name: "erro" }));

    expect(screen.getByText("Salvo com sucesso").closest("[aria-live]")!.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Falha ao salvar").closest("[aria-live]")!.getAttribute("aria-live")).toBe("assertive");
  });

  it("fecha pelo botão e some sozinho depois de um tempo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ok" }));
    await user.click(screen.getByRole("button", { name: "Fechar notificação" }));
    expect(screen.queryByText("Salvo com sucesso")).toBeNull();

    await user.click(screen.getByRole("button", { name: "ok" }));
    expect(screen.getByText("Salvo com sucesso")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByText("Salvo com sucesso")).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function Harness({ onClose = () => {}, dismissible = true }: { onClose?: () => void; dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Título do diálogo"
        description="Descrição do diálogo"
        dismissible={dismissible}
        footer={<button>Confirmar</button>}
      >
        <label>
          Campo <input />
        </label>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("tem semântica de diálogo modal rotulado e descrito", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const dialog = screen.getByRole("dialog", { name: "Título do diálogo" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("Descrição do diálogo");
  });

  it("move o foco para dentro ao abrir (primeiro campo do corpo) e o devolve ao fechar", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);

    expect(document.activeElement).toBe(screen.getByLabelText("Campo"));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("Esc fecha e chama onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prende o foco: Tab percorre fechar > campo > confirmar e volta ao início; Shift+Tab inverte", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    const campo = screen.getByLabelText("Campo");
    const confirmar = screen.getByRole("button", { name: "Confirmar" });
    const fechar = screen.getByRole("button", { name: "Fechar" });

    expect(document.activeElement).toBe(campo);
    await user.tab();
    expect(document.activeElement).toBe(confirmar);
    await user.tab(); // do último volta ao primeiro (nunca sai para a página)
    expect(document.activeElement).toBe(fechar);
    await user.tab();
    expect(document.activeElement).toBe(campo);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(fechar);
    await user.tab({ shift: true }); // do primeiro volta ao último
    expect(document.activeElement).toBe(confirmar);
  });

  it("clicar fora (fundo) fecha", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { baseElement } = render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const backdrop = baseElement.querySelector<HTMLElement>('[aria-hidden="true"].absolute')!;
    await user.pointer({ target: backdrop, keys: "[MouseLeft]" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("não fecha por Esc nem pelo botão quando dismissible=false (ex.: enviando)", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} dismissible={false} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Fechar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("trava a rolagem do fundo enquanto aberto", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });
});

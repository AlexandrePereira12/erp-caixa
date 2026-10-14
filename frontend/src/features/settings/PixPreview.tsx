import { Card } from "@/components/Card";
import { CopyButton } from "@/components/CopyButton";
import { QrCode } from "@/components/QrCode";

/**
 * QR Code do Pix cadastrado, para o administrador conferir (escaneie com o app do banco). Só mostra o
 * código; o sistema não sabe se o cliente pagou: quem confere é o caixa, no app do banco.
 */
export function PixPreview({ code, recebedor }: { code: string; recebedor: string | null }) {
  return (
    <Card className="mt-4 max-w-2xl">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <QrCode value={code} label="QR Code do Pix da empresa" className="shrink-0 self-start" />
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-fg">QR Code do Pix</h2>
            {recebedor && (
              <p className="mt-1 text-muted">
                Recebedor: <strong className="font-semibold text-fg">{recebedor}</strong>
              </p>
            )}
          </div>
          <p className="text-[0.8125rem] leading-snug text-muted">
            Escaneie com o app do banco para conferir que é o seu. O sistema não confirma o pagamento: confira o recebimento no app do banco antes de fechar a conta.
          </p>
          <CopyButton text={code} label="Copiar o Pix copia e cola" successMessage="Pix copia e cola copiado." />
        </div>
      </div>
    </Card>
  );
}

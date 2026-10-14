import { useMemo } from "react";
import { CopyButton } from "@/components/CopyButton";
import { QrCode } from "@/components/QrCode";
import { formatMoney } from "@/lib/money";
import { pixComValor } from "@/lib/pix";

/**
 * QR Code do Pix da empresa já com o valor da linha de pagamento, para o cliente escanear. É o Pix
 * estático cadastrado nas configurações com o valor inserido no navegador: nenhuma API de banco, então o
 * sistema não sabe se o pagamento chegou. Quem confere é o caixa, no app do banco.
 */
export function PixCobranca({ base, valor }: { base: string; valor: string }) {
  const code = useMemo(() => pixComValor(base, valor), [base, valor]);
  if (!code) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3 sm:flex-row">
      <QrCode value={code} label={`QR Code do Pix de ${formatMoney(valor)}`} size={176} className="shrink-0 self-start" />
      <div className="min-w-0 space-y-2">
        <p className="text-base font-semibold text-fg">Pix de {formatMoney(valor)}</p>
        <p className="text-[0.8125rem] leading-snug text-muted">
          Mostre o QR Code ao cliente. O sistema não confirma o pagamento: confira o recebimento no app do banco antes de confirmar o fechamento.
        </p>
        <CopyButton text={code} label={`Copiar o Pix copia e cola de ${formatMoney(valor)}`} successMessage="Pix copia e cola copiado." />
      </div>
    </div>
  );
}

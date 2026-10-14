import { useState } from "react";
import { AdjustmentDialog } from "./AdjustmentDialog";
import { BalancesTab } from "./BalancesTab";
import { EntryDialog } from "./EntryDialog";
import { MovementsTab } from "./MovementsTab";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/Card";
import { PlusIcon } from "@/components/icons";
import { SectionTabs, tabPanelProps } from "@/components/SectionTabs";
import { useListParams } from "@/components/useListParams";
import { usePermissions } from "@/lib/auth/hooks";
import { usePageTitle } from "@/lib/usePageTitle";

const TABS = [
  { id: "saldos", label: "Saldos" },
  { id: "movimentos", label: "Movimentos" },
];
const PREFIX = "estoque";

type Dialog = "entry" | "adjust" | null;

export function StockPage() {
  usePageTitle("Estoque");
  const { can } = usePermissions();
  const { params, update, reset } = useListParams();
  const active = params.get("aba") === "movimentos" ? "movimentos" : "saldos";
  const [dialog, setDialog] = useState<Dialog>(null);

  function changeTab(id: string) {
    // Cada aba tem os próprios filtros: trocar de aba começa limpo.
    reset();
    update({ aba: id === "saldos" ? undefined : id });
  }

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Saldos por produto e histórico de movimentos."
        actions={
          <>
            {can("estoque.ajustar") && <Button onClick={() => setDialog("adjust")}>Ajuste, perda ou saída</Button>}
            {can("estoque.entrada") && (
              <Button variant="primary" onClick={() => setDialog("entry")}>
                <PlusIcon width={16} height={16} />
                Registrar entrada
              </Button>
            )}
          </>
        }
      />
      <SectionTabs label="Seções do estoque" prefix={PREFIX} tabs={TABS} active={active} onChange={changeTab} />
      <div {...tabPanelProps(PREFIX, active)} className="pt-4 outline-none">
        {active === "saldos" ? <BalancesTab /> : <MovementsTab />}
      </div>

      {dialog === "entry" && <EntryDialog onClose={() => setDialog(null)} />}
      {dialog === "adjust" && <AdjustmentDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

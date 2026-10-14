import type { RouteObject } from "react-router-dom";
import { RequirePermission } from "@/features/auth/guards";
import { PeoplePage } from "@/features/cadastros/PeoplePage";
import { CategoriesPage } from "@/features/catalogo/CategoriesPage";
import { ProductsPage } from "@/features/catalogo/ProductsPage";
import { UnitsPage } from "@/features/catalogo/UnitsPage";
import { StockPage } from "@/features/estoque/StockPage";
import { InventoriesPage } from "@/features/inventarios/InventoriesPage";
import { InventoryDetailPage } from "@/features/inventarios/InventoryDetailPage";

/** Rotas de cadastros e estoque (pessoas, catálogo, estoque, inventários). */
export const cadastrosRoutes: RouteObject[] = [
  {
    path: "/pessoas",
    element: (
      <RequirePermission permission="pessoas.listar">
        <PeoplePage />
      </RequirePermission>
    ),
  },
  {
    path: "/produtos",
    element: (
      <RequirePermission permission="catalogo.listar">
        <ProductsPage />
      </RequirePermission>
    ),
  },
  {
    path: "/categorias",
    element: (
      <RequirePermission permission="catalogo.listar">
        <CategoriesPage />
      </RequirePermission>
    ),
  },
  {
    path: "/unidades",
    element: (
      <RequirePermission permission="catalogo.listar">
        <UnitsPage />
      </RequirePermission>
    ),
  },
  {
    path: "/estoque",
    element: (
      <RequirePermission permission="estoque.listar">
        <StockPage />
      </RequirePermission>
    ),
  },
  {
    path: "/inventarios",
    element: (
      <RequirePermission permission="inventarios.listar">
        <InventoriesPage />
      </RequirePermission>
    ),
  },
  {
    path: "/inventarios/:id",
    element: (
      <RequirePermission permission="inventarios.listar">
        <InventoryDetailPage />
      </RequirePermission>
    ),
  },
];

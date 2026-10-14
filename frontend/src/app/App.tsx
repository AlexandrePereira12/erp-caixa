import { RouterProvider } from "react-router-dom";
import { AppProviders, SessionBootstrap } from "./providers";
import { router } from "./router";

export function App() {
  return (
    <AppProviders>
      <SessionBootstrap>
        <RouterProvider router={router} />
      </SessionBootstrap>
    </AppProviders>
  );
}

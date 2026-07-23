import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./app/styles.css";

const App = lazy(() => import("./app/App").then((module) => ({ default: module.App })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<div className="app-boot" role="status"><strong>AXISFRAME STUDIO</strong><span>LOADING 3D DESIGNER</span></div>}>
      <App />
    </Suspense>
  </StrictMode>,
);

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import OwnerSuperApp from './OwnerSuperApp.jsx'
import SimpleAdminSmokeRoute from './pages/SimpleAdminSmokeRoute.jsx'
import { isSimpleAdminSmokePath } from './p2p/p2pSmokeJwtFixture.js'

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const path = typeof window !== "undefined" ? window.location.pathname : ""
const RootComponent = path.startsWith("/owner")
  ? OwnerSuperApp
  : isSimpleAdminSmokePath(path)
    ? SimpleAdminSmokeRoute
    : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
)

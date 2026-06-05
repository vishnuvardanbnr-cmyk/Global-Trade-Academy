import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/useTheme";

initTheme();

createRoot(document.getElementById("root")!).render(<App />);

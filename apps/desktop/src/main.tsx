import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/orbitron/500.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/share-tech-mono/400.css";
import { App } from "./App";
import { useCentre } from "./store";
import "./styles.css";

function GpuName() {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const name = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    if (name) useCentre.getState().patch({ gpu: name.replace(/^ANGLE \(/, "").replace(/\)$/, "").slice(0, 48) });
  }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GpuName />
    <App />
  </StrictMode>
);

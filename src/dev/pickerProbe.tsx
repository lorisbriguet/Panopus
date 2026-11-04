// Dev-only: mounts the ColorPicker opened, for headless screenshots.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ColorPicker } from "../components/ui/ColorPicker";
import "../index.css";

function Probe() {
  const [c, setC] = useState("#e05252");
  return (
    <div style={{ padding: 24, width: 260 }}>
      <ColorPicker value={c} onChange={setC} ariaLabel="probe color" />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Probe />);
setTimeout(() => {
  (document.querySelector("button[aria-label='probe color']") as HTMLButtonElement)?.click();
}, 300);

import { HashRouter, Route, Routes } from "react-router-dom";
import { CardView } from "./pages/CardView.js";
import { Composer } from "./pages/Composer.js";
import { Guardian } from "./pages/Guardian.js";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Composer />} />
        <Route path="/card/:address" element={<CardView />} />
        <Route path="/guardian" element={<Guardian />} />
      </Routes>
    </HashRouter>
  );
}

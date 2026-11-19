import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { CardView } from "./pages/CardView.js";
import { Composer } from "./pages/Composer.js";

function Placeholder({ name }: { name: string }) {
  return <p>{name} is coming soon.</p>;
}

export function App() {
  return (
    <HashRouter>
      <header className="top">
        <Link to="/">Agent Policy Card</Link>
        <nav>
          <Link to="/">Compose</Link>
          <Link to="/guardian">Guardian</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Composer />} />
          <Route path="/card/:address" element={<CardView />} />
          <Route path="/guardian" element={<Placeholder name="Guardian" />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

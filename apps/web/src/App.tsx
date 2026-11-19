import { HashRouter, Link, Route, Routes } from "react-router-dom";

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
          <Route path="/" element={<Placeholder name="Composer" />} />
          <Route path="/card/:address" element={<Placeholder name="Card view" />} />
          <Route path="/guardian" element={<Placeholder name="Guardian" />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

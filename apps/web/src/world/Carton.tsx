import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

export function Carton({ paused = false, children }: { paused?: boolean; children: ReactNode }) {
  return (
    <div className={paused ? "carton carton--paused" : "carton"}>
      <div className="carton-inner">
        <header className="topbar">
          <Link to="/" className="wordmark">
            Agent Policy Card
          </Link>
          <nav aria-label="Main">
            <NavLink to="/" end>
              Publish
            </NavLink>
            <NavLink to="/guardian">Guardian</NavLink>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="square" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" />
      <path d="M4 16V4h12" />
    </svg>
  );
}

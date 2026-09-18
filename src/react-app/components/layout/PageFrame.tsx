import { Outlet, useLocation } from "react-router-dom";
import { routeSection } from "@/lib/routeSection";

/** Crossfades a page in when the section changes; opening a task or switching its tab keeps the same page mounted. */
export function PageFrame() {
  const { pathname } = useLocation();
  return (
    <div key={routeSection(pathname)} className="h-full animate-fade-in">
      <Outlet />
    </div>
  );
}

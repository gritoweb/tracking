import { useState } from "react";
import { ChevronLeft, Menu } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./SidebarContent";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/uiStore";

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — replaces the sidebar below md */}
      <div className="flex h-14 shrink-0 items-center justify-between bg-card px-3 md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark className="h-5 w-5 shrink-0" />
          <span className="font-semibold tracking-tight">Time Tracker</span>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-lg" className="tt-touch" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent>Open navigation menu</TooltipContent>
          </Tooltip>
          <SheetContent side="left" className="w-64 gap-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-14 items-center border-b px-4">
              <BrandMark className="h-5 w-5 shrink-0" />
              <span className="ml-2 font-semibold tracking-tight">Time Tracker</span>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "hidden h-full flex-col overflow-hidden bg-card transition-all duration-base ease-out-quart md:flex",
          sidebarCollapsed ? "w-14" : "w-56"
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "relative flex h-14 overflow-hidden border-b",
            sidebarCollapsed ? "justify-center px-0" : "items-center px-4"
          )}
        >
          {sidebarCollapsed ? (
            // Collapsed: the logo itself is the expand affordance (no arrow).
            // raw: fills the full h-14 brand strip, which Button's fixed height can't do.
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                  className="flex h-full w-full items-center justify-center transition-colors duration-fast ease-out-quart hover:bg-accent focus-ring focus-visible:ring-inset"
                >
                  <BrandMark className="h-5 w-5 shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <BrandMark className="h-5 w-5 shrink-0" />
              {/* nowrap + clipped so the label doesn't wrap to two lines while the
                  rail width animates open (was a "Time / Tracker" flash). */}
              <span className="ml-2 whitespace-nowrap font-semibold tracking-tight">Time Tracker</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 shrink-0 text-muted-foreground"
                    onClick={toggleSidebar}
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse sidebar</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>
    </>
  );
}

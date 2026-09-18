import { useMemo, useRef, useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NO_CLIENT, hasClient, resolveClientId, type ClientChoice } from "@/lib/clientChoice";
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";
import { ProjectPickerPanel } from "./ProjectPickerPanel";
import { ProjectPickerList } from "./ProjectPickerList";
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useClients,
  useCreateClient,
} from "@/hooks/useProjects";
import { useUIStore } from "@/stores/uiStore";
import { nextUnusedColor, randomColor } from "@/lib/colorUtils";
import type { Project } from "@shared/schemas";

export { AssignProjectChip } from "./AssignProjectChip";

interface ProjectPickerProps {
  value: string | null;
  /** Always a project: every entry needs one, so the picker offers no "No project" (D3). */
  onChange: (projectId: string) => void;
  compact?: boolean;
  className?: string;
  /**
   * Render the trigger as a form field — bordered, full width — instead of the
   * ghost chip used in dense toolbars. The edit-entry sheet stacks this next to
   * bordered inputs, where a borderless trigger read as a label rather than a
   * control and broke the column's left edge.
   */
  field?: boolean;
  /** Controlled open state, for a caller that opens the picker itself (the timer bar's Start). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Stay open when focus is pulled away — a closing menu hands focus back to its own trigger. */
  holdOpen?: boolean;
  /** Custom trigger element (single child, receives the popover ref). */
  children?: React.ReactNode;
}

export function ProjectPicker({
  value,
  onChange,
  compact = false,
  className,
  children,
  field = false,
  open: controlledOpen,
  onOpenChange,
  holdOpen = false,
}: ProjectPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [search, setSearch] = useState("");
  const [client, setClient] = useState<ClientChoice>(NO_CLIENT);
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const createProject = useCreateProject();
  const createClient = useCreateClient();
  const updateProject = useUpdateProject();
  // An older project with no client can't take time: it is linked here before it can be picked.
  const [linking, setLinking] = useState<Project | null>(null);
  // The name being created, which turns the popover into a two-field panel.
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const autoAssignColors = useUIStore((s) => s.autoAssignColors);

  const selected = projects.find((p) => p.id === value);

  // Projects under their client, clients alphabetical; an older project with no client comes last.
  const groups = useMemo(() => {
    const byClient = new Map<string, Project[]>();
    for (const project of projects) {
      const clientName = project.clientName ?? "";
      byClient.set(clientName, [...(byClient.get(clientName) ?? []), project]);
    }
    return [...byClient.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  }, [projects]);

  // Reset the query when the popover closes so the next open starts clean
  // rather than resuming someone else's half-typed name.
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setSearch("");
      setClient(NO_CLIENT);
      setLinking(null);
      setCreatingName(null);
    }
  };

  const select = (projectId: string) => {
    onChange(projectId);
    setOpen(false);
  };

  // Picking a client-less project links it first; the entry would be refused otherwise.
  const pick = (project: Project) => {
    if (!project.clientId) {
      setClient(NO_CLIENT);
      setLinking(project);
      return;
    }
    select(project.id);
  };

  const panelPending = updateProject.isPending || createProject.isPending || createClient.isPending;

  const handleLink = async () => {
    if (!linking || !hasClient(client)) return;
    const clientId = await resolveClientId(client, clients, createClient.mutateAsync);
    await updateProject.mutateAsync({ id: linking.id, data: { clientId } });
    select(linking.id);
  };

  // Creating from here is the whole reason a first-run workspace isn't a dead
  // end. A name and a client are the required fields; colour follows the same
  // auto-assign rule as the full form.
  const typed = search.trim();
  const exists = projects.some((p) => p.name.toLowerCase() === typed.toLowerCase());
  const canCreate = typed.length > 0 && !exists && !createProject.isPending;

  const openCreate = (name: string) => {
    setClient(NO_CLIENT);
    setCreatingName(name);
  };

  const handleCreate = async () => {
    const name = creatingName?.trim();
    if (!name || !hasClient(client)) return;
    const clientId = await resolveClientId(client, clients, createClient.mutateAsync);
    const project = await createProject.mutateAsync({
      name,
      color: autoAssignColors ? nextUnusedColor(projects.map((p) => p.color)) : randomColor(),
      billable: false,
      clientId,
    });
    select(project.id);
  };

  const triggerLabel = selected ? `Project: ${selected.name}` : "Select project";
  const trigger = (
    <PopoverTrigger asChild>
      {children ?? (
          <Button
            type="button"
            variant={field ? "outline" : "ghost"}
            size={compact ? "sm" : "default"}
            // Compact + unselected renders icons only, so the button would have no
            // accessible name at all. Label it unconditionally: even when the name
            // is visible, "ERP Migration" alone doesn't say it's a project picker.
            aria-label={triggerLabel}
            className={cn(
              "gap-1.5 text-sm",
              !selected && "text-muted-foreground",
              // Height comes from `size="sm"` (32px, the toolbar step) — the
              // old `h-7` put these chips at 28px against 32px neighbours, which
              // is the near-miss that reads as sloppy rather than hierarchical.
              // Only the horizontal padding tightens for density.
              compact && "px-2",
              field && "w-full justify-start font-normal",
              className
            )}
          >
            {selected ? (
              <>
                <ColorDot color={selected.color} />
                <span className="min-w-0 max-w-30 truncate">{selected.name}</span>
              </>
            ) : (
              <>
                <FolderOpen className="h-3.5 w-3.5" />
                {!compact && <span>Choose project</span>}
              </>
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
      )}
    </PopoverTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* The default trigger can render as bare icons, so it always carries a tooltip; a caller's own child owns its labelling. */}
      {children ? (
        trigger
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>{triggerLabel}</TooltipContent>
        </Tooltip>
      )}
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onFocusOutside={(e) => {
          if (!holdOpen) return;
          e.preventDefault();
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        {linking || creatingName !== null ? (
          <ProjectPickerPanel
            linkingName={linking?.name ?? null}
            creatingName={creatingName}
            onCreatingNameChange={setCreatingName}
            client={client}
            onClientChange={setClient}
            clients={clients}
            pending={panelPending}
            onCancel={() => (linking ? setLinking(null) : setCreatingName(null))}
            onSubmit={linking ? handleLink : handleCreate}
          />
        ) : (
          <ProjectPickerList
            inputRef={inputRef}
            hasAnyProject={projects.length > 0}
            search={search}
            onSearchChange={setSearch}
            groups={groups}
            value={value}
            onPick={pick}
            canCreate={canCreate}
            typed={typed}
            onOpenCreate={() => openCreate(typed)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

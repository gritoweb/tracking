import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ClientField } from "@/components/projects/ClientField";
import {
  NO_CLIENT,
  hasClient,
  resolveClientId,
  type ClientChoice,
} from "@/lib/clientChoice";
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useClients,
  useCreateClient,
} from "@/hooks/useProjects";
import { useUIStore } from "@/stores/uiStore";
import { nextProjectColor, PROJECT_COLORS } from "@/lib/colorUtils";

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
  const [linking, setLinking] = useState<(typeof projects)[number] | null>(null);
  // The name being created, which turns the popover into a two-field panel.
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const autoAssignColors = useUIStore((s) => s.autoAssignColors);

  const selected = projects.find((p) => p.id === value);

  // Projects under their client, clients alphabetical; an older project with no client comes last.
  const groups = useMemo(() => {
    const byClient = new Map<string, typeof projects>();
    for (const project of projects) {
      const client = project.clientName ?? "";
      byClient.set(client, [...(byClient.get(client) ?? []), project]);
    }
    return [...byClient.entries()].sort(([a], [b]) =>
      a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)
    );
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
  const pick = (project: (typeof projects)[number]) => {
    if (!project.clientId) {
      setClient(NO_CLIENT);
      setLinking(project);
      return;
    }
    select(project.id);
  };

  const panelPending =
    updateProject.isPending || createProject.isPending || createClient.isPending;

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
      color: autoAssignColors
        ? nextProjectColor(projects.map((p) => p.color))
        : PROJECT_COLORS[9],
      billable: false,
      clientId,
    });
    select(project.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
        <Button
          type="button"
          variant={field ? "outline" : "ghost"}
          size={compact ? "sm" : "default"}
          // Compact + unselected renders icons only, so the button would have no
          // accessible name at all. Label it unconditionally: even when the name
          // is visible, "ERP Migration" alone doesn't say it's a project picker.
          aria-label={selected ? `Project: ${selected.name}` : "Select project"}
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
          <div className="space-y-3 p-3">
            <p className="-mx-3 border-b px-3 pb-2 text-sm font-medium">
              {linking ? "Link a client" : "New project"}
            </p>
            {linking ? (
              <p className="text-xs leading-normal text-muted-foreground">
                <span className="font-medium text-foreground">{linking.name}</span> has no
                client yet, and time is tracked against a project that has one.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="picker-project-name">Project name</Label>
                <Input
                  id="picker-project-name"
                  value={creatingName ?? ""}
                  autoFocus
                  onChange={(e) => setCreatingName(e.target.value)}
                  // cmdk owns arrows and Enter while its Command is mounted.
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="picker-project-client">Client</Label>
              <ClientField
                id="picker-project-client"
                value={client}
                onChange={setClient}
                clients={clients}
                autoFocus={Boolean(linking)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => (linking ? setLinking(null) : setCreatingName(null))}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={
                  !hasClient(client) || panelPending || (!linking && !creatingName?.trim())
                }
                onClick={linking ? handleLink : handleCreate}
              >
                {panelPending ? (
                  <Spinner size="sm" />
                ) : linking ? (
                  "Link and use"
                ) : (
                  "Create project"
                )}
              </Button>
            </div>
          </div>
        ) : (
        <Command shouldFilter>
          <CommandInput
            ref={inputRef}
            placeholder={
              projects.length === 0 ? "Name your first project…" : "Search or create…"
            }
            value={search}
            onValueChange={setSearch}
            className="h-9"
          />
          <CommandList>
            {/* Never a bare "no results": the query the user just typed is
                exactly the name they want, so offer to make it. */}
            <CommandEmpty className="px-2 py-2">
              {canCreate ? (
                <CreateProjectItem name={typed} onCreate={() => openCreate(typed)} standalone />
              ) : (
                <span className="text-sm text-muted-foreground">No projects found</span>
              )}
            </CommandEmpty>
            {groups.map(([clientName, clientProjects]) => (
              <CommandGroup
                key={clientName || "__no_client__"}
                heading={clientName || "No client yet"}
              >
                {clientProjects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    keywords={[project.name, clientName]}
                    onSelect={() => pick(project)}
                  >
                    <ColorDot color={project.color} />
                    <span className="truncate">{project.name}</span>
                    {!project.clientId && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        Needs a client
                      </span>
                    )}
                    {value === project.id && project.clientId && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/* Also offered alongside partial matches — typing "Acme" when
                "Acme Retainer" exists shouldn't force a trip to /projects. */}
            {canCreate && (
              <CommandGroup className="border-t">
                <CreateProjectItem name={typed} onCreate={() => openCreate(typed)} />
              </CommandGroup>
            )}

            {/* First run: the list has nothing to search, so say what to do. */}
            {projects.length === 0 && !typed && (
              <p className="border-t px-3 py-2.5 text-xs leading-normal text-muted-foreground">
                Type a name to create your first project. Every project belongs to a
                client, and every entry needs a project.
              </p>
            )}
          </CommandList>
        </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "Create <name>" row — opens the panel where the name and its client are confirmed. */
function CreateProjectItem({
  name,
  onCreate,
  standalone = false,
}: {
  name: string;
  onCreate: () => void;
  /** Rendered outside a CommandGroup (inside CommandEmpty), which cmdk does
      not treat as selectable — so it needs to be a real button. */
  standalone?: boolean;
}) {
  const content = (
    <>
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">
        Create <span className="font-medium">{name}</span>…
      </span>
    </>
  );

  if (standalone) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        {content}
      </button>
    );
  }

  return (
    <CommandItem value={`__create__${name}`} keywords={[name]} onSelect={onCreate}>
      {content}
    </CommandItem>
  );
}

/**
 * Dashed "Project" chip for entries without a project — opens the picker in
 * place so an unbillable entry can be fixed without the edit dialog. Dashed
 * border matches the calendar's ghost/gap affordance: unfilled, actionable.
 */
export function AssignProjectChip({
  onAssign,
  ariaLabel = "Assign project",
}: {
  onAssign: (projectId: string) => void;
  ariaLabel?: string;
}) {
  return (
    <ProjectPicker value={null} onChange={onAssign}>
      <button
        type="button"
        aria-label={ariaLabel}
        className="flex h-4 items-center gap-1 rounded-sm border border-dashed border-muted-foreground/40 px-1.5 text-micro font-medium text-muted-foreground transition-colors duration-fast ease-out-quart hover:border-primary hover:text-primary-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <FolderOpen className="h-2.5 w-2.5" />
        Project
      </button>
    </ProjectPicker>
  );
}

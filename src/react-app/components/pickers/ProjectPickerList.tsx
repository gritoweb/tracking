import type { RefObject } from "react";
import { Check } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ColorDot } from "@/components/ColorDot";
import { ProjectPickerCreateItem } from "./ProjectPickerCreateItem";
import type { Project } from "@shared/schemas";

interface ProjectPickerListProps {
  inputRef: RefObject<HTMLInputElement | null>;
  hasAnyProject: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  groups: [string, Project[]][];
  value: string | null;
  onPick: (project: Project) => void;
  canCreate: boolean;
  typed: string;
  onOpenCreate: () => void;
}

/** The search + grouped project list + inline "create" row — pure view. */
export function ProjectPickerList({
  inputRef,
  hasAnyProject,
  search,
  onSearchChange,
  groups,
  value,
  onPick,
  canCreate,
  typed,
  onOpenCreate,
}: ProjectPickerListProps) {
  return (
    <Command shouldFilter>
      <CommandInput
        ref={inputRef}
        placeholder={hasAnyProject ? "Search or create…" : "Name your first project…"}
        value={search}
        onValueChange={onSearchChange}
        className="h-9"
      />
      <CommandList>
        {/* Never a bare "no results": the query the user just typed is
            exactly the name they want, so offer to make it. */}
        <CommandEmpty className="px-2 py-2">
          {canCreate ? (
            <ProjectPickerCreateItem name={typed} onCreate={onOpenCreate} standalone />
          ) : (
            <span className="text-sm text-muted-foreground">No projects found</span>
          )}
        </CommandEmpty>
        {groups.map(([clientName, clientProjects]) => (
          <CommandGroup key={clientName || "__no_client__"} heading={clientName || "No client yet"}>
            {clientProjects.map((project) => (
              <CommandItem
                key={project.id}
                value={project.id}
                keywords={[project.name, clientName]}
                onSelect={() => onPick(project)}
              >
                <ColorDot color={project.color} />
                <span className="truncate">{project.name}</span>
                {!project.clientId && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">Needs a client</span>
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
            <ProjectPickerCreateItem name={typed} onCreate={onOpenCreate} />
          </CommandGroup>
        )}

        {/* First run: the list has nothing to search, so say what to do. */}
        {!hasAnyProject && !typed && (
          <p className="border-t px-3 py-2.5 text-xs leading-normal text-muted-foreground">
            Type a name to create your first project. Every project belongs to a client, and every
            entry needs a project.
          </p>
        )}
      </CommandList>
    </Command>
  );
}

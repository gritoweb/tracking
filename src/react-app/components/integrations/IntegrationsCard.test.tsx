// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let canManage = true;
const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/hooks/useSlack", () => ({
  useSlackStatus: () => ({
    data: { configured: true, connected: true, teamName: "Acme", canManage, notify: true, linked: true },
  }),
  useSetSlackNotify: () => idle,
  useSendSlackTest: () => idle,
  useDisconnectSlack: () => idle,
}));
vi.mock("@/hooks/useCalendarSync", () => ({
  useCalendarStatus: () => ({
    data: [
      { provider: "google", label: "Google Calendar", configured: true, connected: false, autoTrack: false, accountEmail: null },
      { provider: "microsoft", label: "Outlook", configured: false, connected: false, autoTrack: false, accountEmail: null },
    ],
  }),
  useDisconnectCalendar: () => idle,
  useSetAutoTrack: () => idle,
}));
vi.mock("@/hooks/useIntegrations", () => ({
  useIntegrations: () => ({
    data: [{ id: "i1", type: "workfront", name: "Client A Workfront", baseUrl: "https://a.my.workfront.com" }],
  }),
  useCreateIntegration: () => idle,
  useUpdateIntegration: () => idle,
  useTestIntegration: () => idle,
  useDeleteIntegration: () => idle,
}));
vi.mock("@/hooks/useWorkspaceRole", () => ({ useWorkspaceRole: () => ({ canManage }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { IntegrationsCard } = await import("./IntegrationsCard");

const renderCard = () =>
  render(
    <MemoryRouter>
      <IntegrationsCard />
    </MemoryRouter>
  );

describe("IntegrationsCard", () => {
  it("shows one tile per available partner, with its state, and hides a calendar the server can't offer", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /Slack/ })).toHaveTextContent("Connected");
    expect(screen.getByRole("button", { name: /Adobe Workfront/ })).toHaveTextContent("1 connection");
    expect(screen.getByRole("button", { name: /Dynamics 365/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google Calendar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Outlook/ })).not.toBeInTheDocument();
  });

  it("opens the chosen partner below the grid, not in a dialog, and closes it on a second click", () => {
    renderCard();
    const workfront = screen.getByRole("button", { name: /Adobe Workfront/ });
    fireEvent.click(workfront);
    expect(workfront).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Client A Workfront")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(workfront);
    expect(screen.queryByText("Client A Workfront")).not.toBeInTheDocument();
  });

  it("opens a partner with no connection straight on its form, with the system already chosen", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Dynamics 365/ }));
    expect(screen.getByLabelText("Organization URL")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("a member sees the connections but no way to add or change them", () => {
    canManage = false;
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Dynamics 365/ }));
    expect(screen.queryByLabelText("Organization URL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add connection" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only workspace owners and admins/)).toBeInTheDocument();
    canManage = true;
  });
});

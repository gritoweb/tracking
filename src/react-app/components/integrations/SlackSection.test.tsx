// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SlackStatus } from "@shared/schemas";

let status: SlackStatus | undefined;
const idle = { mutate: vi.fn(), isPending: false };
vi.mock("@/hooks/useSlack", () => ({
  useSlackStatus: () => ({ data: status }),
  useSetSlackNotify: () => idle,
  useSendSlackTest: () => idle,
  useDisconnectSlack: () => idle,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { SlackSection } = await import("./SlackSection");

const base: SlackStatus = { configured: true, connected: false, teamName: null, canManage: false, notify: true, linked: null };
const renderWith = (s: Partial<SlackStatus>) => {
  status = { ...base, ...s };
  return render(
    <MemoryRouter>
      <SlackSection />
    </MemoryRouter>
  );
};

describe("SlackSection", () => {
  it("renders nothing when the server has no Slack app", () => {
    const { container } = renderWith({ configured: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the install only to a manager", () => {
    renderWith({ canManage: true });
    expect(screen.getByRole("button", { name: "Add to Slack" })).toBeInTheDocument();
  });

  it("tells a member who can connect it instead of showing a button that would be refused", () => {
    renderWith({ canManage: false });
    expect(screen.queryByRole("button", { name: "Add to Slack" })).not.toBeInTheDocument();
    expect(screen.getByText(/owner or admin can connect Slack/)).toBeInTheDocument();
  });

  it("once connected, shows the personal switch and warns when the email matched nobody", () => {
    renderWith({ connected: true, teamName: "Acme", linked: false, notify: false });
    expect(screen.getByRole("switch", { name: "Send my unread notifications to Slack" })).not.toBeChecked();
    expect(screen.getByText(/No Slack user in Acme has your email address/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });
});

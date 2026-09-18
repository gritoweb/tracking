// @vitest-environment jsdom
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { PageFrame } from "./PageFrame";

let mounts = 0;

function Page() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <div data-testid="page" />;
}

function renderAt(path: string) {
  mounts = 0;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <nav>
        <Link to="/tasks/abc">task</Link>
        <Link to="/tasks/abc/comments">comments</Link>
        <Link to="/reports">reports</Link>
      </nav>
      <Routes>
        <Route element={<PageFrame />}>
          <Route path="tasks/:id?/:tab?" element={<Page />} />
          <Route path="reports" element={<Page />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("PageFrame", () => {
  it("keeps the page mounted while a task is opened and its tab is switched", () => {
    renderAt("/tasks");
    fireEvent.click(screen.getByText("task"));
    fireEvent.click(screen.getByText("comments"));
    fireEvent.click(screen.getByText("task"));
    expect(mounts).toBe(1);
  });

  it("remounts the page when the section changes, so each page still fades in", () => {
    renderAt("/tasks/abc");
    fireEvent.click(screen.getByText("reports"));
    expect(mounts).toBe(2);
  });
});

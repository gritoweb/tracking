// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

const { TaskAttachments } = await import("./TaskAttachments");

const image = (name = "a.png", type = "image/png", size = 100) => new File([new Uint8Array(size)], name, { type });

function setup(onUpload: (file: File) => Promise<unknown> = vi.fn(async () => undefined)) {
  const utils = render(
    <TaskAttachments attachments={[]} loading={false} onOpen={() => {}} onDelete={() => {}} canDelete={() => true} onUpload={onUpload} />
  );
  return { onUpload: onUpload as ReturnType<typeof vi.fn>, ...utils };
}

const choose = (files: File[]) =>
  fireEvent.change(screen.getByLabelText("Choose files to attach"), { target: { files } });

describe("TaskAttachments — attaching", () => {
  beforeEach(() => toastError.mockClear());

  it("uploads an image chosen with the button", async () => {
    const { onUpload } = setup();
    const file = image();
    choose([file]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
  });

  it("uploads several images, one after another", async () => {
    const { onUpload } = setup();
    choose([image("a.png"), image("b.jpg", "image/jpeg")]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
  });

  it("uploads a PDF and a spreadsheet the same way as an image", async () => {
    const { onUpload } = setup();
    const pdf = image("brief.pdf", "application/pdf");
    const sheet = image("hours.xlsx", "");
    choose([pdf, sheet]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload).toHaveBeenCalledWith(pdf);
  });

  it("sends any kind of file — Markdown, a diagram, a program — for the server to type", async () => {
    const { onUpload } = setup();
    choose([image("plan.md", "text/markdown"), image("map.mmd", ""), image("setup.exe", "application/x-msdownload")]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(3));
    expect(toastError).not.toHaveBeenCalled();
  });

  it("refuses a file over 25 MB but still sends the valid one beside it", async () => {
    const { onUpload } = setup();
    const ok = image("ok.png");
    choose([image("huge.pdf", "application/pdf", 25 * 1024 * 1024 + 1), ok]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(ok));
    expect(toastError).toHaveBeenCalledWith("File is larger than 25 MB");
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("tells people the size limit and what opens here before they pick a file", () => {
    setup();
    expect(screen.getByText(/Any file, up to 25 MB each\. Images, PDFs and text files open here; other files download\./)).toBeInTheDocument();
  });

  it("uploads images dropped on the area", async () => {
    const { onUpload, container } = setup();
    const file = image("dropped.webp", "image/webp");
    fireEvent.drop(container.firstElementChild as HTMLElement, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
  });

  it("disables the button while an upload is running and enables it again after", async () => {
    let finish: () => void = () => {};
    const { onUpload } = setup(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))));
    choose([image()]);
    const button = screen.getByRole("button", { name: /Attach file/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    finish();
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one upload fails", async () => {
    const onUpload = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    setup(onUpload);
    choose([image("a.png"), image("b.png")]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
  });
});

describe("TaskAttachments — deleting", () => {
  const file = (id: string, userId: string) =>
    ({ id, userId, filename: `${id}.pdf`, contentType: "application/pdf", size: 10, width: null, height: null, url: `/api/attachments/${id}`, createdAt: "" }) as const;

  it("offers delete only on the files this person may delete", () => {
    render(
      <TaskAttachments
        attachments={[file("mine", "u-me"), file("theirs", "u-other")]}
        loading={false}
        onOpen={() => {}}
        onDelete={() => {}}
        canDelete={(a) => a.userId === "u-me"}
        onUpload={async () => undefined}
      />
    );
    expect(screen.getByRole("button", { name: "Delete mine.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete theirs.pdf" })).not.toBeInTheDocument();
  });
});

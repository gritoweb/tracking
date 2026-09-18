// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

const { TaskAttachments } = await import("./TaskAttachments");

const image = (name = "a.png", type = "image/png", size = 100) => new File([new Uint8Array(size)], name, { type });

function setup(onUpload: (file: File) => Promise<unknown> = vi.fn(async () => undefined)) {
  const utils = render(
    <TaskAttachments attachments={[]} loading={false} onOpenLightbox={() => {}} onDelete={() => {}} onUpload={onUpload} />
  );
  return { onUpload: onUpload as ReturnType<typeof vi.fn>, ...utils };
}

const choose = (files: File[]) =>
  fireEvent.change(screen.getByLabelText("Choose images to attach"), { target: { files } });

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

  it("refuses a file that is not an image, saying why, and uploads nothing", async () => {
    const { onUpload } = setup();
    choose([image("notes.txt", "text/plain")]);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only PNG, JPEG, WebP and GIF images are accepted"));
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("refuses an image over 10 MB but still sends the valid one beside it", async () => {
    const { onUpload } = setup();
    const ok = image("ok.png");
    choose([image("huge.png", "image/png", 10 * 1024 * 1024 + 1), ok]);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(ok));
    expect(toastError).toHaveBeenCalledWith("Image is larger than 10 MB");
    expect(onUpload).toHaveBeenCalledTimes(1);
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
    const button = screen.getByRole("button", { name: /Attach image/ });
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

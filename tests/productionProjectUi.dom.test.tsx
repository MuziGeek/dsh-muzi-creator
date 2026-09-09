/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionProjectControls } from "../src/client/ProductionProjectControls.tsx";
import { en } from "../src/client/locales.ts";
import { emptyBurn, emptyPublish } from "../src/publishStatus.ts";
import type { ContentDetail } from "../src/types.ts";

function content(patch: Partial<ContentDetail> = {}): ContentDetail {
  return { id: "demo", title: "测试", folderPath: "D:\\视频 内容\\demo", recordedAt: 0, createdMs: 0, covers: {}, subtitles: {}, hasPublishPackage: false, hasArticle: false, waitingForExport: false, tags: [], pipeline: "raw", workflow: "record", publish: emptyPublish(), burn: emptyBurn(), subtitleJob: emptyBurn(), coverJob: emptyBurn(), publishCopy: "", topicNote: "", script: "", article: "", secrets: { subtitle: { kind: "subtitle", ref: "", configured: false, writable: false }, cover: { kind: "cover", ref: "", configured: false, writable: false } }, ...patch };
}
function face() {
  return { bindProductionProject: vi.fn(async (_id: string, path: string | null) => content(path === null ? {} : { productionProjectPath: path })), openProductionProjectFolder: vi.fn(async () => content()), waitForExport: vi.fn(async () => content({ waitingForExport: true })), cancelWaitForExport: vi.fn(async () => content()), pickDirectory: vi.fn(async (): Promise<string | null> => null) };
}
function Harness({ initial = content(), api = face(), english = false }: { initial?: ContentDetail; api?: ReturnType<typeof face>; english?: boolean }) {
  const [detail, setDetail] = useState(initial);
  return <ProductionProjectControls detail={detail} face={api} onChange={setDetail} {...(english ? { t: (key: keyof typeof en) => en[key] } : {})} />;
}
afterEach(cleanup);
describe("production project controls", () => {
  it("saves a Unicode path through Enter and unlinks without opening a project", async () => {
    const api = face(); render(<Harness api={api} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: " D:\\视频 内容\\剪辑.prproj " } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    await waitFor(() => expect(api.bindProductionProject).toHaveBeenCalledWith("demo", "D:\\视频 内容\\剪辑.prproj"));
    await waitFor(() => expect(screen.getByRole("button", { name: "解除绑定" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "打开所在目录" }));
    await waitFor(() => expect(api.openProductionProjectFolder).toHaveBeenCalledWith("demo"));
    await waitFor(() => expect(screen.getByRole("button", { name: "解除绑定" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "解除绑定" }));
    await waitFor(() => expect(api.bindProductionProject).toHaveBeenLastCalledWith("demo", null));
  });
  it("keeps legacy project references visible and leaves them intact when the picker is cancelled", async () => {
    const api=face(); render(<Harness api={api} initial={content({studioPath: "/Movies/旧工程.screenstudio"})} />);
    fireEvent.click(screen.getByRole("button", {name:"选择目录"}));
    await waitFor(()=>expect(api.pickDirectory).toHaveBeenCalledOnce());
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("/Movies/旧工程.screenstudio");
    expect(api.bindProductionProject).not.toHaveBeenCalled();
  });
  it("waits for a video with no project binding and cancels only the wait", async () => {
    const api=face(); render(<Harness api={api} />);
    fireEvent.click(screen.getByRole("button",{name:"等待成片"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"停止等待"})).toBeTruthy());
    fireEvent.click(screen.getByRole("button",{name:"停止等待"}));
    await waitFor(()=>expect(api.cancelWaitForExport).toHaveBeenCalledWith("demo"));
    expect(api.bindProductionProject).not.toHaveBeenCalled();
  });
  it("preserves input after failure and allows retry without duplicate writes", async () => {
    const api=face(); let reject!: (error: Error)=>void;
    api.bindProductionProject.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
    render(<Harness api={api} />); fireEvent.change(screen.getByRole("textbox"),{target:{value:"D:\\missing"}});
    const form=screen.getByRole("textbox").closest("form")!;
    fireEvent.submit(form);fireEvent.submit(form);expect(api.bindProductionProject).toHaveBeenCalledOnce();
    reject(new Error("目录不存在"));await screen.findByRole("alert");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("D:\\missing");
    fireEvent.submit(form);await waitFor(()=>expect(api.bindProductionProject).toHaveBeenCalledTimes(2));
  });
  it("uses English labels and disables waiting when a video already exists", () => {
    render(<Harness english initial={content({videoRaw:"/tmp/video.mov"})} />);
    expect(screen.getByRole("button",{name:"Video found"}).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Project file or folder path")).toBeTruthy();
  });
  it("ignores a late result after navigating away", async () => {
    const api=face(); let finish!: (detail:ContentDetail)=>void;
    api.bindProductionProject.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const changed=vi.fn();const view=render(<ProductionProjectControls detail={content()} face={api} onChange={changed}/>);
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"/tmp/project"}});fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    view.unmount();finish(content({productionProjectPath:"/tmp/project"}));await Promise.resolve();expect(changed).not.toHaveBeenCalled();
  });
});

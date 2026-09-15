import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The close handshake, with `@tauri-apps/api` stood in for. What is worth
 * testing here is the sequencing -- that the window is not told it may go
 * until every registered flush has settled, and that a flush which fails
 * does not hold it open -- none of which needs a real webview.
 */
const listeners: ((event: unknown) => void)[] = [];
const unlisten = vi.fn();
const listen = vi.fn(async (_name: string, handler: (event: unknown) => void) => {
  listeners.push(handler);
  return unlisten;
});
const invoke = vi.fn(async () => {});

vi.mock("@tauri-apps/api/event", () => ({ listen: (n: string, h: (e: unknown) => void) => listen(n, h) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: () => invoke() }));

const { installCloseHandshake, registerCloseFlush } = await import("./appClose");

/** Lets the handshake's own promise chain run to completion. */
const settled = () => new Promise((r) => setTimeout(r, 0));

async function fireClose() {
  for (const handler of listeners) handler({});
  await settled();
}

beforeEach(() => {
  listeners.length = 0;
  unlisten.mockClear();
  listen.mockClear();
  invoke.mockClear();
});

describe("the close handshake", () => {
  it("waits for a pending save before letting the window go", async () => {
    const teardown = installCloseHandshake();
    await settled();

    let release = () => {};
    const saved = new Promise<void>((r) => {
      release = r;
    });
    const unregister = registerCloseFlush(() => saved);

    await fireClose();
    expect(invoke).not.toHaveBeenCalled(); // still saving

    release();
    await settled();
    expect(invoke).toHaveBeenCalledTimes(1);

    unregister();
    teardown();
  });

  it("does not hold the window open for a save that failed", async () => {
    const teardown = installCloseHandshake();
    await settled();
    const unregister = registerCloseFlush(() => Promise.reject(new Error("disk full")));
    const alsoUnregister = registerCloseFlush(() => {
      throw new Error("threw synchronously");
    });

    await fireClose();
    expect(invoke).toHaveBeenCalledTimes(1);

    unregister();
    alsoUnregister();
    teardown();
  });

  it("closes immediately when nothing has anything to save", async () => {
    const teardown = installCloseHandshake();
    await settled();
    await fireClose();
    expect(invoke).toHaveBeenCalledTimes(1);
    teardown();
  });

  it("stops asking a flush that has unregistered", async () => {
    const teardown = installCloseHandshake();
    await settled();
    const flush = vi.fn();
    registerCloseFlush(flush)();

    await fireClose();
    expect(flush).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    teardown();
  });

  it("undoes the subscription on teardown", async () => {
    const teardown = installCloseHandshake();
    await settled();
    teardown();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("undoes a subscription that had not finished being set up", async () => {
    // Tearing down before `listen` resolves must still unlisten, or the
    // listener outlives the component that asked for it.
    const teardown = installCloseHandshake();
    teardown();
    await settled();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { schedulePublicSessionCheck } from "../../src/lib/public-session-start";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("public session restoration", () => {
  it("waits for document loading and the initial paint window", () => {
    vi.useFakeTimers(); vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const begin = vi.fn(), cancel = schedulePublicSessionCheck(begin);
    vi.advanceTimersByTime(1000); expect(begin).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load")); vi.advanceTimersByTime(299); expect(begin).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(begin).toHaveBeenCalledOnce(); cancel();
  });
  it.each(["pointerdown", "keydown", "gdg:auth-needed"])("starts immediately and only once for %s intent", (name) => {
    vi.useFakeTimers(); vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    const begin = vi.fn(), cancel = schedulePublicSessionCheck(begin);
    window.dispatchEvent(new Event(name)); expect(begin).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event(name)); vi.runAllTimers(); expect(begin).toHaveBeenCalledOnce(); cancel();
  });
  it("cancels delayed and intent work when the provider is replaced", () => {
    vi.useFakeTimers(); vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    const begin = vi.fn(), cancel = schedulePublicSessionCheck(begin); cancel();
    window.dispatchEvent(new Event("gdg:auth-needed")); vi.runAllTimers(); expect(begin).not.toHaveBeenCalled();
  });
});

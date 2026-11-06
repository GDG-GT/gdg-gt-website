// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "../../src/lib/api";
import ResponseFileLinks from "../../src/ui/forms/ResponseFileLinks";
const { apiMock, identity } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-reviewer", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity.id ? identity : null }),
}));
const props = {
    formId: "fictional-form",
    responseId: "fictional-response",
    ids: ["fictional-file-a", "fictional-file-b"],
    canDownload: true,
  },
  result = {
    url: "https://storage.example.test/form-uploads/fictional.pdf?signature=fictional",
    expiresIn: 60,
  };
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
const button = () =>
  screen.getByRole("button", { name: "Authorize private attachment 1" });
async function authorize() {
  fireEvent.click(button());
  return screen.findByRole("link", { name: "Download attachment 1" });
}
beforeEach(() => {
  apiMock.mockReset().mockResolvedValue(result);
  identity.id = "fictional-reviewer";
  identity.role = "admin";
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Private response attachment authorization", () => {
  it("authorizes on explicit request without opening a file automatically and retains privacy attributes", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    render(<ResponseFileLinks {...props} />);
    expect(apiMock).not.toHaveBeenCalled();
    const link = await authorize();
    expect(click).not.toHaveBeenCalled();
    expect(link.getAttribute("href")).toBe(result.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(apiMock.mock.calls[0][0]).toBe(
      "/admin/forms/fictional-form/responses/fictional-response/files/fictional-file-a",
    );
    expect(apiMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(screen.getByRole("status")).toBe(document.activeElement);
  });
  it("latches repeated authorization and prevents parallel requests for another attachment", async () => {
    const wait = pending<typeof result>();
    apiMock.mockReturnValue(wait.promise);
    render(<ResponseFileLinks {...props} />);
    const first = button();
    act(() => {
      fireEvent.click(first);
      fireEvent.click(first);
      fireEvent.click(
        screen.getByRole("button", { name: "Authorize private attachment 2" }),
      );
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    await act(async () => wait.resolve(result));
    expect(
      screen.getByRole("link", { name: "Download attachment 1" }),
    ).toBeTruthy();
  });
  for (const change of [
    "account",
    "role",
    "form",
    "response",
    "files",
    "permission",
  ]) {
    it(`clears a ready link immediately on ${change} replacement`, async () => {
      const view = render(<ResponseFileLinks {...props} />);
      await authorize();
      if (change === "account") identity.id = "other-fictional-reviewer";
      if (change === "role") identity.role = "team_member";
      view.rerender(
        <ResponseFileLinks
          {...props}
          formId={change === "form" ? "other-form" : props.formId}
          responseId={
            change === "response" ? "other-response" : props.responseId
          }
          ids={change === "files" ? ["other-file"] : props.ids}
          canDownload={change !== "permission"}
        />,
      );
      expect(screen.queryByRole("link")).toBeNull();
      expect(apiMock).toHaveBeenCalledTimes(1);
      if (change === "permission")
        expect((button() as HTMLButtonElement).disabled).toBe(true);
    });
  }
  it("aborts a replaced response request and rejects its late signed result", async () => {
    const wait = pending<typeof result>();
    apiMock.mockReturnValue(wait.promise);
    const view = render(<ResponseFileLinks {...props} />);
    fireEvent.click(button());
    const signal = apiMock.mock.calls[0][1].signal;
    view.rerender(<ResponseFileLinks {...props} responseId="other-response" />);
    expect(signal.aborted).toBe(true);
    await act(async () => wait.resolve(result));
    expect(screen.queryByRole("link")).toBeNull();
    expect((button() as HTMLButtonElement).disabled).toBe(false);
  });
  it("cancels authorization on unmount without creating or clicking an anchor", async () => {
    const wait = pending<typeof result>();
    apiMock.mockReturnValue(wait.promise);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click"),
      view = render(<ResponseFileLinks {...props} />);
    fireEvent.click(button());
    const signal = apiMock.mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => wait.resolve(result));
    expect(click).not.toHaveBeenCalled();
  });
  it("clears a ready link and blocks stale-session authorization after sign-out", async () => {
    render(<ResponseFileLinks {...props} />);
    await authorize();
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(screen.queryByRole("link")).toBeNull();
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button());
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
  it("aborts an active request on session invalidation and rejects its late result", async () => {
    const wait = pending<typeof result>();
    apiMock.mockReturnValue(wait.promise);
    render(<ResponseFileLinks {...props} />);
    fireEvent.click(button());
    const signal = apiMock.mock.calls[0][1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    await act(async () => wait.resolve(result));
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("clears private links on offline transition without authorizing again on reconnect", async () => {
    render(<ResponseFileLinks {...props} />);
    await authorize();
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.queryByRole("link")).toBeNull();
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect((button() as HTMLButtonElement).disabled).toBe(false);
  });
  it("aborts pending authorization on offline transition and ignores a late result", async () => {
    const wait = pending<typeof result>();
    apiMock.mockReturnValue(wait.promise);
    render(<ResponseFileLinks {...props} />);
    fireEvent.click(button());
    const signal = apiMock.mock.calls[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(signal.aborted).toBe(true);
    await act(async () => wait.resolve(result));
    expect(screen.queryByRole("link")).toBeNull();
  });
  for (const status of [403, 404, 503]) {
    it(`clears the previous link on ${status} and permits only an explicit fresh authorization`, async () => {
      render(<ResponseFileLinks {...props} />);
      await authorize();
      apiMock.mockRejectedValueOnce(
        new ApiFailure(
          status,
          "UNAVAILABLE",
          "Fictional file authorization failed",
        ),
      );
      fireEvent.click(button());
      await screen.findByRole("alert");
      expect(screen.queryByRole("link")).toBeNull();
      expect(apiMock).toHaveBeenCalledTimes(2);
      await authorize();
      expect(apiMock).toHaveBeenCalledTimes(3);
    });
  }
  it("blocks further requests after a sign-in denial", async () => {
    apiMock.mockRejectedValueOnce(
      new ApiFailure(401, "UNAUTHENTICATED", "Sign in again"),
    );
    render(<ResponseFileLinks {...props} />);
    fireEvent.click(button());
    await screen.findByRole("alert");
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
  });
  for (const bad of [
    { url: "javascript:alert(1)", expiresIn: 60 },
    { url: "data:text/html,fictional", expiresIn: 60 },
    { url: "http://storage.example.test/file", expiresIn: 60 },
    { url: "//storage.example.test/file", expiresIn: 60 },
    { url: "https://name:fictional@storage.example.test/file", expiresIn: 60 },
    { url: result.url + "#fragment", expiresIn: 60 },
    { url: result.url, expiresIn: 0 },
    { url: result.url, expiresIn: 61 },
    { url: result.url, expiresIn: "60" },
    null,
  ]) {
    it(`rejects an unverifiable authorization ${JSON.stringify(bad)}`, async () => {
      apiMock.mockResolvedValueOnce(bad);
      render(<ResponseFileLinks {...props} />);
      fireEvent.click(button());
      await screen.findByRole("alert");
      expect(screen.queryByRole("link")).toBeNull();
    });
  }
  it("supports configured loopback storage without weakening external HTTPS", async () => {
    apiMock.mockResolvedValueOnce({
      ...result,
      url: "http://127.0.0.1:54361/form-uploads/fictional.pdf?signature=fictional",
    });
    render(<ResponseFileLinks {...props} />);
    expect((await authorize()).getAttribute("href")).toMatch(
      /^http:\/\/127.0.0.1/,
    );
  });
  it("expires links conservatively and never refreshes them automatically", async () => {
    vi.useFakeTimers();
    render(<ResponseFileLinks {...props} />);
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.queryByRole("link")).toBeTruthy();
    act(() => vi.advanceTimersByTime(55000));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/download link expired/)).toBeTruthy();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
  it("rejects a signed response arriving after its safe authorization window", async () => {
    vi.useFakeTimers();
    const wait = pending<typeof result>();
    apiMock.mockReturnValue(wait.promise);
    render(<ResponseFileLinks {...props} />);
    fireEvent.click(button());
    act(() => vi.advanceTimersByTime(56000));
    await act(async () => wait.resolve(result));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(
      /expired before it arrived/,
    );
  });
  it("prevents activation when the link expired before the timer callback could run", async () => {
    render(<ResponseFileLinks {...props} />);
    const link = await authorize();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61000);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("does not move focus when authorization expires in the background", async () => {
    vi.useFakeTimers();
    render(<ResponseFileLinks {...props} />);
    await act(async () => {
      fireEvent.click(button());
    });
    const second = screen.getByRole("button", {
      name: "Authorize private attachment 2",
    });
    second.focus();
    act(() => vi.advanceTimersByTime(55000));
    expect(document.activeElement).toBe(second);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("prevents activation after the client clock moves behind the authorization start", async () => {
    render(<ResponseFileLinks {...props} />);
    const link = await authorize();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() - 61000);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("replaces an authorized link when another attachment is requested", async () => {
    render(<ResponseFileLinks {...props} />);
    await authorize();
    fireEvent.click(
      screen.getByRole("button", { name: "Authorize private attachment 2" }),
    );
    expect(
      screen.queryByRole("link", { name: "Download attachment 1" }),
    ).toBeNull();
    await screen.findByRole("link", { name: "Download attachment 2" });
  });
  it("does not request anything without attachments, a current account or download permission", () => {
    const view = render(<ResponseFileLinks {...props} ids={[]} />);
    expect(screen.getByText("Not answered")).toBeTruthy();
    view.rerender(<ResponseFileLinks {...props} canDownload={false} />);
    fireEvent.click(button());
    expect(apiMock).not.toHaveBeenCalled();
    identity.id = "";
    view.rerender(<ResponseFileLinks {...props} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

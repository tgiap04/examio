import { describe, expect, it } from "vitest";
import { createSessionErrorMessage, snapshotBannerState } from "./snapshot-banner";

describe("snapshotBannerState", () => {
  it("shows nothing unless the snapshot is known to be outdated", () => {
    expect(snapshotBannerState({ snapshotOutdated: false, canRefreshSnapshot: true }, true)).toEqual({ show: false, showButton: false });
    expect(snapshotBannerState({ snapshotOutdated: null, canRefreshSnapshot: true }, true)).toEqual({ show: false, showButton: false });
    expect(snapshotBannerState({}, true)).toEqual({ show: false, showButton: false });
  });

  it("shows the button only when refreshing is allowed and the user may manage sessions", () => {
    const s = { snapshotOutdated: true, canRefreshSnapshot: true };
    expect(snapshotBannerState(s, true)).toEqual({ show: true, showButton: true });
    expect(snapshotBannerState(s, false)).toEqual({ show: true, showButton: false });
    expect(snapshotBannerState({ snapshotOutdated: true, canRefreshSnapshot: false }, true)).toEqual({ show: true, showButton: false });
  });
});

describe("createSessionErrorMessage", () => {
  it("maps the quiz set errors and ignores others", () => {
    expect(createSessionErrorMessage("QUIZSET_DELETED")).toMatch(/đã bị xóa/);
    expect(createSessionErrorMessage("QUIZSET_TOO_LARGE")).toMatch(/quá lớn/);
    expect(createSessionErrorMessage("OTHER")).toBeNull();
    expect(createSessionErrorMessage(undefined)).toBeNull();
  });
});

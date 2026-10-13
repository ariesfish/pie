// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/mobile-panels/model.test.ts
// (Pie adaptation: view names — agent→home, agent-list→sessions,
// file-explorer→explorer; selection types come from tabs-store.)
import { describe, expect, it } from "vitest";
import type { MobilePanelView } from "@/stores/tabs-store";
import {
  canBeginMobilePanelGesture,
  createMobilePanelMotionState,
  getMobilePanelFrame,
  isMobilePanelActive,
  isMobilePanelGestureCurrent,
  transitionMobilePanel,
  type MobilePanelCommit,
  type MobilePanelEvent,
  type MobilePanelMotionState,
} from "./model";

class MobilePanelsScenario {
  private nextRevision = 0;
  private startedRevision = -1;
  private state: MobilePanelMotionState;
  readonly commits: MobilePanelCommit[] = [];

  constructor(target: MobilePanelView = "home") {
    this.state = createMobilePanelMotionState({ target, revision: this.nextRevision });
  }

  command(target: MobilePanelView) {
    this.nextRevision += 1;
    this.dispatch({ type: "command", selection: { target, revision: this.nextRevision } });
    return this;
  }

  beginGesture(origin: MobilePanelView) {
    this.dispatch({ type: "gesture.begin", origin });
    this.startedRevision = this.state.gesture?.startedRevision ?? -1;
    return this;
  }

  finishGesture(target: MobilePanelView) {
    this.dispatch({
      type: "gesture.finish",
      startedRevision: this.startedRevision,
      success: true,
      target,
    });
    return this;
  }

  cancelGesture() {
    this.dispatch({
      type: "gesture.finish",
      startedRevision: this.startedRevision,
      success: false,
      target: this.state.target,
    });
    return this;
  }

  settleAt(position: number) {
    this.dispatch({ type: "position.changed", position });
    return this;
  }

  snapshot() {
    return {
      motionTarget: this.state.motionTarget,
      revision: this.state.revision,
      settledTarget: this.state.settledTarget,
      target: this.state.target,
    };
  }

  private dispatch(event: MobilePanelEvent) {
    const transition = transitionMobilePanel(this.state, event);
    this.state = transition.state;
    if (transition.commit) {
      this.commits.push(transition.commit);
    }
  }
}

describe("mobile panel ownership", () => {
  it("publishes activity only after motion settles", () => {
    const initial = createMobilePanelMotionState({ target: "home", revision: 0 });
    const dragging = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "home",
    }).state;
    const released = transitionMobilePanel(dragging, {
      type: "gesture.finish",
      startedRevision: 0,
      success: true,
      target: "sessions",
    }).state;
    const commandTransition = transitionMobilePanel(released, {
      type: "command",
      selection: { target: "sessions", revision: 1 },
    });
    const commanded = commandTransition.state;

    expect(isMobilePanelActive(dragging, "sessions")).toBe(false);
    expect(isMobilePanelActive(released, "sessions")).toBe(false);
    expect(isMobilePanelActive(commanded, "sessions")).toBe(false);
    expect(commandTransition.animationTarget).toBeUndefined();

    const settled = transitionMobilePanel(commanded, {
      type: "position.changed",
      position: -1,
    }).state;
    expect(isMobilePanelActive(settled, "sessions")).toBe(true);
  });

  it("activates immediately when the command arrives after position settles", () => {
    const initial = createMobilePanelMotionState({ target: "home", revision: 0 });
    const dragging = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "home",
    }).state;
    const released = transitionMobilePanel(dragging, {
      type: "gesture.finish",
      startedRevision: 0,
      success: true,
      target: "sessions",
    }).state;
    const reachedAnchor = transitionMobilePanel(released, {
      type: "position.changed",
      position: -1,
    }).state;

    expect(isMobilePanelActive(reachedAnchor, "sessions")).toBe(false);

    const commanded = transitionMobilePanel(reachedAnchor, {
      type: "command",
      selection: { target: "sessions", revision: 1 },
    });
    expect(commanded.animationTarget).toBeUndefined();

    const settled = transitionMobilePanel(commanded.state, {
      type: "position.changed",
      position: -1,
    }).state;
    expect(isMobilePanelActive(settled, "sessions")).toBe(true);
  });

  it("does not change activity for a cancelled preview", () => {
    const initial = createMobilePanelMotionState({ target: "home", revision: 0 });
    const dragging = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "home",
    }).state;
    const cancelled = transitionMobilePanel(dragging, {
      type: "gesture.finish",
      startedRevision: 0,
      success: false,
      target: "sessions",
    }).state;

    expect(isMobilePanelActive(dragging, "home")).toBe(true);
    expect(isMobilePanelActive(cancelled, "home")).toBe(true);
    expect(isMobilePanelActive(cancelled, "sessions")).toBe(false);
  });

  it("keeps the visible panel active until its closing motion settles", () => {
    const initial = createMobilePanelMotionState({ target: "sessions", revision: 0 });
    const closing = transitionMobilePanel(initial, {
      type: "command",
      selection: { target: "home", revision: 1 },
    }).state;

    expect(isMobilePanelActive(closing, "sessions")).toBe(true);

    const settled = transitionMobilePanel(closing, {
      type: "position.changed",
      position: 0,
    }).state;
    expect(isMobilePanelActive(settled, "sessions")).toBe(false);
    expect(isMobilePanelActive(settled, "home")).toBe(true);
  });

  it("follows programmatic commands through left, center, and right", () => {
    const panels = new MobilePanelsScenario();

    panels.command("sessions").settleAt(-1);
    expect(panels.snapshot()).toEqual({
      target: "sessions",
      motionTarget: "sessions",
      settledTarget: "sessions",
      revision: 1,
    });

    panels.command("home").command("explorer").settleAt(1);
    expect(panels.snapshot()).toEqual({
      target: "explorer",
      motionTarget: "explorer",
      settledTarget: "explorer",
      revision: 3,
    });
  });

  it("turns a completed drag into one semantic commit", () => {
    const panels = new MobilePanelsScenario();

    panels.beginGesture("home").finishGesture("sessions");

    expect(panels.snapshot()).toEqual({
      target: "home",
      motionTarget: "sessions",
      settledTarget: "home",
      revision: 0,
    });
    expect(panels.commits).toEqual([{ target: "sessions", startedRevision: 0 }]);
  });

  it("returns a canceled drag to the latest canonical target", () => {
    const panels = new MobilePanelsScenario("sessions");

    panels.beginGesture("sessions").cancelGesture();

    expect(panels.snapshot()).toEqual({
      target: "sessions",
      motionTarget: "sessions",
      settledTarget: "sessions",
      revision: 0,
    });
    expect(panels.commits).toEqual([]);
  });

  it("makes a command during a drag invalidate the stale gesture finish", () => {
    const panels = new MobilePanelsScenario();

    panels.beginGesture("home").command("explorer").finishGesture("sessions");

    expect(panels.snapshot()).toEqual({
      target: "explorer",
      motionTarget: "explorer",
      settledTarget: "home",
      revision: 1,
    });
    expect(panels.commits).toEqual([]);
  });

  it("keeps the latest rapid command when position reaches a stale anchor", () => {
    const panels = new MobilePanelsScenario();

    panels.command("sessions");
    panels.command("home").command("explorer");
    panels.settleAt(-1);

    expect(panels.snapshot()).toEqual({
      target: "explorer",
      motionTarget: "explorer",
      settledTarget: "home",
      revision: 3,
    });
  });

  it("keeps an activated drag current while blocking a second drag", () => {
    const initial = createMobilePanelMotionState({ target: "home", revision: 7 });
    const active = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "home",
    }).state;

    expect(isMobilePanelGestureCurrent(active, 7)).toBe(true);
    expect(canBeginMobilePanelGesture(active, "home", 0)).toBe(false);
  });

  it("derives both transforms and both backdrops from one normalized position", () => {
    expect(getMobilePanelFrame(0.25, 400)).toEqual({
      leftBackdropOpacity: 0,
      leftTranslateX: -400,
      rightBackdropOpacity: 0.25,
      rightTranslateX: 300,
    });
    expect(getMobilePanelFrame(0.25, 800)).toEqual({
      leftBackdropOpacity: 0,
      leftTranslateX: -800,
      rightBackdropOpacity: 0.25,
      rightTranslateX: 600,
    });
  });
});

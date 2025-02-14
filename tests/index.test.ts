import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, context, effect, state } from "../src";

describe("State and Subscribers", () => {
  beforeEach(() => vi.useFakeTimers());

  it("should update synchronously", () => {
    const count = state(0);

    count.set(1);
    expect(count.get()).toStrictEqual(1);
  });

  it("should execute subscribers in order", () => {
    let events: string[] = [];
    const count = state(0);

    count.subscribe(() => {
      events.push("sub1");
    });
    effect(() => {
      count.get();
      events.push("effect1");
    });
    count.subscribe(() => {
      events.push("sub2");
    });
    effect(() => {
      count.get();
      events.push("effect2");
    });

    expect(events).toStrictEqual(["effect1", "effect2"]);
    events = [];

    count.set(1);
    expect(events).toStrictEqual([]);

    vi.runAllTicks();
    expect(events).toStrictEqual(["sub1", "effect1", "sub2", "effect2"]);
  });

  it("should execute callbacks before subscribers", () => {
    let events: string[] = [];
    const count = state(0);

    count.subscribe(() => {
      events.push("sub1");
      return () => events.push("sub1cb");
    });
    effect(() => {
      count.get();
      events.push("effect1");
      return () => events.push("effect1cb");
    });
    count.subscribe(() => {
      events.push("sub2");
      return () => events.push("sub2cb");
    });
    effect(() => {
      count.get();
      events.push("effect2");
      return () => events.push("effect2cb");
    });

    events = [];

    count.set(1);
    expect(events).toStrictEqual([]);

    vi.runAllTicks();
    expect(events).toStrictEqual([
      "sub1",
      "effect1cb",
      "effect1",
      "sub2",
      "effect2cb",
      "effect2",
    ]);
    events = [];

    count.set(2);
    vi.runAllTicks();
    expect(events).toStrictEqual([
      "sub1cb",
      "sub1",
      "effect1cb",
      "effect1",
      "sub2cb",
      "sub2",
      "effect2cb",
      "effect2",
    ]);
  });

  it("should skip calling subscribers if value is update to the same initial value", () => {
    let events: string[] = [];
    const count = state(0);

    count.subscribe(() => {
      events.push("sub1");
    });
    effect(() => {
      count.get();
      events.push("effect1");
    });
    count.subscribe(() => {
      events.push("sub2");
    });
    effect(() => {
      count.get();
      events.push("effect2");
    });

    events = [];

    count.set(0);
    vi.runAllTicks();
    expect(events).toStrictEqual([]);

    count.set(1);
    count.set(0);
    vi.runAllTicks();
    expect(events).toStrictEqual([]);
  });

  it("should batch synchronous updates", async () => {
    let events: string[] = [];
    const count = state(0);

    count.subscribe(() => {
      events.push("sub1");
    });
    effect(() => {
      count.get();
      events.push("effect1");
    });
    count.subscribe(() => {
      events.push("sub2");
    });
    effect(() => {
      count.get();
      events.push("effect2");
    });

    events = [];

    count.set(1);
    count.set(2);
    expect(events).toStrictEqual([]);

    vi.runAllTicks();
    expect(events).toStrictEqual(["sub1", "effect1", "sub2", "effect2"]);
    events = [];

    count.set(3);
    setTimeout(() => count.set(4), 0);
    vi.runAllTimers();

    vi.runAllTicks();
    expect(events).toStrictEqual([
      "sub1",
      "effect1",
      "sub2",
      "effect2",
      // again
      "sub1",
      "effect1",
      "sub2",
      "effect2",
    ]);
  });

  it("should run effect with multiple dependencies in order", () => {
    let events: string[] = [];
    const count = state(0);
    const count2 = state(100);

    effect(() => {
      count.get();
      count2.get();
      events.push("effect1");
    });
    effect(() => {
      count.get();
      events.push("effect2");
    });

    events = [];

    count.set(1);
    vi.runAllTicks();
    expect(events).toStrictEqual(["effect1", "effect2"]);
    events = [];

    // updating count2 will requeue effect1
    count.set(2);
    count2.set(200);
    vi.runAllTicks();
    expect(events).toStrictEqual(["effect2", "effect1"]);
  });

  it("should update computed values", () => {
    let events: string[] = [];
    const count = state(0);
    const countString = computed(() => {
      events.push("computed1");
      return count.get().toString();
    });

    count.subscribe(() => {
      events.push("sub1");
    });
    countString.subscribe(() => {
      events.push("sub2");
    });
    effect(() => {
      countString.get();
      events.push("effect1");
    });
    effect(() => {
      count.get();
      countString.get();
      events.push("effect2");
    });

    expect(events).toStrictEqual(["computed1", "effect1", "effect2"]);
    events = [];

    count.set(1);
    expect(countString.get()).toStrictEqual("0");
    expect(events).toStrictEqual([]);

    vi.runAllTicks();
    expect(countString.get()).toStrictEqual("1");
    expect(events).toStrictEqual([
      "computed1",
      "sub1",
      "sub2",
      "effect1",
      "effect2",
    ]);
  });

  it("should unsubscribe from state after signal aborts", () => {
    let events: string[] = [];
    const count = state(0);
    const controller = new AbortController();

    controller.signal.addEventListener("abort", () => {
      events.push("aborted");
    });

    count.subscribe(() => {
      events.push("sub1");
    });
    count.subscribe(
      () => {
        events.push("sub2");
      },
      { signal: controller.signal }
    );
    effect(() => {
      count.get();
      events.push("effect1");
    });
    effect(
      () => {
        count.get();
        events.push("effect2");
      },
      { signal: controller.signal }
    );

    events = [];

    count.set(1);
    vi.runAllTicks();
    expect(events).toStrictEqual(["sub1", "sub2", "effect1", "effect2"]);
    events = [];

    controller.abort();

    count.set(2);
    vi.runAllTicks();
    expect(events).toStrictEqual(["aborted", "sub1", "effect1"]);
  });
});

describe("Context", () => {
  it("should execute immediately except when lazy", () => {
    let events: string[] = [];

    context(() => {
      events.push("loaded");
    });

    expect(events).toStrictEqual(["loaded"]);
    events = [];

    const ctx = context(
      () => {
        events.push("loaded");
      },
      { lazy: true }
    );

    expect(events).toStrictEqual([]);
    ctx.load();
    expect(events).toStrictEqual(["loaded"]);
    events = [];
  });

  it("should execute callback and abort signal when context is unloaded", () => {
    let events: string[] = [];

    const handle = context((signal) => {
      signal.addEventListener("abort", () => {
        events.push("aborted");
      });
      events.push("loaded");
      return () => events.push("unloaded");
    });

    handle.unload();
    expect(events).toStrictEqual(["loaded", "unloaded", "aborted"]);
  });
});

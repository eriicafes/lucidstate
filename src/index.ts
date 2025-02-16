type Cleanup = void | (() => void);

const effects = createEffectStack();
const scheduler = createEffectScheduler();

export type State<T> = {
  /**
   * Get the current value.
   */
  get(): T;
  /**
   * Set a new value.
   *
   * Multiple calls to set are batched and only after the final value changed will the subscribers be called.
   */
  set(value: T | ((prev: T) => T)): void;
  /**
   * Subscribe to changes.
   *
   * Subscribers may return a cleanup function that will be called before rerunning.
   * Subscribers may also receive a signal to unsubscribe when the signal aborts.
   */
  subscribe(fn: () => Cleanup, options?: { signal?: AbortSignal }): () => void;
};

/**
 * Creates a reactive value that can be retrived, updated and subscribed to.
 */
export function state<T>(initialValue: T): State<T> {
  let stateValue = initialValue;
  const subscribers = new Set<() => Cleanup>();

  return {
    get() {
      const effect = effects.current();
      if (effect) this.subscribe(effect.fn, effect.options);
      return stateValue;
    },
    set(value) {
      let newValue =
        typeof value === "function"
          ? (value as (prev: T) => T)(stateValue)
          : value;

      if (stateValue === newValue) return;
      const snapshot = stateValue;
      stateValue = newValue;

      for (const fn of subscribers) {
        scheduler.queue(fn, this, snapshot, newValue);
      }
    },
    subscribe(fn, options) {
      subscribers.add(fn);
      if (options?.signal) {
        options.signal.addEventListener("abort", () => subscribers.delete(fn));
      }
      return () => subscribers.delete(fn);
    },
  };
}

export type ComputedState<T> = Omit<State<T>, "set">;

/**
 * Creates a reactive value that can be retrieved and subscribed to.
 *
 * Computed automatically subscribes to reactive values that are used inside it
 * and updates when any of it's dependencies updates.
 */
export function computed<U>(fn: () => U): ComputedState<U> {
  const { get, set, subscribe } = state<U>(null as U);
  effects.add({ fn: () => set(fn()) });
  return { get, subscribe };
}

/**
 * Effect automatically subscribes to reactive values that are used inside it
 * and reruns when any of it's dependencies updates.
 *
 * Effects may return a cleanup function that will be called before rerunning.
 * Effects may also receive a signal to unsubscribe when the signal aborts.
 */
export function effect(fn: () => Cleanup, options?: { signal?: AbortSignal }) {
  effects.add({ fn, options });
}

const unsubSymbol = Symbol("unsub");
const getCleanup = (target: any) => target[unsubSymbol] as Cleanup | undefined;
const setCleanup = (target: any, value: Cleanup) =>
  (target[unsubSymbol] = value);

type Effect = {
  fn: () => Cleanup;
  options?: { signal?: AbortSignal };
};
function createEffectStack() {
  const stack: Effect[] = [];
  return {
    add(effect: Effect) {
      stack.push(effect);
      setCleanup(effect.fn, effect.fn());
      stack.pop();
    },
    current() {
      return stack[stack.length - 1];
    },
  };
}

type Deps = Map<State<any>, { snapshot: any; update: any }>;
function createEffectScheduler() {
  const executions = new Map<() => Cleanup, Deps>();
  return {
    queue<T>(fn: () => Cleanup, state: State<T>, snapshot: T, update: T) {
      const deps: Deps = executions.get(fn) ?? new Map();
      // if execution exists delete and re-add so it executes later than it was initially queued for
      executions.delete(fn);
      // track state dependencies
      const dep = deps.get(state);
      if (dep) dep.update = update;
      else deps.set(state, { snapshot, update });
      executions.set(fn, deps);

      if (executions.size > 1) return;
      queueMicrotask(() => {
        for (const [fn, deps] of executions) {
          for (const [_, dep] of deps) {
            // execute and break out of loop if any deps have updated
            if (dep.snapshot !== dep.update) {
              getCleanup(fn)?.();
              setCleanup(fn, fn());
              break;
            }
          }
        }
        executions.clear();
      });
    },
  };
}

export type Context = {
  unload(): void;
  load(): void;
};

/**
 * Creates a block that can be loaded and unloaded.
 *
 * Context accepts a signal that is aborted when the context is unloaded.
 * Context may return a cleanup function that will be called before rerunning.
 *
 * Context function runs immediately, if you prefer to run it manually then set lazy to true.
 * Calling load on a context unloads the context (if already loaded) before rerunning.
 */
export function context(
  fn: (signal: AbortSignal) => Cleanup,
  options?: { lazy?: boolean }
): Context {
  let controller = new AbortController();
  let cb: Cleanup;
  if (!options?.lazy) cb = fn(controller.signal);
  return {
    load() {
      this.unload();
      controller = new AbortController();
      cb = fn(controller.signal);
    },
    unload() {
      if (cb) cb();
      controller.abort();
    },
  };
}

/**
 * Returns the first element in document that matches selector.
 */
export function ref<E extends Element = Element>(selector: string) {
  return document.querySelector<E>(selector);
}

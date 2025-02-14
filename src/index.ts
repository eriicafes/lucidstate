type Unsub = void | (() => void);

const effects = createEffectStack();
const scheduler = createEffectScheduler();

export type State<T> = {
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(fn: () => Unsub, options?: { signal?: AbortSignal }): () => void;
};

export function state<T>(initialValue: T): State<T> {
  let stateValue = initialValue;
  const subscribers = new Set<() => Unsub>();

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

export function computed<U>(fn: () => U): ComputedState<U> {
  const { get, set, subscribe } = state<U>(null as U);
  effects.add({ fn: () => set(fn()) });
  return { get, subscribe };
}

export function effect(fn: () => Unsub, options?: { signal?: AbortSignal }) {
  effects.add({ fn, options });
}

const unsubSymbol = Symbol("unsub");
const getUnsub = (target: any) => target[unsubSymbol] as Unsub | undefined;
const setUnsub = (target: any, value: Unsub) => (target[unsubSymbol] = value);

type Effect = {
  fn: () => Unsub;
  options?: { signal?: AbortSignal };
};
function createEffectStack() {
  const stack: Effect[] = [];
  return {
    add(effect: Effect) {
      stack.push(effect);
      setUnsub(effect.fn, effect.fn());
      stack.pop();
    },
    current() {
      return stack[stack.length - 1];
    },
  };
}

type Deps = Map<State<any>, { snapshot: any; update: any }>;
function createEffectScheduler() {
  const executions = new Map<() => Unsub, Deps>();
  return {
    queue<T>(fn: () => Unsub, state: State<T>, snapshot: T, update: T) {
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
              getUnsub(fn)?.();
              setUnsub(fn, fn());
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

export function context(
  fn: (signal: AbortSignal) => Unsub,
  options?: { lazy?: boolean }
): Context {
  let controller = new AbortController();
  let cb: Unsub;
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

export function ref<E extends Element = Element>(selector: string) {
  return document.querySelector<E>(selector);
}

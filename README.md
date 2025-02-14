# LucidState

Simple and lightweight signals based reactive state management library for building applications with vanilla javascript and DOM APIs.

## Installation

```sh
npm i lucidstate
```

## Usage

```ts
import { computed, effect, state } from "lucidstate";

const count = state(0);
const countString = computed(() => `${count.get()}`);

count.subscribe(() => {
  console.log("count changed:", count.get());
});

effect(() => {
  console.log(
    "count and count string changed:",
    count.get(),
    countString.get()
  );
});
```

## State

`state` creates a reactive value that can be retrived, updated and subscribed to.

```ts
import { state } from "lucidstate";

const count = state(0);

count.subscribe(() => console.log("count changed"));

count.get(); // 0
count.set(1);
count.get(); // 1
```

### Subscribing to changes

Subscribers are called after a reactive value is changed to another value different from it's current value.
Multiple calls to set state are batched and only after the final value changed will the subscribers be called.

Subscribers may return a cleanup function that will be called before rerunning.

Subscribers may also receive a signal to unsubscribe when the signal aborts.

```ts
import { state } from "lucidstate";

const count = state(0);
const controller = new AbortController();

count.subscribe(
  () => {
    console.log("count changed");
    return () => console.log("running cleanup");
  },
  { signal: controller.signal }
);

// subscribers will not be called as the value did not change
const update1 = () => {
  count.set(0);
};

// subscribers will not be called as the final value is still 0
const update2 = () => {
  count.set(1);
  count.set(2);
  count.set(0);
};

// subscribers are called once after the last update
const update3 = () => {
  count.set(1);
  count.set(2);
  count.set(3);
};
```

## Computed

`computed` creates a reactive value that can be retrieved and subscribed to.

`computed` automatically subscribes to reactive values that are used inside it and updates when any of it's dependencies updates.

```ts
import { computed, state } from "lucidstate";

const count = state(0);
const countString = computed(() => `${count.get()}`);

countString.subscribe(() => console.log("count string changed"));

countString.get(); // "0"
```

## Effect

`effect` automatically subscribes to reactive values that are used inside it and reruns when any of it's dependencies updates.
Effects are ran immediately and when dependencies update.

Effects may return a cleanup function that will be called before rerunning.

Effects may also receive a signal to unsubscribe when the signal aborts.

```ts
import { effect, state } from "lucidstate";

const count = state(0);
const count2 = state(100);
const controller = new AbortController();

effect(
  () => {
    console.log("changed", count.get(), count2.get());
    return () => console.log("running cleanup");
  },
  { signal: controller.signal }
);
```

## Context

`context` creates a block that can be loaded and unloaded. A context accepts a signal that is aborted when the context is unloaded.

A context may return a cleanup function that will be called before rerunning.

```ts
import { context } from "lucidstate";

const registerEvents = context((signal) => {
  console.log("registering events");
  window.addEventListener(
    "resize",
    () => {
      console.log("window resized");
    },
    { signal }
  );
  return () => console.log("running cleanup");
});

registerEvents.unload(); // runs cleanup and aborts signal
```

### Explicit context loading

Context function runs immediately, if you prefer to run it manually then make the context lazy.

Calling load on a context unloads the current context (if any) before rerunning.

```ts
import { context } from "lucidstate";

const registerEvents = context(
  (signal) => {
    console.log("registering events");
    window.addEventListener(
      "resize",
      () => {
        console.log("window resized");
      },
      { signal }
    );
    return () => console.log("running cleanup");
  },
  { lazy: true }
);

registerEvents.load(); // manually load
registerEvents.load(); // runs cleanup and aborts signal and reruns
registerEvents.unload(); // runs cleanup and aborts signal
```

## Ref

`ref` is an alias for document.querySelector()

```ts
const btn = ref<HTMLButtonElement>("#btn");
```

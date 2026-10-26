"use client";

import { useSyncExternalStore } from "react";

import { toDateInputValue, toTimeInputValue } from "@/lib/utils";

/** The clock is read on render, never pushed, so there is nothing to subscribe to. */
const subscribe = () => () => {};

// `useSyncExternalStore` calls the snapshot getter repeatedly and compares the
// results, so it has to hand back the same value until something really
// changed. The clock is therefore cached, keyed on the minute — the finest
// detail a date or time picker bound cares about.
let cachedKey = "";
let cachedNow = new Date(0);

function getClockSnapshot(): Date {
  const now = new Date();
  const key = `${toDateInputValue(now)}T${toTimeInputValue(now)}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedNow = now;
  }
  return cachedNow;
}

/** No clock on the server: it cannot know the visitor's timezone. */
function getServerClockSnapshot(): null {
  return null;
}

/**
 * The visitor's clock, and only once the app has hydrated.
 *
 * "Today" and "now" depend on the visitor's timezone and machine, so the server
 * renders with no clock (`null`) and the client fills one in after hydration.
 * Rendering a clock during the first client render instead would make the
 * server HTML and the hydrating render disagree — the mismatch React reports as
 * a hydration error.
 */
export function useClientNow(): Date | null {
  return useSyncExternalStore(subscribe, getClockSnapshot, getServerClockSnapshot);
}

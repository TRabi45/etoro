"use client";

import { useClientValue } from "@/components/ui/use-client-value";

/**
 * "Good morning" - in the reader's timezone, not the server's.
 *
 * Small, but it is the first thing on the page, and a briefing that says
 * "Good morning" at nine in the evening undermines the colleague voice
 * immediately. The server has no way to know the reader's local hour, so it
 * renders the morning form and the browser corrects it during hydration.
 */

function localGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 18 || hour < 5) {
    return "Good evening.";
  }
  return hour >= 12 ? "Good afternoon." : "Good morning.";
}

export function Greeting() {
  // Morning is the server's guess, which is also the right one for a product
  // whose whole premise is a Monday-morning brief.
  const greeting = useClientValue(localGreeting, "Good morning.");
  return <>{greeting}</>;
}

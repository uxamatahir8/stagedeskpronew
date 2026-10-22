"use client";

import { useEffect } from "react";

/** Tells the page embedding this form how tall it is, so the iframe never scrolls. */
export function ReportHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => window.parent.postMessage({ type: "stagedesk:height", height: document.documentElement.scrollHeight }, "*");
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    send();
    return () => observer.disconnect();
  }, []);
  return null;
}

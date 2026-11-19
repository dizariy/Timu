// Give an immediate local-cache response enough time to acknowledge the press.
export function refreshFeedback(manual) {
  const startedAt = performance.now();
  return () => {
    if (!manual || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const remaining = 480 - (performance.now() - startedAt);
    if (remaining > 0) return new Promise(resolve => setTimeout(resolve, remaining));
  };
}

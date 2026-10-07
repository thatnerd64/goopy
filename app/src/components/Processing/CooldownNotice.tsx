import { useCallback, useSyncExternalStore } from "react";
import { HourglassTop } from "@mui/icons-material";
import { Chip } from "@mui/material";
import { useProcessingProvider } from "src/provider/ProcessingProvider";

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}

// Whole seconds left until `endsAt` (0 when there is nothing to wait for).
// The clock is an external, changing value: it is read through
// useSyncExternalStore, and the snapshot only changes once per second.
function useSecondsLeft(endsAt: number | null): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!endsAt) return () => {};
      const timer = setInterval(onChange, 500);
      return () => clearInterval(timer);
    },
    [endsAt],
  );

  return useSyncExternalStore(subscribe, () =>
    endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0,
  );
}

/**
 * Shown while the queue waits between downloads (DOWNLOAD_COOLDOWN_*), so an
 * idle queue is not mistaken for a stuck one.
 */
export function CooldownNotice() {
  const { cooldownEndsAt } = useProcessingProvider();
  const remaining = useSecondsLeft(cooldownEndsAt);

  if (remaining <= 0) return null;

  return (
    <Chip
      component="output"
      icon={<HourglassTop />}
      label={`Next download in ${formatCountdown(remaining)}`}
      size="small"
      color="info"
      variant="outlined"
      data-testid="cooldown-notice"
    />
  );
}

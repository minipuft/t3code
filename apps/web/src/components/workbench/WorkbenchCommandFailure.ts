import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

/** Human-readable message for a failed atom command, falling back when the cause carries no message. */
export function commandFailureMessage(
  result: Parameters<typeof squashAtomCommandFailure>[0],
  fallback: string,
): string {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error && cause.message.trim().length > 0 ? cause.message : fallback;
}

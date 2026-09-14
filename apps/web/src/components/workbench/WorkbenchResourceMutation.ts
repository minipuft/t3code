import type {
  WorkbenchResourceApplyInput,
  WorkbenchResourceMutationReview,
} from "@t3tools/contracts";

export function resourceApplyInput(
  review: WorkbenchResourceMutationReview,
): WorkbenchResourceApplyInput {
  return {
    proposalId: review.proposal.id,
    expectedRevision: review.proposal.revision,
    diffDigest: review.proposal.diffDigest,
    ...(review.proposal.git.requiresCheckpoint
      ? { checkpoint: review.proposal.git.statusDigest }
      : {}),
  };
}

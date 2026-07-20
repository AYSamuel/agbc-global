// The hero's address line (mockup .hero .where). The branch NAME already sits
// in the header, so the hero shows the FULL address instead of repeating it
// (decision 2026-07-20). The branches data carries two free-text lines whose
// meaning is not guaranteed, so any part that merely repeats the branch name is
// dropped (the seed's line1 was the church name for three of four branches).
export function resolveAddressLine(
  address: { line1?: string; line2?: string } | null,
  branchName: string,
): string | null {
  if (address === null) return null;
  const name = branchName.trim().toLowerCase();
  const parts = [address.line1, address.line2]
    .map((part) => part?.trim())
    .filter(
      (part): part is string =>
        part !== undefined && part.length > 0 && part.toLowerCase() !== name,
    );
  return parts.length > 0 ? parts.join(', ') : null;
}

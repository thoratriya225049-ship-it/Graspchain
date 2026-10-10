/** Link into the independent verifier for a receipt held by this deployment. */
export function verifierLink(verifier: string, web: string, assessmentId: string) {
  const u = new URL(verifier);
  u.searchParams.set("id", assessmentId);
  u.searchParams.set("r", `${web.replace(/\/$/, "")}/api/receipts/${assessmentId}`);
  return u.toString();
}

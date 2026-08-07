/**
 * Why a user cannot be deleted, mirroring the server's rules in
 * `DELETE /users/delete-user`.
 *
 * The client used to disable delete for *any* administrator, which is stricter
 * than the server: it only refuses your own account and the last remaining
 * admin. The effect was that no admin could ever be removed, no matter how many
 * there were, and the UI blamed it on being an admin.
 *
 * Keep this in step with the route. Where the caller cannot supply the inputs
 * (an admin count, or who is logged in), prefer leaving the button enabled and
 * letting the server answer over guessing a stricter rule.
 */

export type DeleteUserBlockReason =
  /** You cannot delete the account you are signed in as. */
  | "self"
  /** Removing this admin would leave the install with none. */
  | "last-admin"
  | null;

export function whyCannotDeleteUser({
  targetUsername,
  targetIsAdmin,
  currentUsername,
  adminCount,
}: {
  targetUsername: string;
  targetIsAdmin?: boolean;
  /** Omitted when unknown; the self check is then left to the server. */
  currentUsername?: string;
  /** Omitted when unknown; the last-admin check is then left to the server. */
  adminCount?: number;
}): DeleteUserBlockReason {
  if (currentUsername && targetUsername === currentUsername) return "self";
  if (targetIsAdmin && typeof adminCount === "number" && adminCount <= 1) {
    return "last-admin";
  }
  return null;
}

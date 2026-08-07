import { createCurrentHostResolutionRepository } from "../repositories/factory.js";

/**
 * Rejects an SSH host whose authentication can never succeed.
 *
 * Choosing "key" or "password" and leaving the field empty used to save without
 * complaint, because the write only ran when a value was present. The host then
 * failed at every single connect — SFTP, terminal and the metrics collector all
 * reporting variations of "no usable credentials" long after the setup screen had
 * said the save worked.
 *
 * A secret can legitimately live somewhere other than the host row, so this only
 * refuses when nothing at all could supply one.
 */

export type HostAuthInputs = {
  authType?: string;
  /** Inline secret supplied with this request, if any. */
  key?: unknown;
  password?: unknown;
  credentialId?: unknown;
  vaultProfileId?: unknown;
  folder?: unknown;
  /** True when the stored row already holds usable material (update only). */
  hasStoredSecret?: boolean;
};

function isNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Returns an error message when the configuration cannot authenticate, else null.
 *
 * `ownerId` is only consulted to look for a folder-assigned credential, which is
 * the one source that needs a query.
 */
export async function validateHostAuth(
  inputs: HostAuthInputs,
  ownerId: string,
): Promise<string | null> {
  const authType = inputs.authType;
  if (authType !== "key" && authType !== "password") return null;

  // Anything that can supply a secret without it being on this request.
  if (inputs.hasStoredSecret) return null;
  if (inputs.credentialId) return null;
  if (inputs.vaultProfileId) return null;

  const inlineSecret =
    authType === "key" ? isNonEmpty(inputs.key) : isNonEmpty(inputs.password);
  if (inlineSecret) return null;

  // A folder-assigned credential is resolved at connect time, so a host in such
  // a folder is legitimately allowed to carry no secret of its own.
  if (isNonEmpty(inputs.folder)) {
    try {
      const folderCredentialId =
        await createCurrentHostResolutionRepository().findFolderCredentialId(
          ownerId,
          inputs.folder as string,
        );
      if (folderCredentialId) return null;
    } catch {
      // Cannot confirm one exists; fall through to the error rather than
      // rejecting a host that might have been fine.
      return null;
    }
  }

  return authType === "key"
    ? "Key authentication needs a private key: paste one, pick a saved credential, or assign a credential to this host's folder."
    : "Password authentication needs a password: enter one, pick a saved credential, or assign a credential to this host's folder.";
}

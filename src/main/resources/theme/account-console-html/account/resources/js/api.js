import { accountFetch } from "./account-client.js";

export { getEnvironment, getKeycloak, accountFetch } from "./account-client.js";
export { fetchMessages, loadI18n } from "./i18n.js";

export async function getPersonalInfo() {
  const response = await accountFetch("/?userProfileMetadata=true");
  if (!response.ok) {
    throw new Error(`Failed to load personal info (${response.status})`);
  }
  return response.json();
}

/**
 * @typedef {{ field: string, errorMessage: string, params?: unknown[] }} UserProfileFieldError
 */

/**
 * Account REST failure, optionally with user-profile field errors.
 */
export class AccountApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, errors?: UserProfileFieldError[] }} [options]
   */
  constructor(message, { status, errors } = {}) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
    /** @type {UserProfileFieldError[] | undefined} */
    this.errors = errors;
  }
}

/**
 * Active realm locales for the locale attribute dropdown (Account REST `/supportedLocales`).
 * @returns {Promise<string[]>}
 */
export async function getSupportedLocales() {
  const response = await accountFetch("/supportedLocales");
  if (!response.ok) {
    throw new Error(`Failed to load supported locales (${response.status})`);
  }
  return response.json();
}

/**
 * @param {Record<string, unknown>} user
 */
export async function savePersonalInfo(user) {
  const response = await accountFetch("/", { method: "POST", body: user });
  if (!response.ok) {
    /** @type {UserProfileFieldError[] | undefined} */
    let errors;
    try {
      const payload = await response.json();
      if (Array.isArray(payload?.errors)) {
        errors = payload.errors;
      }
    } catch {
      // ignore non-JSON bodies
    }
    throw new AccountApiError(
      errors?.length
        ? "Failed to save personal info due to validation errors"
        : `Failed to save personal info (HTTP ${response.status})`,
      { status: response.status, errors },
    );
  }
}

/**
 * Credential types available for the signed-in user (Account REST `/credentials`).
 * @returns {Promise<any[]>}
 */
export async function getCredentials() {
  const response = await accountFetch("/credentials");
  if (!response.ok) {
    throw new Error(`Failed to load credentials (${response.status})`);
  }
  return response.json();
}

/**
 * Devices / sessions for the signed-in user (Account REST `/sessions/devices`).
 * @returns {Promise<any[]>}
 */
export async function getDevices() {
  const response = await accountFetch("/sessions/devices");
  if (!response.ok) {
    throw new Error(`Failed to load devices (${response.status})`);
  }
  return response.json();
}

/**
 * Delete one session, or all sessions when `id` is omitted (Account REST `/sessions`).
 * @param {string} [id]
 */
export async function deleteSession(id) {
  const path = id ? `/sessions/${encodeURIComponent(id)}` : "/sessions";
  const response = await accountFetch(path, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to sign out session (${response.status})`);
  }
  return response;
}

/**
 * Applications the signed-in user can access (Account REST `/applications`).
 * @returns {Promise<any[]>}
 */
export async function getApplications() {
  const response = await accountFetch("/applications");
  if (!response.ok) {
    throw new Error(`Failed to load applications (${response.status})`);
  }
  return response.json();
}

/**
 * Remove granted consent for an application.
 * @param {string} clientId
 */
export async function deleteConsent(clientId) {
  const response = await accountFetch(
    `/applications/${encodeURIComponent(clientId)}/consent`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Failed to remove consent (${response.status})`);
  }
  return response;
}

/**
 * End all sessions (including offline) for an application.
 * @param {string} clientId
 */
export async function deleteApplicationSessions(clientId) {
  const response = await accountFetch(
    `/applications/${encodeURIComponent(clientId)}/sessions`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Failed to end application sessions (${response.status})`);
  }
  return response;
}

/**
 * Groups the signed-in user belongs to (Account REST `/groups`).
 * @returns {Promise<any[]>}
 */
export async function getGroups() {
  const response = await accountFetch("/groups");
  if (!response.ok) {
    throw new Error(`Failed to load groups (${response.status})`);
  }
  return response.json();
}

/**
 * Identity providers linked to the user, or available to link
 * (Account REST `/linked-accounts`).
 *
 * @param {{ linked?: boolean, search?: string, first?: number, max?: number }} [query]
 * @returns {Promise<any[]>}
 */
export async function getLinkedAccounts(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const response = await accountFetch(
    `/linked-accounts${qs ? `?${qs}` : ""}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load linked accounts (${response.status})`);
  }
  return response.json();
}

/**
 * Unlink an identity provider from the signed-in user.
 * @param {string} providerAlias
 */
export async function unlinkAccount(providerAlias) {
  const response = await accountFetch(
    `/linked-accounts/${encodeURIComponent(providerAlias)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Failed to unlink account (${response.status})`);
  }
  return response;
}

/**
 * Organizations the signed-in user belongs to (Account REST `/organizations`).
 * @returns {Promise<any[]>}
 */
export async function getOrganizations() {
  const response = await accountFetch("/organizations");
  if (!response.ok) {
    throw new Error(`Failed to load organizations (${response.status})`);
  }
  return response.json();
}

/**
 * UMA resources owned by the user, or shared with them.
 *
 * @param {{ shared?: boolean, name?: string, first?: number, max?: number }} [query]
 * @returns {Promise<any[]>}
 */
export async function getResources(query = {}) {
  const { shared = false, ...rest } = query;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const path = shared ? "/resources/shared-with-me" : "/resources";
  const response = await accountFetch(`${path}${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    throw new Error(`Failed to load resources (${response.status})`);
  }
  return response.json();
}

/**
 * Pending permission requests for a resource.
 * @param {string} resourceId
 * @returns {Promise<any[]>}
 */
export async function getPermissionRequests(resourceId) {
  const response = await accountFetch(
    `/resources/${encodeURIComponent(resourceId)}/permissions/requests`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load permission requests (${response.status})`);
  }
  return response.json();
}

/**
 * Current permissions granted on a resource.
 * @param {string} resourceId
 * @returns {Promise<any[]>}
 */
export async function getPermissions(resourceId) {
  const response = await accountFetch(
    `/resources/${encodeURIComponent(resourceId)}/permissions`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load permissions (${response.status})`);
  }
  return response.json();
}

/**
 * Replace / update permissions on a resource
 * (`PUT /resources/{id}/permissions`).
 *
 * @param {string} resourceId
 * @param {{ username: string, scopes: (string | { name?: string })[] }[]} permissions
 */
export async function updatePermissions(resourceId, permissions) {
  const body = permissions.map((permission) => ({
    username: permission.username,
    scopes: (permission.scopes ?? []).map((scope) =>
      typeof scope === "string" ? scope : scope.name,
    ),
  }));
  const response = await accountFetch(
    `/resources/${encodeURIComponent(resourceId)}/permissions`,
    { method: "PUT", body },
  );
  if (!response.ok) {
    throw new Error(`Failed to update permissions (${response.status})`);
  }
  return response;
}

/**
 * Verifiable credential configurations available to the user
 * (Account REST `/verifiable-credentials`).
 * @returns {Promise<any[]>}
 */
export async function getVerifiableCredentials() {
  const response = await accountFetch("/verifiable-credentials");
  if (!response.ok) {
    throw new Error(
      `Failed to load verifiable credentials (${response.status})`,
    );
  }
  return response.json();
}

/**
 * Delete / revoke a verifiable credential configuration.
 * @param {string} credentialScopeName
 */
export async function deleteVerifiableCredential(credentialScopeName) {
  const response = await accountFetch(
    `/verifiable-credentials/${encodeURIComponent(credentialScopeName)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to delete verifiable credential (${response.status})`,
    );
  }
  return response;
}

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
 * @param {Record<string, unknown>} user
 */
export async function savePersonalInfo(user) {
  const response = await accountFetch("/", { method: "POST", body: user });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.errors) {
        detail = JSON.stringify(payload.errors);
      }
    } catch {
      // ignore
    }
    throw new Error(`Failed to save personal info: ${detail}`);
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

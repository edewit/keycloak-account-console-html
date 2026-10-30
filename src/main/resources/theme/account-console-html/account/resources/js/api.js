import { accountFetch } from "./account-client.js";

export { getEnvironment, getKeycloak, accountFetch } from "./account-client.js";

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

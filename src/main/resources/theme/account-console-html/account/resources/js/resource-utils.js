import { css } from "lit";

/**
 * @param {any} resource
 * @returns {string}
 */
export function resourceId(resource) {
  return resource?._id ?? resource?.id ?? "";
}

/**
 * @param {unknown} scope
 * @returns {string}
 */
export function scopeName(scope) {
  if (typeof scope === "string") {
    return scope;
  }
  if (scope && typeof scope === "object" && "name" in scope) {
    return /** @type {{ name?: string }} */ (scope).name ?? "";
  }
  return "";
}

/**
 * @param {unknown} scope
 * @returns {string}
 */
export function scopeLabel(scope) {
  if (typeof scope === "string") {
    return scope;
  }
  if (scope && typeof scope === "object") {
    const s = /** @type {{ displayName?: string, name?: string }} */ (scope);
    return s.displayName || s.name || "";
  }
  return "";
}

/**
 * @param {any} resource
 * @returns {string[]}
 */
export function resourceScopeNames(resource) {
  return (resource?.scopes ?? []).map(scopeName).filter(Boolean);
}

/**
 * @param {any} resource
 * @returns {string}
 */
export function resourceDisplayName(resource) {
  return resource?.displayName || resource?.name || "";
}

/** Shared layout styles for resource share / edit / request dialogs. */
export const resourceDialogStyles = css`
  :host {
    --account-resource-dialog-border: var(
      --account-border-color,
      color-mix(in srgb, currentColor 25%, transparent)
    );
    --account-resource-dialog-radius: var(--account-radius, 0.5rem);
    --account-resource-dialog-muted: var(
      --account-muted-color,
      color-mix(in srgb, currentColor 55%, transparent)
    );
    --account-resource-dialog-error: var(--account-error-color, #b42318);
    --account-resource-dialog-button-padding: var(
      --account-button-padding,
      0.5rem 1rem
    );

    display: contents;
  }

  .subtitle {
    margin: 0;
    color: var(--account-resource-dialog-muted);
    font-size: 0.95rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field > span,
  .field > label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .field input[type="text"] {
    font: inherit;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--account-resource-dialog-border);
    border-radius: var(--account-resource-dialog-radius);
    background: transparent;
    color: inherit;
  }

  .scope-list,
  .shared-with {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .scope-list label {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-weight: 400;
  }

  .scopes {
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .scopes li {
    display: inline-flex;
    padding: 0.1rem 0.45rem;
    border: 1px solid var(--account-resource-dialog-border);
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .shared-with {
    gap: 0.75rem;
  }

  .shared-with li {
    border: 1px solid var(--account-resource-dialog-border);
    border-radius: var(--account-resource-dialog-radius);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .user {
    font-weight: 600;
  }

  .email {
    color: var(--account-resource-dialog-muted);
    font-size: 0.9rem;
  }

  .request-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .error {
    margin: 0;
    color: var(--account-resource-dialog-error);
    font-size: 0.9rem;
  }
`;

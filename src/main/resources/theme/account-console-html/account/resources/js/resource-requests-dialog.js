import { LitElement, html, nothing } from "lit";
import { getPermissions, updatePermissions } from "./api.js";
import "./components/dialog.js";
import { consumeMessages } from "./i18n.js";
import { emitEvent } from "./page.js";
import {
  resourceDialogStyles,
  resourceDisplayName,
  resourceId,
  scopeLabel,
  scopeName,
} from "./resource-utils.js";

/**
 * Approve or deny pending permission requests on a UMA resource.
 *
 *   <account-resource-requests-dialog
 *     .resource=${resource}
 *     .open=${true}
 *     @shared=${…}
 *   ></account-resource-requests-dialog>
 *
 * Events: cancelable `approve-request` / `deny-request`, then `shared` /
 * `permissions-updated` / `error` / `close`.
 */
export class ResourceRequestsDialog extends LitElement {
  static properties = {
    /** @type {any} */
    resource: { attribute: false },
    open: { type: Boolean, reflect: true },
    busy: { state: true },
    error: { state: true },
  };

  static styles = resourceDialogStyles;

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.resource = null;
    this.open = false;
    this.busy = false;
    this.error = "";
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  updated(changed) {
    if (changed.has("open") && this.open) {
      this.error = "";
      this.busy = false;
    }
  }

  #close() {
    this.open = false;
  }

  /**
   * @param {any} shareRequest
   * @param {boolean} approve
   */
  async #approveDeny(shareRequest, approve) {
    const eventType = approve ? "approve-request" : "deny-request";
    if (
      !emitEvent(
        this,
        eventType,
        { resource: this.resource, request: shareRequest },
        { cancelable: true },
      )
    ) {
      return;
    }
    this.busy = true;
    this.error = "";
    try {
      const permissions = await getPermissions(resourceId(this.resource));
      const existing = permissions.find(
        (p) => p.username === shareRequest.username,
      ) || { username: shareRequest.username, scopes: [] };
      const currentScopes = (existing.scopes ?? [])
        .map(scopeName)
        .filter(Boolean);
      const requestScopes = (shareRequest.scopes ?? [])
        .map(scopeName)
        .filter(Boolean);
      const scopes = approve
        ? [...new Set([...currentScopes, ...requestScopes])]
        : currentScopes;
      await updatePermissions(resourceId(this.resource), [
        { username: shareRequest.username, scopes },
      ]);
      emitEvent(this, approve ? "shared" : "permissions-updated", {
        resource: this.resource,
        username: shareRequest.username,
        scopes,
      });
      this.#close();
    } catch (error) {
      this.busy = false;
      this.error = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: eventType,
        error,
        message: this.error,
      });
    }
  }

  render() {
    if (!this.resource) {
      return nothing;
    }
    const requests = this.resource.shareRequests ?? [];
    return html`
      <account-dialog
        .open=${this.open}
        @close=${() => {
          this.open = false;
        }}
      >
        <span slot="title">${this.#t("permissionRequests")}</span>
        <p class="subtitle">${resourceDisplayName(this.resource)}</p>
        ${requests.length
          ? html`
              <ul class="shared-with">
                ${requests.map((request) => {
                  const name =
                    [request.firstName, request.lastName]
                      .filter(Boolean)
                      .join(" ") || request.username;
                  return html`
                    <li>
                      <div class="user">${name}</div>
                      ${request.email
                        ? html`<div class="email">${request.email}</div>`
                        : nothing}
                      <ul class="scopes">
                        ${(request.scopes ?? []).map(
                          (scope) => html`<li>${scopeLabel(scope)}</li>`,
                        )}
                      </ul>
                      <div class="request-actions">
                        <button
                          type="button"
                          class="primary"
                          ?disabled=${this.busy}
                          @click=${() => this.#approveDeny(request, true)}
                        >
                          ${this.#t("approve")}
                        </button>
                        <button
                          type="button"
                          class="danger"
                          ?disabled=${this.busy}
                          @click=${() => this.#approveDeny(request, false)}
                        >
                          ${this.#t("doDeny")}
                        </button>
                      </div>
                    </li>
                  `;
                })}
              </ul>
            `
          : html`<p class="subtitle">
              ${this.#t("resourceNoPermissionsGrantingAccess")}
            </p>`}
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        <button type="button" slot="actions" @click=${() => this.#close()}>
          ${this.#t("doCancel")}
        </button>
      </account-dialog>
    `;
  }
}

customElements.define(
  "account-resource-requests-dialog",
  ResourceRequestsDialog,
);

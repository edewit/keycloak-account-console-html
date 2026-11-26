import { LitElement, html, nothing } from "lit";
import { getPermissions, updatePermissions } from "./api.js";
import "./components/dialog.js";
import { consumeMessages } from "./i18n.js";
import { emitEvent } from "./page.js";
import {
  resourceDialogStyles,
  resourceDisplayName,
  resourceId,
  resourceScopeNames,
} from "./resource-utils.js";

/**
 * Share a UMA resource with another user.
 *
 *   <account-resource-share-dialog
 *     .resource=${resource}
 *     .open=${true}
 *     @shared=${…}
 *   ></account-resource-share-dialog>
 *
 * Events: cancelable `share`, then `shared` / `error` / `close`.
 */
export class ResourceShareDialog extends LitElement {
  static properties = {
    /** @type {any} */
    resource: { attribute: false },
    open: { type: Boolean, reflect: true },
    /** @type {any[]} */
    permissions: { state: true },
    username: { state: true },
    /** @type {string[]} */
    selectedScopes: { state: true },
    busy: { state: true },
    error: { state: true },
  };

  static styles = resourceDialogStyles;

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.resource = null;
    this.open = false;
    this.permissions = [];
    this.username = "";
    this.selectedScopes = [];
    this.busy = false;
    this.error = "";
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  updated(changed) {
    if (!this.open || !this.resource) {
      return;
    }
    const prevOpen = changed.get("open");
    const opened = changed.has("open") && prevOpen !== true;
    const resourceChanged = changed.has("resource") && this.open && !opened;
    if (opened || resourceChanged) {
      this.#prepare();
    }
  }

  async #prepare() {
    this.error = "";
    this.username = "";
    this.selectedScopes = resourceScopeNames(this.resource).slice(0, 1);
    this.permissions = [];
    this.busy = true;
    try {
      this.permissions = await getPermissions(resourceId(this.resource));
      this.busy = false;
    } catch (error) {
      this.busy = false;
      this.error = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "load-permissions",
        error,
        message: this.error,
      });
    }
  }

  #close() {
    this.open = false;
  }

  /**
   * @param {string} scope
   * @param {boolean} checked
   */
  #toggleScope(scope, checked) {
    this.selectedScopes = checked
      ? this.selectedScopes.includes(scope)
        ? this.selectedScopes
        : [...this.selectedScopes, scope]
      : this.selectedScopes.filter((s) => s !== scope);
  }

  async #submit() {
    const username = this.username.trim();
    const scopes = this.selectedScopes;
    if (!username) {
      this.error = this.#t("required");
      return;
    }
    if (!scopes.length) {
      this.error = this.#t("selectPermission");
      return;
    }
    if (
      this.permissions.some(
        (p) => p.username === username || p.email === username,
      )
    ) {
      this.error = this.#t("resourceAlreadyShared");
      return;
    }
    if (
      !emitEvent(
        this,
        "share",
        { resource: this.resource, username, scopes },
        { cancelable: true },
      )
    ) {
      return;
    }
    this.busy = true;
    this.error = "";
    try {
      await updatePermissions(resourceId(this.resource), [
        { username, scopes },
      ]);
      emitEvent(this, "shared", {
        resource: this.resource,
        username,
        scopes,
      });
      this.#close();
    } catch (error) {
      this.busy = false;
      this.error = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "share",
        error,
        message: this.error,
      });
    }
  }

  render() {
    if (!this.resource) {
      return nothing;
    }
    const available = resourceScopeNames(this.resource);
    return html`
      <account-dialog
        .open=${this.open}
        @close=${() => {
          this.open = false;
        }}
      >
        <span slot="title">${this.#t("sharetheResource")}</span>
        <p class="subtitle">${resourceDisplayName(this.resource)}</p>
        ${this.permissions.length
          ? html`
              <div>
                <strong>${this.#t("peopleSharingThisResource")}</strong>
                <ul class="scopes">
                  ${this.permissions.map(
                    (p) => html`<li>${p.username || p.email || ""}</li>`,
                  )}
                </ul>
              </div>
            `
          : nothing}
        <div class="field">
          <label for="share-user">${this.#t("username")} / email</label>
          <input
            id="share-user"
            type="text"
            .value=${this.username}
            ?disabled=${this.busy}
            @input=${(e) => {
              this.username = e.target.value;
            }}
          />
        </div>
        <div class="field">
          <span>${this.#t("permission")}</span>
          <div class="scope-list">
            ${available.map(
              (scope) => html`
                <label>
                  <input
                    type="checkbox"
                    .checked=${this.selectedScopes.includes(scope)}
                    ?disabled=${this.busy}
                    @change=${(e) => this.#toggleScope(scope, e.target.checked)}
                  />
                  ${scope}
                </label>
              `,
            )}
          </div>
        </div>
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        <button type="button" slot="actions" @click=${() => this.#close()}>
          ${this.#t("doCancel")}
        </button>
        <button
          type="button"
          class="primary"
          slot="actions"
          ?disabled=${this.busy}
          @click=${() => this.#submit()}
        >
          ${this.#t("share")}
        </button>
      </account-dialog>
    `;
  }
}

customElements.define("account-resource-share-dialog", ResourceShareDialog);

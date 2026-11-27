import { LitElement, html, nothing } from "lit";
import { getPermissions, updatePermissions } from "./api.js";
import "./components/dialog.js";
import "./components/button.js";
import { consumeMessages } from "./i18n.js";
import { emitEvent } from "./page.js";
import {
  resourceDialogStyles,
  resourceDisplayName,
  resourceId,
  resourceScopeNames,
  scopeName,
} from "./resource-utils.js";

/**
 * Edit permissions already granted on a UMA resource.
 *
 *   <account-resource-edit-dialog
 *     .resource=${resource}
 *     .open=${true}
 *     @permissions-updated=${…}
 *   ></account-resource-edit-dialog>
 *
 * Events: cancelable `update-permissions`, then `permissions-updated` /
 * `error` / `close`.
 */
export class ResourceEditDialog extends LitElement {
  static properties = {
    /** @type {any} */
    resource: { attribute: false },
    open: { type: Boolean, reflect: true },
    /** @type {any[]} */
    permissions: { state: true },
    /** @type {Record<string, string[]>} */
    scopesByUser: { state: true },
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
    this.scopesByUser = {};
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
    this.permissions = [];
    this.scopesByUser = {};
    this.busy = true;
    try {
      const permissions = await getPermissions(resourceId(this.resource));
      const map = {};
      for (const permission of permissions) {
        map[permission.username] = (permission.scopes ?? [])
          .map(scopeName)
          .filter(Boolean);
      }
      this.permissions = permissions;
      this.scopesByUser = map;
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
   * @param {string} username
   * @param {string} scope
   * @param {boolean} checked
   */
  #toggleScope(username, scope, checked) {
    const current = this.scopesByUser[username] ?? [];
    const next = checked
      ? current.includes(scope)
        ? current
        : [...current, scope]
      : current.filter((s) => s !== scope);
    this.scopesByUser = { ...this.scopesByUser, [username]: next };
  }

  async #submit() {
    const permissions = this.permissions.map((permission) => ({
      username: permission.username,
      scopes: this.scopesByUser[permission.username] ?? [],
    }));
    if (
      !emitEvent(
        this,
        "update-permissions",
        { resource: this.resource, permissions },
        { cancelable: true },
      )
    ) {
      return;
    }
    this.busy = true;
    this.error = "";
    try {
      await Promise.all(
        permissions.map((permission) =>
          updatePermissions(resourceId(this.resource), [permission]),
        ),
      );
      emitEvent(this, "permissions-updated", {
        resource: this.resource,
        permissions,
      });
      this.#close();
    } catch (error) {
      this.busy = false;
      this.error = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "update-permissions",
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
        <span slot="title">${this.#t("myPermissions")}</span>
        <p class="subtitle">${resourceDisplayName(this.resource)}</p>
        ${this.permissions.length
          ? html`
              <ul class="shared-with">
                ${this.permissions.map((permission) => {
                  const username = permission.username;
                  const selected = this.scopesByUser[username] ?? [];
                  return html`
                    <li>
                      <div class="user">
                        ${[permission.firstName, permission.lastName]
                          .filter(Boolean)
                          .join(" ") || username}
                      </div>
                      ${permission.email
                        ? html`<div class="email">${permission.email}</div>`
                        : nothing}
                      <div class="scope-list">
                        ${available.map(
                          (scope) => html`
                            <label>
                              <input
                                type="checkbox"
                                .checked=${selected.includes(scope)}
                                ?disabled=${this.busy}
                                @change=${(e) =>
                                  this.#toggleScope(
                                    username,
                                    scope,
                                    e.target.checked,
                                  )}
                              />
                              ${scope}
                            </label>
                          `,
                        )}
                      </div>
                    </li>
                  `;
                })}
              </ul>
            `
          : html`<p class="subtitle">
              ${this.#t("resourceIsNotBeingShared")}
            </p>`}
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        <account-button slot="actions" @click=${() => this.#close()}>
          ${this.#t("doCancel")}
        </account-button>
        <account-button
          variant="primary"
          slot="actions"
          ?disabled=${this.busy || !this.permissions.length}
          @click=${() => this.#submit()}
        >
          ${this.#t("doSave")}
        </account-button>
      </account-dialog>
    `;
  }
}

customElements.define("account-resource-edit-dialog", ResourceEditDialog);

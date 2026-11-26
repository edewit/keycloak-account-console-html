import { LitElement, html, css, nothing } from "lit";
import {
  getPermissionRequests,
  getPermissions,
  getResources,
  updatePermissions,
} from "./api.js";
import { consumeMessages } from "./i18n.js";
import {
  emitEvent,
  pageChromeStyles,
  renderLoadError,
  renderLoading,
  renderMessage,
} from "./page.js";

/**
 * @param {any} resource
 */
function resourceId(resource) {
  return resource?._id ?? resource?.id ?? "";
}

/**
 * @param {unknown} scope
 * @returns {string}
 */
function scopeName(scope) {
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
function scopeLabel(scope) {
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
 * Resources / UMA page (mirrors account-ui Resources).
 *
 * Tabs: my resources (`GET /resources`) and shared with me
 * (`GET /resources/shared-with-me`). Owned rows support share / edit /
 * unshare and approve/deny permission requests.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, `error`, cancelable `share` /
 * `unshare` / `update-permissions` / `approve-request` / `deny-request`,
 * then `shared` / `unshared` / `permissions-updated`.
 *
 * Style via `--account-resources-*` or
 * ::part(title|description|tabs|list|item|actions|dialog|message|empty|badge).
 */
export class Resources extends LitElement {
  static properties = {
    /** @type {"mine" | "shared"} */
    tab: { state: true },
    /** @type {any[] | undefined} */
    resources: { state: true },
    status: { state: true },
    message: { state: true },
    /** @type {"" | "error" | "success"} */
    messageTone: { state: true },
    /** @type {null | { kind: "share" | "edit" | "requests", resource: any, permissions?: any[] }} */
    dialog: { state: true },
    /** @type {string} */
    shareUsername: { state: true },
    /** @type {string[]} */
    shareScopes: { state: true },
    /** @type {Record<string, string[]>} */
    editScopesByUser: { state: true },
    dialogBusy: { state: true },
    dialogError: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
      :host {
        --account-gap: 1.25rem;
        --account-message-margin: var(--account-gap);
        --account-resources-max-width: var(--account-max-width, 48rem);
        --account-resources-muted-color: var(--account-muted-color, currentColor);
        --account-resources-border: var(--account-border-color, currentColor);
        --account-resources-radius: var(--account-radius, 0.5rem);
        --account-resources-error-color: var(--account-error-color, #b42318);
        --account-resources-button-padding: var(
          --account-button-padding,
          0.5rem 1rem
        );
        /* Top-layer <dialog> does not inherit page colors reliably. */
        --account-resources-dialog-bg: var(
          --account-surface,
          light-dark(#ffffff, #1b1b1b)
        );
        --account-resources-dialog-fg: var(
          --account-fg,
          light-dark(#1b1b1b, #f0f0f0)
        );
        --account-resources-backdrop: color-mix(
          in srgb,
          #000 45%,
          transparent
        );

        display: block;
        width: 100%;
        max-width: var(--account-resources-max-width);
      }

      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0 0 var(--account-gap);
      }

      .tabs button,
      .actions button,
      .dialog-actions button,
      .request-actions button,
      .scope-list button.add-user {
        font: inherit;
        cursor: pointer;
        border: 1px solid var(--account-resources-border);
        border-radius: var(--account-resources-radius);
        padding: var(--account-resources-button-padding);
        background: transparent;
        color: inherit;
      }

      .tabs button[aria-selected="true"] {
        background: color-mix(in srgb, currentColor 8%, transparent);
        font-weight: 600;
      }

      button.danger {
        border-color: var(--account-resources-error-color);
        color: var(--account-resources-error-color);
      }

      button.primary {
        background: color-mix(in srgb, currentColor 10%, transparent);
        font-weight: 600;
      }

      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .list {
        list-style: none;
        margin: 0;
        padding: 0;
        border: 1px solid var(--account-resources-border);
        border-radius: var(--account-resources-radius);
        overflow: hidden;
      }

      .header,
      .item {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
        gap: 0.75rem 1rem;
        align-items: start;
        padding: 0.75rem 1rem;
      }

      .header {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--account-resources-muted-color);
        background: color-mix(in srgb, currentColor 4%, transparent);
        border-bottom: 1px solid var(--account-resources-border);
      }

      .item {
        border-top: 1px solid var(--account-resources-border);
      }

      .item:first-of-type {
        border-top: none;
      }

      .name {
        font-weight: 600;
        overflow-wrap: anywhere;
      }

      .client,
      .meta {
        color: var(--account-resources-muted-color);
        font-size: 0.95rem;
        overflow-wrap: anywhere;
      }

      .client a {
        color: inherit;
      }

      .scopes {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .scopes li,
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0.1rem 0.45rem;
        border: 1px solid var(--account-resources-border);
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .badge {
        cursor: pointer;
        font: inherit;
        background: transparent;
        color: inherit;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        justify-content: flex-end;
      }

      .empty {
        margin: 0;
        padding: 0.85rem 1rem;
        color: var(--account-resources-muted-color);
      }

      dialog {
        border: 1px solid var(--account-resources-border);
        border-radius: var(--account-resources-radius);
        padding: 0;
        max-width: min(32rem, calc(100vw - 2rem));
        width: 100%;
        background: var(--account-resources-dialog-bg);
        color: var(--account-resources-dialog-fg);
        color-scheme: light dark;
      }

      dialog::backdrop {
        background: var(--account-resources-backdrop);
      }

      .dialog-body {
        padding: 1.1rem 1.25rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .dialog-body h2 {
        margin: 0;
        font-size: 1.15rem;
      }

      .dialog-body p {
        margin: 0;
        color: var(--account-resources-muted-color);
        font-size: 0.95rem;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .field label {
        font-size: 0.9rem;
        font-weight: 600;
      }

      .field input[type="text"] {
        font: inherit;
        padding: 0.5rem 0.65rem;
        border: 1px solid var(--account-resources-border);
        border-radius: var(--account-resources-radius);
        background: transparent;
        color: inherit;
      }

      .scope-list {
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

      .shared-with {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .shared-with li {
        border: 1px solid var(--account-resources-border);
        border-radius: var(--account-resources-radius);
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .shared-with .user {
        font-weight: 600;
      }

      .shared-with .email {
        color: var(--account-resources-muted-color);
        font-size: 0.9rem;
      }

      .request-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .dialog-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: flex-end;
      }

      .dialog-error {
        margin: 0;
        color: var(--account-resources-error-color);
        font-size: 0.9rem;
      }

      @media (max-width: 40rem) {
        .header {
          display: none;
        }

        .item {
          grid-template-columns: 1fr;
          gap: 0.35rem;
        }

        .actions {
          justify-content: flex-start;
        }
      }
    `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.tab = "mine";
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
    this.dialog = null;
    this.shareUsername = "";
    this.shareScopes = [];
    this.editScopesByUser = {};
    this.dialogBusy = false;
    this.dialogError = "";
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  updated(changed) {
    if (changed.has("dialog")) {
      const el = this.renderRoot?.querySelector("dialog");
      if (!el) {
        return;
      }
      if (this.dialog && !el.open) {
        el.showModal();
      } else if (!this.dialog && el.open) {
        el.close();
      }
    }
  }

  /**
   * @param {"mine" | "shared"} tab
   */
  #selectTab(tab) {
    if (this.tab === tab) {
      return;
    }
    this.tab = tab;
    this.#closeDialog();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    this.resources = undefined;
    const shared = this.tab === "shared";
    try {
      const resources = await getResources({
        shared,
        first: 0,
        max: 100,
      });
      if (!shared) {
        await Promise.all(
          resources.map(async (resource) => {
            const id = resourceId(resource);
            if (!id) {
              resource.shareRequests = [];
              return;
            }
            try {
              resource.shareRequests = await getPermissionRequests(id);
            } catch {
              resource.shareRequests = [];
            }
          }),
        );
      }
      this.resources = resources;
      this.status = "ready";
      emitEvent(this, "load", { tab: this.tab, resources });
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  /**
   * @param {any} resource
   */
  #clientLabel(resource) {
    const client = resource.client ?? {};
    return client.name || client.clientId || "";
  }

  /**
   * @param {any} resource
   * @returns {string[]}
   */
  #resourceScopeNames(resource) {
    return (resource.scopes ?? []).map(scopeName).filter(Boolean);
  }

  #closeDialog() {
    this.dialog = null;
    this.shareUsername = "";
    this.shareScopes = [];
    this.editScopesByUser = {};
    this.dialogBusy = false;
    this.dialogError = "";
  }

  /**
   * @param {any} resource
   * @param {"share" | "edit" | "requests"} kind
   */
  async #openDialog(resource, kind) {
    this.dialogError = "";
    this.dialogBusy = kind !== "requests";
    this.dialog = { kind, resource, permissions: [] };
    this.shareUsername = "";
    this.shareScopes = this.#resourceScopeNames(resource).slice(0, 1);
    this.editScopesByUser = {};

    if (kind === "requests") {
      this.dialogBusy = false;
      return;
    }

    try {
      const permissions = await getPermissions(resourceId(resource));
      const map = {};
      for (const permission of permissions) {
        map[permission.username] = (permission.scopes ?? [])
          .map(scopeName)
          .filter(Boolean);
      }
      this.editScopesByUser = map;
      this.dialog = { kind, resource, permissions };
      this.dialogBusy = false;
    } catch (error) {
      this.dialogBusy = false;
      this.dialogError =
        error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "load-permissions",
        error,
        message: this.dialogError,
      });
    }
  }

  /**
   * @param {Event} event
   */
  #onDialogCancel(event) {
    event.preventDefault();
    this.#closeDialog();
  }

  /**
   * @param {string} scope
   * @param {boolean} checked
   */
  #toggleShareScope(scope, checked) {
    if (checked) {
      if (!this.shareScopes.includes(scope)) {
        this.shareScopes = [...this.shareScopes, scope];
      }
    } else {
      this.shareScopes = this.shareScopes.filter((s) => s !== scope);
    }
  }

  /**
   * @param {string} username
   * @param {string} scope
   * @param {boolean} checked
   */
  #toggleEditScope(username, scope, checked) {
    const current = this.editScopesByUser[username] ?? [];
    const next = checked
      ? current.includes(scope)
        ? current
        : [...current, scope]
      : current.filter((s) => s !== scope);
    this.editScopesByUser = { ...this.editScopesByUser, [username]: next };
  }

  async #submitShare() {
    const dialog = this.dialog;
    if (!dialog || dialog.kind !== "share") {
      return;
    }
    const username = this.shareUsername.trim();
    const scopes = this.shareScopes;
    if (!username) {
      this.dialogError = this.#t("required");
      return;
    }
    if (!scopes.length) {
      this.dialogError = this.#t("selectPermission");
      return;
    }
    const already = (dialog.permissions ?? []).some(
      (p) => p.username === username || p.email === username,
    );
    if (already) {
      this.dialogError = this.#t("resourceAlreadyShared");
      return;
    }
    if (
      !emitEvent(
        this,
        "share",
        { resource: dialog.resource, username, scopes },
        { cancelable: true },
      )
    ) {
      return;
    }
    this.dialogBusy = true;
    this.dialogError = "";
    try {
      await updatePermissions(resourceId(dialog.resource), [
        { username, scopes },
      ]);
      this.messageTone = "success";
      this.message = this.#t("shareSuccess");
      emitEvent(this, "shared", {
        resource: dialog.resource,
        username,
        scopes,
      });
      this.#closeDialog();
      await this.#load();
    } catch (error) {
      this.dialogBusy = false;
      this.dialogError =
        error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "share",
        error,
        message: this.dialogError,
      });
    }
  }

  async #submitEdit() {
    const dialog = this.dialog;
    if (!dialog || dialog.kind !== "edit") {
      return;
    }
    const permissions = (dialog.permissions ?? []).map((permission) => ({
      username: permission.username,
      scopes: this.editScopesByUser[permission.username] ?? [],
    }));
    if (
      !emitEvent(
        this,
        "update-permissions",
        { resource: dialog.resource, permissions },
        { cancelable: true },
      )
    ) {
      return;
    }
    this.dialogBusy = true;
    this.dialogError = "";
    try {
      await Promise.all(
        permissions.map((permission) =>
          updatePermissions(resourceId(dialog.resource), [permission]),
        ),
      );
      this.messageTone = "success";
      this.message = this.#t("updateSuccess");
      emitEvent(this, "permissions-updated", {
        resource: dialog.resource,
        permissions,
      });
      this.#closeDialog();
      await this.#load();
    } catch (error) {
      this.dialogBusy = false;
      this.dialogError =
        error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "update-permissions",
        error,
        message: this.dialogError,
      });
    }
  }

  /**
   * @param {any} resource
   */
  async #unshareAll(resource) {
    if (!confirm(this.#t("unShareAllConfirm"))) {
      return;
    }
    if (
      !emitEvent(this, "unshare", { resource }, { cancelable: true })
    ) {
      return;
    }
    try {
      this.status = "saving";
      const permissions = await getPermissions(resourceId(resource));
      await updatePermissions(
        resourceId(resource),
        permissions.map((permission) => ({
          username: permission.username,
          scopes: [],
        })),
      );
      this.messageTone = "success";
      this.message = this.#t("unShareSuccess");
      emitEvent(this, "unshared", { resource });
      await this.#load();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "unshare",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} shareRequest
   * @param {boolean} approve
   */
  async #approveDeny(shareRequest, approve) {
    const dialog = this.dialog;
    if (!dialog || dialog.kind !== "requests") {
      return;
    }
    const resource = dialog.resource;
    const eventType = approve ? "approve-request" : "deny-request";
    if (
      !emitEvent(
        this,
        eventType,
        { resource, request: shareRequest },
        { cancelable: true },
      )
    ) {
      return;
    }
    this.dialogBusy = true;
    this.dialogError = "";
    try {
      const permissions = await getPermissions(resourceId(resource));
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
      await updatePermissions(resourceId(resource), [
        { username: shareRequest.username, scopes },
      ]);
      this.messageTone = "success";
      this.message = this.#t("shareSuccess");
      this.#closeDialog();
      await this.#load();
    } catch (error) {
      this.dialogBusy = false;
      this.dialogError =
        error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: eventType,
        error,
        message: this.dialogError,
      });
    }
  }

  /**
   * @param {any} resource
   */
  #renderResource(resource) {
    const id = resourceId(resource);
    const client = resource.client ?? {};
    const clientLabel = this.#clientLabel(resource);
    const scopes = Array.isArray(resource.scopes) ? resource.scopes : [];
    const requests = Array.isArray(resource.shareRequests)
      ? resource.shareRequests
      : [];
    const owned = this.tab === "mine";

    return html`
      <li class="item" part="item" data-id=${id}>
        <div class="name">${resource.displayName || resource.name || id}</div>
        <div class="client">
          ${client.baseUrl
            ? html`<a href=${client.baseUrl} target="_blank" rel="noopener"
                >${clientLabel}</a
              >`
            : clientLabel}
        </div>
        <div class="meta">
          ${owned
            ? requests.length
              ? html`
                  <button
                    type="button"
                    class="badge"
                    part="badge"
                    @click=${() => this.#openDialog(resource, "requests")}
                  >
                    ${this.#t("permissionRequests")}: ${requests.length}
                  </button>
                `
              : "—"
            : scopes.length
              ? html`
                  <ul class="scopes">
                    ${scopes.map(
                      (scope) => html`<li>${scopeLabel(scope)}</li>`,
                    )}
                  </ul>
                `
              : "—"}
        </div>
        <div class="actions" part="actions">
          ${owned
            ? html`
                <button
                  type="button"
                  @click=${() => this.#openDialog(resource, "share")}
                >
                  ${this.#t("share")}
                </button>
                <button
                  type="button"
                  @click=${() => this.#openDialog(resource, "edit")}
                >
                  ${this.#t("edit")}
                </button>
                <button
                  type="button"
                  class="danger"
                  @click=${() => this.#unshareAll(resource)}
                >
                  ${this.#t("unShare")}
                </button>
              `
            : nothing}
        </div>
      </li>
    `;
  }

  #renderShareDialog(resource, permissions) {
    const available = this.#resourceScopeNames(resource);
    const shared = permissions ?? [];
    return html`
      <h2>${this.#t("sharetheResource")}</h2>
      <p>${resource.displayName || resource.name || ""}</p>
      ${shared.length
        ? html`
            <div>
              <strong>${this.#t("peopleSharingThisResource")}</strong>
              <ul class="scopes" style="margin-top: 0.5rem">
                ${shared.map(
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
          .value=${this.shareUsername}
          ?disabled=${this.dialogBusy}
          @input=${(e) => {
            this.shareUsername = e.target.value;
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
                  .checked=${this.shareScopes.includes(scope)}
                  ?disabled=${this.dialogBusy}
                  @change=${(e) =>
                    this.#toggleShareScope(scope, e.target.checked)}
                />
                ${scope}
              </label>
            `,
          )}
        </div>
      </div>
      ${this.dialogError
        ? html`<p class="dialog-error">${this.dialogError}</p>`
        : nothing}
      <div class="dialog-actions">
        <button type="button" @click=${() => this.#closeDialog()}>
          ${this.#t("doCancel")}
        </button>
        <button
          type="button"
          class="primary"
          ?disabled=${this.dialogBusy}
          @click=${() => this.#submitShare()}
        >
          ${this.#t("share")}
        </button>
      </div>
    `;
  }

  #renderEditDialog(resource, permissions) {
    const available = this.#resourceScopeNames(resource);
    const list = permissions ?? [];
    return html`
      <h2>${this.#t("myPermissions")}</h2>
      <p>${resource.displayName || resource.name || ""}</p>
      ${list.length
        ? html`
            <ul class="shared-with">
              ${list.map((permission) => {
                const username = permission.username;
                const selected = this.editScopesByUser[username] ?? [];
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
                              ?disabled=${this.dialogBusy}
                              @change=${(e) =>
                                this.#toggleEditScope(
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
        : html`<p>${this.#t("resourceIsNotBeingShared")}</p>`}
      ${this.dialogError
        ? html`<p class="dialog-error">${this.dialogError}</p>`
        : nothing}
      <div class="dialog-actions">
        <button type="button" @click=${() => this.#closeDialog()}>
          ${this.#t("doCancel")}
        </button>
        <button
          type="button"
          class="primary"
          ?disabled=${this.dialogBusy || !list.length}
          @click=${() => this.#submitEdit()}
        >
          ${this.#t("doSave")}
        </button>
      </div>
    `;
  }

  #renderRequestsDialog(resource) {
    const requests = resource.shareRequests ?? [];
    return html`
      <h2>${this.#t("permissionRequests")}</h2>
      <p>${resource.displayName || resource.name || ""}</p>
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
                        ?disabled=${this.dialogBusy}
                        @click=${() => this.#approveDeny(request, true)}
                      >
                        ${this.#t("approve")}
                      </button>
                      <button
                        type="button"
                        class="danger"
                        ?disabled=${this.dialogBusy}
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
        : html`<p>${this.#t("resourceNoPermissionsGrantingAccess")}</p>`}
      ${this.dialogError
        ? html`<p class="dialog-error">${this.dialogError}</p>`
        : nothing}
      <div class="dialog-actions">
        <button type="button" @click=${() => this.#closeDialog()}>
          ${this.#t("doCancel")}
        </button>
      </div>
    `;
  }

  #renderDialog() {
    if (!this.dialog) {
      return nothing;
    }
    const { kind, resource, permissions } = this.dialog;
    return html`
      <dialog
        part="dialog"
        @cancel=${this.#onDialogCancel}
        @close=${() => {
          if (this.dialog) {
            this.#closeDialog();
          }
        }}
      >
        <div class="dialog-body">
          ${kind === "share"
            ? this.#renderShareDialog(resource, permissions)
            : kind === "edit"
              ? this.#renderEditDialog(resource, permissions)
              : this.#renderRequestsDialog(resource)}
        </div>
      </dialog>
    `;
  }

  render() {
    if (this.status === "loading" && !this.resources) {
      return renderLoading("Loading resources…");
    }

    if (this.status === "error" && !this.resources) {
      return renderLoadError(this.message);
    }

    const resources = this.resources ?? [];
    const owned = this.tab === "mine";
    const thirdHeader = owned
      ? this.#t("permissionRequests")
      : this.#t("permission");

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("resources")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("resourceIntroMessage")}
        </p>
      </slot>
      <div class="tabs" part="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected=${this.tab === "mine" ? "true" : "false"}
          @click=${() => this.#selectTab("mine")}
        >
          ${this.#t("myResources")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected=${this.tab === "shared" ? "true" : "false"}
          @click=${() => this.#selectTab("shared")}
        >
          ${this.#t("sharedWithMe")}
        </button>
      </div>
      ${resources.length
        ? html`
            <ul class="list" part="list">
              <li class="header" aria-hidden="true">
                <span>${this.#t("resourceName")}</span>
                <span>${this.#t("application")}</span>
                <span>${thirdHeader}</span>
                <span>${owned ? this.#t("action") : ""}</span>
              </li>
              ${resources.map((resource) => this.#renderResource(resource))}
            </ul>
          `
        : html`<p class="empty" part="empty">
            ${owned
              ? this.#t("notHaveAnyResource")
              : this.#t("noResourcesSharedWithYou")}
          </p>`}
      ${renderMessage(this.message, this.messageTone || undefined)}
      ${this.#renderDialog()}
    `;
  }
}

customElements.define("account-resources", Resources);

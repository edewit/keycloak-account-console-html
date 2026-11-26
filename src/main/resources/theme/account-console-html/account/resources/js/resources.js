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
import "./resource-edit-dialog.js";
import "./resource-requests-dialog.js";
import "./resource-share-dialog.js";
import { resourceId, scopeLabel } from "./resource-utils.js";

/**
 * Resources / UMA page (mirrors account-ui Resources).
 *
 * Tabs: my resources (`GET /resources`) and shared with me
 * (`GET /resources/shared-with-me`). Owned rows support share / edit /
 * unshare and approve/deny via dedicated dialog components.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, `error`, cancelable `share` /
 * `unshare` / `update-permissions` / `approve-request` / `deny-request`,
 * then `shared` / `unshared` / `permissions-updated`.
 *
 * Style via `--account-resources-*` or
 * ::part(title|description|tabs|list|item|actions|message|empty|badge).
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
    /** @type {"" | "share" | "edit" | "requests"} */
    dialogKind: { state: true },
    /** @type {any | null} */
    dialogResource: { state: true },
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
      .actions button {
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
    this.dialogKind = "";
    this.dialogResource = null;
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
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

  #closeDialog() {
    this.dialogKind = "";
    this.dialogResource = null;
  }

  /**
   * @param {any} resource
   * @param {"share" | "edit" | "requests"} kind
   */
  #openDialog(resource, kind) {
    this.dialogResource = resource;
    this.dialogKind = kind;
  }

  /**
   * @param {CustomEvent} event
   */
  #onDialogSuccess(event) {
    const messageKey =
      event.type === "permissions-updated" ? "updateSuccess" : "shareSuccess";
    this.messageTone = "success";
    this.message = this.#t(messageKey);
    this.#closeDialog();
    this.#load();
  }

  /**
   * @param {CustomEvent} event
   */
  #onDialogError(event) {
    const detail = event.detail ?? {};
    this.messageTone = "error";
    this.message = detail.message || String(detail.error ?? "Error");
  }

  /**
   * @param {any} resource
   */
  async #unshareAll(resource) {
    if (!confirm(this.#t("unShareAllConfirm"))) {
      return;
    }
    if (!emitEvent(this, "unshare", { resource }, { cancelable: true })) {
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
      <account-resource-share-dialog
        .resource=${this.dialogResource}
        .open=${this.dialogKind === "share"}
        @close=${() => this.#closeDialog()}
        @shared=${this.#onDialogSuccess}
        @error=${this.#onDialogError}
      ></account-resource-share-dialog>
      <account-resource-edit-dialog
        .resource=${this.dialogResource}
        .open=${this.dialogKind === "edit"}
        @close=${() => this.#closeDialog()}
        @permissions-updated=${this.#onDialogSuccess}
        @error=${this.#onDialogError}
      ></account-resource-edit-dialog>
      <account-resource-requests-dialog
        .resource=${this.dialogResource}
        .open=${this.dialogKind === "requests"}
        @close=${() => this.#closeDialog()}
        @shared=${this.#onDialogSuccess}
        @permissions-updated=${this.#onDialogSuccess}
        @error=${this.#onDialogError}
      ></account-resource-requests-dialog>
    `;
  }
}

customElements.define("account-resources", Resources);

import { LitElement, html, css } from "lit";
import { getPermissionRequests, getResources } from "./api.js";
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
 * Resources / UMA page (mirrors account-ui Resources).
 *
 * Tabs: my resources (`GET /resources`) and shared with me
 * (`GET /resources/shared-with-me`). Owned rows also load pending
 * permission requests.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, `error`.
 *
 * Style via `--account-resources-*` or
 * ::part(title|description|tabs|list|item|message|empty|badge).
 */
export class Resources extends LitElement {
  static properties = {
    /** @type {"mine" | "shared"} */
    tab: { state: true },
    /** @type {any[] | undefined} */
    resources: { state: true },
    status: { state: true },
    message: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
      :host {
        --account-gap: 1.25rem;
        --account-message-margin: var(--account-gap);
        --account-resources-max-width: var(--account-max-width, 42rem);
        --account-resources-muted-color: var(--account-muted-color, currentColor);
        --account-resources-border: var(--account-border-color, currentColor);
        --account-resources-radius: var(--account-radius, 0.5rem);
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

      .tabs button {
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
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
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

      .empty {
        margin: 0;
        padding: 0.85rem 1rem;
        color: var(--account-resources-muted-color);
      }

      @media (max-width: 36rem) {
        .header {
          display: none;
        }

        .item {
          grid-template-columns: 1fr;
          gap: 0.35rem;
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
   */
  #renderResource(resource) {
    const id = resourceId(resource);
    const client = resource.client ?? {};
    const clientLabel = this.#clientLabel(resource);
    const scopes = Array.isArray(resource.scopes) ? resource.scopes : [];
    const requests = Array.isArray(resource.shareRequests)
      ? resource.shareRequests
      : [];

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
          ${this.tab === "shared"
            ? scopes.length
              ? html`
                  <ul class="scopes">
                    ${scopes.map(
                      (scope) =>
                        html`<li>
                          ${scope.displayName || scope.name || ""}
                        </li>`,
                    )}
                  </ul>
                `
              : "—"
            : requests.length
              ? html`<span class="badge" part="badge"
                  >${this.#t("permissionRequests")}: ${requests.length}</span
                >`
              : "—"}
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
    const thirdHeader =
      this.tab === "shared" ? this.#t("permission") : this.#t("permissionRequests");

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
              </li>
              ${resources.map((resource) => this.#renderResource(resource))}
            </ul>
          `
        : html`<p class="empty" part="empty">
            ${this.tab === "shared"
              ? this.#t("noResourcesSharedWithYou")
              : this.#t("notHaveAnyResource")}
          </p>`}
      ${renderMessage(this.message, "error")}
    `;
  }
}

customElements.define("account-resources", Resources);

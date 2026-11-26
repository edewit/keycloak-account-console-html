import { LitElement, html, css, nothing } from "lit";
import {
  getKeycloak,
  getLinkedAccounts,
  unlinkAccount,
} from "./api.js";
import { consumeMessages } from "./i18n.js";
import {
  emitEvent,
  label,
  pageChromeStyles,
  renderLoadError,
  renderLoading,
  renderMessage,
} from "./page.js";

/**
 * Linked accounts page (mirrors account-ui LinkedAccounts).
 *
 * Loads `/linked-accounts?linked=true|false`, links via keycloak-js
 * `login({ action: "idp_link:<alias>" })`, unlinks via DELETE.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, cancelable `link` / `unlink`, `unlinked`, `error`.
 *
 * Style via `--account-linked-*` or
 * ::part(title|description|section|list|item|actions|message|empty|badge).
 */
export class LinkedAccounts extends LitElement {
  static properties = {
    /** @type {any[] | undefined} */
    linked: { state: true },
    /** @type {any[] | undefined} */
    available: { state: true },
    status: { state: true },
    message: { state: true },
    /** @type {"" | "error" | "success"} */
    messageTone: { state: true },
  };

  static styles = [
    pageChromeStyles,
    css`
      :host {
        --account-gap: 1.25rem;
        --account-message-margin: var(--account-gap);
        --account-linked-max-width: var(--account-max-width, 42rem);
        --account-linked-muted-color: var(--account-muted-color, currentColor);
        --account-linked-border: var(--account-border-color, currentColor);
        --account-linked-radius: var(--account-radius, 0.5rem);
        --account-linked-error-color: var(--account-error-color, #b42318);
        --account-linked-button-padding: var(
          --account-button-padding,
          0.5rem 1rem
        );

        display: block;
        width: 100%;
        max-width: var(--account-linked-max-width);
      }

      h2 {
        margin: 1.5rem 0 0.75rem;
        font-size: 1.15rem;
      }

      .list {
        list-style: none;
        margin: 0 0 1.25rem;
        padding: 0;
        border: 1px solid var(--account-linked-border);
        border-radius: var(--account-linked-radius);
      }

      .item {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.25rem;
        align-items: center;
        justify-content: space-between;
        padding: 0.85rem 1rem;
        border-top: 1px solid var(--account-linked-border);
      }

      .item:first-child {
        border-top: none;
      }

      .item-main {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
        flex: 1 1 12rem;
      }

      .item-title {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
        align-items: center;
        font-weight: 600;
      }

      .item-meta {
        color: var(--account-linked-muted-color);
        font-size: 0.9rem;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        border: 1px solid var(--account-linked-border);
        font-size: 0.75rem;
        font-weight: 600;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }

      button {
        font: inherit;
        cursor: pointer;
        border: 1px solid var(--account-linked-border);
        border-radius: var(--account-linked-radius);
        padding: var(--account-linked-button-padding);
        background: transparent;
        color: inherit;
      }

      button.danger {
        border-color: var(--account-linked-error-color);
        color: var(--account-linked-error-color);
      }

      .empty {
        margin: 0 0 1.25rem;
        padding: 0.85rem 1rem;
        color: var(--account-linked-muted-color);
        border: 1px dashed var(--account-linked-border);
        border-radius: var(--account-linked-radius);
      }
    `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    try {
      const [linked, available] = await Promise.all([
        getLinkedAccounts({ linked: true, first: 0, max: 100 }),
        getLinkedAccounts({ linked: false, first: 0, max: 100 }),
      ]);
      this.linked = linked;
      this.available = available;
      this.status = "ready";
      emitEvent(this, "load", { linked, available });
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  /**
   * @param {any} account
   */
  #displayName(account) {
    return (
      label(this.#t, account.displayName) ||
      account.providerName ||
      account.providerAlias ||
      ""
    );
  }

  /**
   * IdP path key used by Account REST DELETE (account-ui uses `providerName`).
   * @param {any} account
   */
  #alias(account) {
    return account.providerName || account.providerAlias || "";
  }

  /**
   * @param {any} account
   */
  async #link(account) {
    const alias = this.#alias(account);
    if (
      !emitEvent(
        this,
        "link",
        { account, providerAlias: alias },
        { cancelable: true },
      )
    ) {
      return;
    }
    try {
      const keycloak = await getKeycloak();
      await keycloak.login({ action: `idp_link:${alias}` });
    } catch (error) {
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "link", error, message: this.message });
    }
  }

  /**
   * @param {any} account
   */
  async #unlink(account) {
    const alias = this.#alias(account);
    const name = this.#displayName(account);
    if (!confirm(this.#t("unLink") + `: ${name}?`)) {
      return;
    }
    if (
      !emitEvent(
        this,
        "unlink",
        { account, providerAlias: alias },
        { cancelable: true },
      )
    ) {
      return;
    }
    try {
      this.status = "saving";
      await unlinkAccount(alias);
      this.messageTone = "success";
      this.message = this.#t("unLinkSuccess");
      emitEvent(this, "unlinked", { account, providerAlias: alias });
      await this.#load();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", {
        phase: "unlink",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} account
   * @param {boolean} isLinked
   */
  #renderItem(account, isLinked) {
    const alias = this.#alias(account);
    return html`
      <li class="item" part="item" data-provider=${alias}>
        <div class="item-main">
          <div class="item-title">
            <span>${this.#displayName(account)}</span>
            <span class="badge" part="badge">
              ${this.#t(account.social ? "socialLogin" : "systemDefined")}
            </span>
          </div>
          ${isLinked && account.linkedUsername
            ? html`<div class="item-meta">${account.linkedUsername}</div>`
            : nothing}
        </div>
        <div class="actions" part="actions">
          ${isLinked
            ? html`
                <button
                  class="danger"
                  type="button"
                  ?disabled=${this.status === "saving"}
                  @click=${() => this.#unlink(account)}
                >
                  ${this.#t("unLink")}
                </button>
              `
            : html`
                <button
                  type="button"
                  ?disabled=${this.status === "saving"}
                  @click=${() => this.#link(account)}
                >
                  ${this.#t("link")}
                </button>
              `}
        </div>
      </li>
    `;
  }

  /**
   * @param {string} titleKey
   * @param {any[] | undefined} accounts
   * @param {boolean} isLinked
   */
  #renderSection(titleKey, accounts, isLinked) {
    const list = accounts ?? [];
    return html`
      <section part="section" data-linked=${isLinked ? "true" : "false"}>
        <h2>${this.#t(titleKey)}</h2>
        ${list.length
          ? html`
              <ul class="list" part="list">
                ${list.map((account) => this.#renderItem(account, isLinked))}
              </ul>
            `
          : html`<p class="empty" part="empty">${this.#t(titleKey)}</p>`}
      </section>
    `;
  }

  render() {
    if (this.status === "loading" && !this.linked && !this.available) {
      return renderLoading("Loading linked accounts…");
    }

    if (this.status === "error" && !this.linked && !this.available) {
      return renderLoadError(this.message);
    }

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("linkedAccounts")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("linkedAccountsIntroMessage")}
        </p>
      </slot>
      ${this.#renderSection("linkedLoginProviders", this.linked, true)}
      ${this.#renderSection("unlinkedLoginProviders", this.available, false)}
      ${renderMessage(this, this.message, this.messageTone)}
    `;
  }
}

customElements.define("account-linked-accounts", LinkedAccounts);

import { LitElement, html, css, nothing } from "lit";
import {
  deleteApplicationSessions,
  deleteConsent,
  getApplications,
  getEnvironment,
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
import "./components/button.js";

/**
 * @param {number} epochMs
 * @param {string} locale
 */
function formatDate(epochMs, locale) {
  return new Date(epochMs).toLocaleString(locale || "en", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * Applications page (mirrors account-ui Applications).
 *
 * Loads `/applications`, lists clients with expand/collapse details, and
 * supports ending sessions or removing consent.
 *
 * Overridable slots: `title`, `description`.
 * Events (bubbles, composed): `load`, cancelable `remove-consent` /
 * `end-session`, `removed`, `error`.
 *
 * Style via `--account-apps-*` or
 * ::part(title|description|list|item|details|actions|message|empty).
 */
export class Applications extends LitElement {
  static properties = {
    /** @type {any[] | undefined} */
    applications: { state: true },
    /** @type {Set<string>} */
    openIds: { state: true },
    /** @type {string} */
    accountClientId: { state: true },
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
      --account-apps-max-width: var(--account-max-width, 42rem);
      --account-apps-muted-color: var(--account-muted-color, currentColor);
      --account-apps-border: var(--account-border-color, currentColor);
      --account-apps-radius: var(--account-radius, 0.5rem);
      --account-apps-error-color: var(--account-error-color, #b42318);
      --account-apps-button-padding: var(
        --account-button-padding,
        0.5rem 1rem
      );

      display: block;
      width: 100%;
      max-width: var(--account-apps-max-width);
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--account-apps-border);
      border-radius: var(--account-apps-radius);
    }

    .item {
      border-top: 1px solid var(--account-apps-border);
    }

    .item:first-child {
      border-top: none;
    }

    .item-header {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      align-items: flex-start;
      justify-content: space-between;
      padding: 1rem 1.1rem;
    }

    .item-main {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 0;
      flex: 1 1 14rem;
    }

    .item-title {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
      align-items: center;
      font-weight: 600;
    }

    .item-title a {
      color: inherit;
    }

    .item-meta {
      color: var(--account-apps-muted-color);
      font-size: 0.9rem;
    }

    .toggle {
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--account-apps-border);
      border-radius: var(--account-apps-radius);
      padding: 0.25rem 0.55rem;
      background: transparent;
      color: inherit;
      line-height: 1;
    }

    .details {
      padding: 0 1.1rem 1rem;
      border-top: 1px dashed var(--account-apps-border);
    }

    .details dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.35rem 1rem;
      margin: 0.85rem 0 0;
      font-size: 0.9rem;
    }

    .details dt {
      color: var(--account-apps-muted-color);
      font-weight: 600;
    }

    .details dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .scopes {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .empty {
      margin: 0;
      padding: 0.85rem 1rem;
      color: var(--account-apps-muted-color);
    }

    .info {
      margin: 0.75rem 0 0;
      font-size: 0.85rem;
      color: var(--account-apps-muted-color);
    }
  `,
  ];

  #i18n = consumeMessages(this);

  constructor() {
    super();
    this.openIds = new Set();
    this.accountClientId = "";
    this.status = "loading";
    this.message = "";
    this.messageTone = "";
  }

  /** @returns {(key: string, params?: Record<string, string | number>) => string} */
  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  get #locale() {
    return this.#i18n.value?.locale || "en";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  async #load() {
    this.status = "loading";
    try {
      const [apps, env] = await Promise.all([
        getApplications(),
        getEnvironment(),
      ]);
      this.accountClientId = env.clientId ?? "";
      this.applications = [...apps].sort((a, b) =>
        (a.clientName || a.clientId || "").localeCompare(
          b.clientName || b.clientId || "",
          this.#locale,
        ),
      );
      this.status = "ready";
      emitEvent(this, "load", this.applications);
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  /**
   * @param {any} app
   */
  #displayName(app) {
    return label(this.#t, app.clientName || app.clientId);
  }

  /**
   * @param {any} app
   */
  #typeLabel(app) {
    const type = app.userConsentRequired
      ? this.#t("thirdPartyApp")
      : this.#t("internalApp");
    return app.offlineAccess ? `${type}, ${this.#t("offlineAccess")}` : type;
  }

  /**
   * @param {any} app
   */
  #statusLabel(app) {
    return app.inUse || app.offlineAccess
      ? this.#t("inUse")
      : this.#t("notInUse");
  }

  /**
   * @param {string} clientId
   */
  #toggle(clientId) {
    const next = new Set(this.openIds);
    if (next.has(clientId)) {
      next.delete(clientId);
    } else {
      next.add(clientId);
    }
    this.openIds = next;
  }

  /**
   * @param {any} app
   */
  async #endSession(app) {
    const name = this.#displayName(app);
    if (
      !confirm(
        this.#t("endApplicationSessionMessage", { name }),
      )
    ) {
      return;
    }
    if (
      !emitEvent(this, 
        "end-session",
        { application: app },
        { cancelable: true },
      )
    ) {
      return;
    }
    try {
      this.status = "saving";
      await deleteApplicationSessions(app.clientId);
      this.messageTone = "success";
      this.message = this.#t("endApplicationSessionSuccess", { name });
      emitEvent(this, "removed", { kind: "session", application: app });
      await this.#load();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = this.#t("endApplicationSessionError", {
        error: error instanceof Error ? error.message : String(error),
      });
      emitEvent(this, "error", {
        phase: "end-session",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} app
   */
  async #removeConsent(app) {
    if (
      !confirm(
        this.#t("removeModalMessage", { name: app.clientId }),
      )
    ) {
      return;
    }
    if (
      !emitEvent(this, 
        "remove-consent",
        { application: app },
        { cancelable: true },
      )
    ) {
      return;
    }
    try {
      this.status = "saving";
      await deleteConsent(app.clientId);
      this.messageTone = "success";
      this.message = this.#t("removeConsentSuccess");
      emitEvent(this, "removed", { kind: "consent", application: app });
      await this.#load();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = this.#t("removeConsentError", {
        error: error instanceof Error ? error.message : String(error),
      });
      emitEvent(this, "error", {
        phase: "remove-consent",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} scope
   */
  #scopeLabel(scope) {
    if (scope.displayText) {
      return label(this.#t, scope.displayText);
    }
    return this.#t(scope.name) || scope.name || "";
  }

  /**
   * @param {any} app
   */
  #renderDetails(app) {
    const consent = app.consent;
    return html`
      <div class="details" part="details">
        <dl>
          <dt>${this.#t("client")}</dt>
          <dd>${app.clientId ?? ""}</dd>
          ${app.description
            ? html`
                <dt>${this.#t("description")}</dt>
                <dd>${label(this.#t, app.description)}</dd>
              `
            : nothing}
          ${app.effectiveUrl
            ? html`
                <dt>URL</dt>
                <dd>
                  <a href=${app.effectiveUrl} rel="noopener noreferrer"
                    >${app.effectiveUrl}</a
                  >
                </dd>
              `
            : nothing}
          ${consent?.grantedScopes?.length
            ? html`
                <dt>${this.#t("hasAccessTo")}</dt>
                <dd>
                  <ul class="scopes">
                    ${consent.grantedScopes.map(
                      (scope) => html`<li>${this.#scopeLabel(scope)}</li>`,
                    )}
                  </ul>
                </dd>
              `
            : nothing}
          ${app.tosUri
            ? html`
                <dt>${this.#t("termsOfService")}</dt>
                <dd>
                  <a href=${app.tosUri} rel="noopener noreferrer"
                    >${app.tosUri}</a
                  >
                </dd>
              `
            : nothing}
          ${app.policyUri
            ? html`
                <dt>${this.#t("privacyPolicy")}</dt>
                <dd>
                  <a href=${app.policyUri} rel="noopener noreferrer"
                    >${app.policyUri}</a
                  >
                </dd>
              `
            : nothing}
          ${app.logoUri
            ? html`
                <dt>${this.#t("logo")}</dt>
                <dd>
                  <img src=${app.logoUri} alt="" height="32" />
                </dd>
              `
            : nothing}
          ${consent?.createdDate != null
            ? html`
                <dt>${this.#t("accessGrantedOn")}</dt>
                <dd>${formatDate(consent.createdDate, this.#locale)}</dd>
              `
            : nothing}
        </dl>
        ${consent || app.offlineAccess
          ? html`
              <div class="actions" part="actions">
                <account-button
                  variant="danger"
                  ?disabled=${this.status === "saving"}
                  @click=${() => this.#removeConsent(app)}
                >
                  ${this.#t("removeAccess")}
                </account-button>
              </div>
              <p class="info">${this.#t("infoMessage")}</p>
            `
          : nothing}
      </div>
    `;
  }

  /**
   * @param {any} app
   */
  #renderApp(app) {
    const open = this.openIds.has(app.clientId);
    const name = this.#displayName(app);
    const canEndSession =
      (app.inUse || app.offlineAccess) &&
      app.clientId !== this.accountClientId;

    return html`
      <li class="item" part="item" data-client-id=${app.clientId ?? ""}>
        <div class="item-header">
          <div class="item-main">
            <div class="item-title">
              <button
                class="toggle"
                type="button"
                aria-expanded=${open ? "true" : "false"}
                @click=${() => this.#toggle(app.clientId)}
              >
                ${open ? "▾" : "▸"}
              </button>
              ${app.effectiveUrl
                ? html`<a
                    href=${app.effectiveUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    >${name}</a
                  >`
                : html`<span>${name}</span>`}
            </div>
            <div class="item-meta">${this.#typeLabel(app)}</div>
            <div class="item-meta">${this.#statusLabel(app)}</div>
          </div>
          ${canEndSession
            ? html`
                <div class="actions" part="actions">
                  <account-button
                    variant="danger"
                    ?disabled=${this.status === "saving"}
                    @click=${() => this.#endSession(app)}
                  >
                    ${this.#t("endApplicationSession")}
                  </account-button>
                </div>
              `
            : nothing}
        </div>
        ${open ? this.#renderDetails(app) : nothing}
      </li>
    `;
  }

  render() {
    if (this.status === "loading" && !this.applications) {
      return renderLoading("Loading applications…");
    }

    if (this.status === "error" && !this.applications) {
      return renderLoadError(this.message);
    }

    const apps = this.applications ?? [];

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("applications")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("applicationsIntroMessage")}
        </p>
      </slot>
      ${apps.length
        ? html`
            <ul class="list" part="list">
              ${apps.map((app) => this.#renderApp(app))}
            </ul>
          `
        : html`<p class="empty" part="empty">${this.#t("applications")}</p>`}
      ${renderMessage(this, this.message, this.messageTone)}
    `;
  }
}

customElements.define("account-applications", Applications);

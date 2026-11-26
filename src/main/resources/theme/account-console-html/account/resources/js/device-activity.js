import { LitElement, html, css, nothing } from "lit";
import { deleteSession, getDevices, getKeycloak } from "./api.js";
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
 * @param {number} epochSeconds
 * @param {string} locale
 */
function formatDate(epochSeconds, locale) {
  return new Date(epochSeconds * 1000).toLocaleString(locale || "en", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * Device activity page (mirrors account-ui DeviceActivity).
 *
 * Loads `/sessions/devices`, lists sessions with current first, and supports
 * signing out one session or all devices.
 *
 * Overridable slots: `title`, `description`, `actions`.
 * Events (bubbles, composed): `load`, cancelable `sign-out`, `signed-out`, `error`.
 *
 * Style via `--account-device-*` or
 * ::part(title|description|toolbar|list|item|details|actions|message|empty|badge).
 */
export class DeviceActivity extends LitElement {
  static properties = {
    /** @type {any[] | undefined} */
    devices: { state: true },
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
      --account-device-max-width: var(--account-max-width, 42rem);
      --account-device-muted-color: var(--account-muted-color, currentColor);
      --account-device-border: var(--account-border-color, currentColor);
      --account-device-radius: var(--account-radius, 0.5rem);
      --account-device-error-color: var(--account-error-color, #b42318);
      --account-device-button-padding: var(
        --account-button-padding,
        0.5rem 1rem
      );
      --account-device-button-bg: var(
        --account-button-bg,
        light-dark(#1b1b1b, #f0f0f0)
      );
      --account-device-button-fg: var(
        --account-button-fg,
        light-dark(#fff, #1b1b1b)
      );

      display: block;
      width: 100%;
      max-width: var(--account-device-max-width);
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin: 0 0 var(--account-gap);
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--account-device-border);
      border-radius: var(--account-device-radius);
    }

    .item {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 1rem 1.1rem;
      border-top: 1px solid var(--account-device-border);
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

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      border: 1px solid var(--account-device-border);
      font-size: 0.75rem;
      font-weight: 600;
    }

    .details {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.35rem 1rem;
      margin: 0;
      font-size: 0.9rem;
    }

    .details dt {
      color: var(--account-device-muted-color);
      font-weight: 600;
    }

    .details dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
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
      border: 1px solid var(--account-device-border);
      border-radius: var(--account-device-radius);
      padding: var(--account-device-button-padding);
      background: transparent;
      color: inherit;
    }

    button.primary {
      border-color: transparent;
      background: var(--account-device-button-bg);
      color: var(--account-device-button-fg);
    }

    button.danger {
      border-color: var(--account-device-error-color);
      color: var(--account-device-error-color);
    }

    .empty {
      margin: 0;
      padding: 0.85rem 1rem;
      color: var(--account-device-muted-color);
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

  get #locale() {
    return this.#i18n.value?.locale || "en";
  }

  connectedCallback() {
    super.connectedCallback();
    this.#load();
  }

  /**
   * Put the current device/session first (same order as account-ui).
   * @param {any[]} devices
   */
  #orderCurrentFirst(devices) {
    const list = structuredClone(devices);
    const deviceIndex = list.findIndex((device) => device.current);
    if (deviceIndex > 0) {
      const [currentDevice] = list.splice(deviceIndex, 1);
      list.unshift(currentDevice);
    }
    const currentDevice = list.find((device) => device.current) ?? list[0];
    if (currentDevice?.sessions?.length) {
      const sessionIndex = currentDevice.sessions.findIndex(
        (session) => session.current,
      );
      if (sessionIndex > 0) {
        const [currentSession] = currentDevice.sessions.splice(sessionIndex, 1);
        currentDevice.sessions.unshift(currentSession);
      }
    }
    return list;
  }

  async #load() {
    this.status = "loading";
    try {
      const devices = await getDevices();
      this.devices = this.#orderCurrentFirst(devices);
      this.status = "ready";
      emitEvent(this, "load", this.devices);
    } catch (error) {
      this.status = "error";
      this.messageTone = "error";
      this.message = error instanceof Error ? error.message : String(error);
      emitEvent(this, "error", { phase: "load", error, message: this.message });
    }
  }

  /** @returns {{ device: any, session: any }[]} */
  get #rows() {
    /** @type {{ device: any, session: any }[]} */
    const rows = [];
    for (const device of this.devices ?? []) {
      for (const session of device.sessions ?? []) {
        rows.push({ device, session });
      }
    }
    return rows;
  }

  get #hasMultipleSessions() {
    const devices = this.devices ?? [];
    return devices.length > 1 || (devices[0]?.sessions?.length ?? 0) > 1;
  }

  /**
   * @param {any[]} clients
   */
  #clientsLabel(clients) {
    return (clients ?? [])
      .map((client) => {
        if (client.clientName) {
          return label(this.#t, client.clientName);
        }
        return client.clientId ?? "";
      })
      .filter(Boolean)
      .join(", ");
  }

  /**
   * @param {any} device
   */
  #osLabel(device) {
    const os = String(device.os ?? "");
    if (os.toLowerCase().includes("unknown")) {
      return this.#t("unknownOperatingSystem");
    }
    const version = String(device.osVersion ?? "");
    if (!version || version.toLowerCase().includes("unknown")) {
      return os;
    }
    return `${os} ${version}`;
  }

  async #refresh() {
    this.message = "";
    this.messageTone = "";
    await this.#load();
  }

  async #signOutAll() {
    if (!confirm(this.#t("signOutAllDevicesWarning"))) {
      return;
    }
    if (
      !emitEvent(this, 
        "sign-out",
        { kind: "all" },
        { cancelable: true },
      )
    ) {
      return;
    }
    try {
      this.status = "saving";
      await deleteSession();
      emitEvent(this, "signed-out", { kind: "all" });
      const keycloak = await getKeycloak();
      await keycloak.logout();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = this.#t("errorSignOutMessage", {
        error: error instanceof Error ? error.message : String(error),
      });
      emitEvent(this, "error", {
        phase: "sign-out",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {any} session
   * @param {any} device
   */
  async #signOutSession(session, device) {
    if (!confirm(this.#t("signOutWarning"))) {
      return;
    }
    if (
      !emitEvent(this, 
        "sign-out",
        { kind: "session", session, device },
        { cancelable: true },
      )
    ) {
      return;
    }
    try {
      this.status = "saving";
      await deleteSession(session.id);
      this.messageTone = "success";
      this.message = this.#t("signedOutSession", {
        browser: session.browser ?? "",
        os: device.os ?? "",
      });
      emitEvent(this, "signed-out", { kind: "session", session, device });
      await this.#load();
    } catch (error) {
      this.status = "ready";
      this.messageTone = "error";
      this.message = this.#t("errorSignOutMessage", {
        error: error instanceof Error ? error.message : String(error),
      });
      emitEvent(this, "error", {
        phase: "sign-out",
        error,
        message: this.message,
      });
    }
  }

  /**
   * @param {{ device: any, session: any }} row
   */
  #renderRow({ device, session }) {
    const title = `${this.#osLabel(device)} / ${session.browser ?? ""}`;
    return html`
      <li
        class="item"
        part="item"
        data-session-id=${session.id ?? ""}
        data-current=${session.current ? "true" : "false"}
      >
        <div class="item-header">
          <div class="item-main">
            <div class="item-title" data-mobile=${device.mobile ? "true" : "false"}>
              <span>${title}</span>
              ${session.current
                ? html`<span class="badge" part="badge"
                    >${this.#t("currentSession")}</span
                  >`
                : nothing}
            </div>
          </div>
          ${!session.current
            ? html`
                <div class="actions" part="actions">
                  <button
                    class="danger"
                    type="button"
                    ?disabled=${this.status === "saving"}
                    @click=${() => this.#signOutSession(session, device)}
                  >
                    ${this.#t("signOut")}
                  </button>
                </div>
              `
            : nothing}
        </div>
        <dl class="details" part="details">
          <dt>${this.#t("ipAddress")}</dt>
          <dd>${session.ipAddress ?? ""}</dd>
          <dt>${this.#t("lastAccessedOn")}</dt>
          <dd>${formatDate(session.lastAccess, this.#locale)}</dd>
          <dt>${this.#t("clients")}</dt>
          <dd>${this.#clientsLabel(session.clients)}</dd>
          <dt>${this.#t("started")}</dt>
          <dd>${formatDate(session.started, this.#locale)}</dd>
          <dt>${this.#t("expires")}</dt>
          <dd>${formatDate(session.expires, this.#locale)}</dd>
        </dl>
      </li>
    `;
  }

  render() {
    if (this.status === "loading" && !this.devices) {
      return renderLoading("Loading devices…");
    }

    if (this.status === "error" && !this.devices) {
      return renderLoadError(this.message);
    }

    const rows = this.#rows;

    return html`
      <slot name="title">
        <h1 part="title">${this.#t("signedInDevices")}</h1>
      </slot>
      <slot name="description">
        <p part="description" class="description">
          ${this.#t("signedInDevicesExplanation")}
        </p>
      </slot>
      <slot name="actions">
        <div class="toolbar" part="toolbar">
          <button
            type="button"
            ?disabled=${this.status === "loading" || this.status === "saving"}
            @click=${() => this.#refresh()}
          >
            ${this.#t("refreshPage")}
          </button>
          ${this.#hasMultipleSessions
            ? html`
                <button
                  class="danger"
                  type="button"
                  ?disabled=${this.status === "saving"}
                  @click=${() => this.#signOutAll()}
                >
                  ${this.#t("signOutAllDevices")}
                </button>
              `
            : nothing}
        </div>
      </slot>
      ${rows.length
        ? html`
            <ul class="list" part="list">
              ${rows.map((row) => this.#renderRow(row))}
            </ul>
          `
        : html`<p class="empty" part="empty">${this.#t("signedInDevices")}</p>`}
      ${renderMessage(this, this.message, this.messageTone)}
    `;
  }
}

customElements.define("account-device-activity", DeviceActivity);

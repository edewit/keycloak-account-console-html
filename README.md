# Keycloak Account Console HTML

Account console theme where **every page is a simple HTML file**. Pages are served by a custom `AccountResourceProvider`; browser JavaScript calls the Account REST API (no React, no Qute).

Requires **Keycloak 26.8+**.

## What’s included

- Theme `account-console-html` (`account` type)
- Provider id `html-account` — serves `pages/*.html` from the theme; injects `<base href>` from `baseUrl`
- `GET …/account/environment.json` — bootstrap for keycloak-js / REST (includes `features` flags)
- Sidebar hides pages gated by feature flags / roles (same keys as Keycloak `content.json`)
- Theme messages via `GET /resources/{realm}/account/{locale}` (parent `keycloak.v3`)
- Shared design tokens (`resources/css/tokens.css`)
- Lit web components under `resources/js/`
  - `account-shell` — page chrome; loads messages and provides Lit context
  - `account-sidebar` — navigation
  - `account-personal-info` — profile form (user-profile metadata driven)
  - `account-signing-in` — credential types (password, OTP, passkeys, …)
  - `account-device-activity` — signed-in devices / sessions
  - `account-applications` — applications with consent / session controls
  - `account-groups` — group memberships (optional direct-only filter)
  - `account-field`, `account-input`, `account-save-button` — form primitives

## Local development (live HTML)

Edit HTML under the theme directory and refresh the browser — no Maven rebuild for page changes.

```bash
npm install
npm run start-keycloak
```

Then open `http://127.0.0.1:8080/realms/master/account/` (admin `admin` / `admin`).

`start-keycloak`:

- Builds the provider JAR once if missing (`mvn package`)
- Symlinks `src/main/resources/theme/account-console-html` into Keycloak’s `themes/` so filesystem edits are live
- Disables theme caching
- Sets the master realm **Account theme** to `account-console-html`

When you change Java under `org.keycloak.account.html`, rebuild and restart:

```bash
npm run build
# stop Keycloak, then:
npm run start-keycloak
```

## Production build & deploy

```bash
mvn clean package
cp target/keycloak-account-console-html-*.jar $KEYCLOAK_HOME/providers/
$KEYCLOAK_HOME/bin/kc.sh build
```

In the Admin Console, set the realm **Account theme** to `account-console-html`.

## Adding a page

1. Add `src/main/resources/theme/account-console-html/account/pages/<name>.html`
2. Load tokens, the importmap, `components/shell.js`, and any page scripts
3. Compose with `<account-shell>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
    <link rel="stylesheet" href="resource/css/tokens.css" />
    <script type="importmap">
      {
        "imports": {
          "lit": "https://cdn.jsdelivr.net/npm/lit@3/+esm",
          "@lit/context": "https://cdn.jsdelivr.net/npm/@lit/context/+esm",
          "keycloak-js": "https://cdn.jsdelivr.net/npm/keycloak-js/+esm"
        }
      }
    </script>
    <script src="resource/js/components/shell.js" type="module"></script>
  </head>
  <body>
    <account-shell>
      <h1>My page</h1>
    </account-shell>
  </body>
</html>
```

4. With `start-keycloak` running, open `/realms/<realm>/account/<name>` (refresh only)
5. For a packaged deploy, rebuild the JAR as above

Authenticated reads/writes go through Account REST via `accountFetch` in `resources/js/account-client.js`.

## Extending components

### Slots (`account-personal-info`)

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |
| `attribute:<name>` | Replace a profile field (e.g. `attribute:department`) |
| `<attribute-name>` | Same as above (legacy; prefer the `attribute:` prefix) |
| `field` | Append extra named fields (include a `name` to save) |
| `actions` | Replace the save button row |

Override a single profile field from HTML. Use `slot="attribute:<name>"` so the override cannot clash with reserved slots (`title`, `description`, `actions`, `field`). Control `name` may be bare (`department`) or `attributes.department`:

```html
<account-shell>
  <account-personal-info>
    <div slot="attribute:department" class="field">
      <label for="dept">Department</label>
      <select name="attributes.department" id="dept">
        <option value="engineering">Engineering</option>
        <option value="product">Product</option>
      </select>
    </div>
  </account-personal-info>
</account-shell>
```

After load, slotted native controls with a `name` are hydrated from the user. Listen to the `load` event if you need the raw user object.

### Events (`account-personal-info`)

All bubble and are composed.

| Event | When | Notes |
|-------|------|--------|
| `load` | User profile loaded | `detail` is the user |
| `save` | Before POST | Cancelable; `detail` is `{ user, payload }` |
| `saved` | After successful save | `detail` is the refreshed user |
| `error` | Load or save failure | `detail` is `{ phase, error, message }` |

### i18n (Lit context)

`account-shell` fetches theme messages and provides them on `messagesContext`. Any descendant can consume:

```js
import { consumeMessages } from "./i18n.js";

class MyPage extends LitElement {
  #i18n = consumeMessages(this);

  get #t() {
    return this.#i18n.value?.t ?? ((key) => key);
  }

  render() {
    return html`<h1>${this.#t("personalInfo")}</h1>`;
  }
}
```

`t(key, params?)` interpolates `{{name}}` / `{0}` and strips account-ui Trans tags (`<0>…</0>`).

### Signing in (`account-signing-in`)

Loads `/credentials` and groups types by category (basic / two-factor / passwordless). Set up, update, and delete call `keycloak.login({ action })` so Keycloak runs the matching required action.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Credentials loaded | `detail` is the credential container list |
| `action` | Before create/update/delete redirect | Cancelable; `detail` is `{ action, kind, type?, credentialId? }` |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-signing-in></account-signing-in>
</account-shell>
```

### Device activity (`account-device-activity`)

Loads `/sessions/devices` (current device/session first). Refresh reloads the list; sign out calls `DELETE /sessions/{id}` (or all sessions, then keycloak-js logout).

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |
| `actions` | Toolbar (refresh / sign out all) |

| Event | When | Notes |
|-------|------|--------|
| `load` | Devices loaded | `detail` is the device list |
| `sign-out` | Before sign-out | Cancelable; `detail` is `{ kind: "session"|"all", … }` |
| `signed-out` | After a successful sign-out | Same `detail` shape |
| `error` | Load or sign-out failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-device-activity></account-device-activity>
</account-shell>
```

### Applications (`account-applications`)

Loads `/applications` (sorted by name). Expand a row for client details / scopes; end sessions via `DELETE /applications/{id}/sessions`, remove consent via `DELETE /applications/{id}/consent`.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |

| Event | When | Notes |
|-------|------|--------|
| `load` | Applications loaded | `detail` is the client list |
| `end-session` / `remove-consent` | Before the action | Cancelable; `detail` is `{ application }` |
| `removed` | After success | `detail` is `{ kind: "session"|"consent", application }` |
| `error` | Load or action failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-applications></account-applications>
</account-shell>
```

### Groups (`account-groups`)

Loads `/groups`. By default ancestor path groups are included; enable **Direct membership** to show only API groups.

| Slot | Purpose |
|------|---------|
| `title` | Page heading |
| `description` | Intro text |
| `toolbar` | Direct-membership filter |

| Event | When | Notes |
|-------|------|--------|
| `load` | Groups loaded | `detail` is the (possibly expanded) group list |
| `error` | Load failure | `detail` is `{ phase, error, message }` |

```html
<account-shell>
  <account-groups></account-groups>
</account-shell>
```

```html
<script type="module">
  const form = document.querySelector("account-personal-info");
  form.addEventListener("save", (event) => {
    // event.preventDefault(); // cancel the POST
    console.log(event.detail.payload);
  });
</script>
```

### Styling

Shared tokens live in `resource/css/tokens.css` (`--account-radius`, `--account-button-bg`, `--account-error-color`, …). Override on `:root` or `account-shell`.

Components also expose `::part(...)` hooks, for example:

- `account-shell::part(layout|nav|main)`
- `account-personal-info::part(form|field|actions|message)`
- `account-signing-in::part(title|description|category|type|list|item|actions|message|empty)`
- `account-device-activity::part(title|description|toolbar|list|item|details|actions|message|empty|badge)`
- `account-applications::part(title|description|list|item|details|actions|message|empty)`
- `account-groups::part(title|description|toolbar|list|item|message|empty)`
- `account-input::part(input)`
- `account-save-button::part(button)`

### Primitives

- `<account-input>` — form-associated; props: `name`, `type`, `value` / `.values`, `.options`, `required`, `readonly`, `disabled`, `placeholder`
- `<account-field>` — label + slotted control (+ optional `help` / `error`)
- `<account-save-button>` — `saving`, `label`, `saving-label`

User-profile metadata is mapped to input props via `attributeToInputProps()` in `resources/js/user-profile.js` (kept out of the input component so inputs stay reusable).

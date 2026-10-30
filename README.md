# Keycloak Account Console HTML

Account console theme where **every page is a simple HTML file**. Pages are served by a custom `AccountResourceProvider`; browser JavaScript calls the Account REST API (no React, no Qute).

Requires **Keycloak 26.x**.

## What’s included

- Theme `account-console-html` (`account` type)
- Provider id `html-account` — serves `pages/*.html` from the theme
- `GET …/account/environment.json` — bootstrap for keycloak-js / REST
- Shared design tokens (`resources/css/tokens.css`)
- Lit web components under `resources/js/`
  - `account-shell` — page chrome (sidebar + main)
  - `account-sidebar` — navigation
  - `account-personal-info` — profile form (user-profile metadata driven)
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
    <base href="account/" />
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My page</title>
    <link rel="stylesheet" href="resource/css/tokens.css" />
    <script type="importmap">
      {
        "imports": {
          "lit": "https://cdn.jsdelivr.net/npm/lit@3/+esm",
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
| `<attribute-name>` | Replace a profile field (e.g. `email`) |
| `field` | Append extra named fields (include a `name` to save) |
| `actions` | Replace the save button row |

Override a single profile field from HTML:

```html
<account-shell>
  <account-personal-info>
    <div slot="email" class="field">
      <label for="email">Work email</label>
      <input id="email" name="email" type="email" />
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
- `account-input::part(input)`
- `account-save-button::part(button)`

### Primitives

- `<account-input>` — form-associated; props: `name`, `type`, `value` / `.values`, `.options`, `required`, `readonly`, `disabled`, `placeholder`
- `<account-field>` — label + slotted control (+ optional `help` / `error`)
- `<account-save-button>` — `saving`, `label`, `saving-label`

User-profile metadata is mapped to input props via `attributeToInputProps()` in `resources/js/user-profile.js` (kept out of the input component so inputs stay reusable).

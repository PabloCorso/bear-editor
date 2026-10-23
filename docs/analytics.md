# Analytics

Umami Cloud (Hobby plan) hosts analytics; no server or database is needed in this project.

## Configuration

Set `VITE_UMAMI_WEBSITE_ID` and `VITE_UMAMI_SCRIPT_URL` in
`netlify.toml` under `context.production.environment`, then deploy. These are
public values, not API keys; no Netlify dashboard configuration is needed.

Tracking requires a website ID and a production build served from
`beareditor.com` or `www.beareditor.com`. Development, localhost, and Netlify
previews are excluded.

To verify a deployment, visit the site, edit a level, playtest, and save;
check the events in Umami's realtime dashboard.

## Collected data

Umami records visits and pageviews, excluding URL query strings and fragments.
Custom events send only their names, without level contents, filenames, or custom user IDs:

| Event | Trigger |
| --- | --- |
| `first_edit` | First content change per page load; opening levels and view changes are excluded. |
| `playtest_started` | Each entry into play mode, including via keyboard shortcuts. |
| `level_saved` | File write completed or browser download initiated; download completion cannot be confirmed. |

Analytics failures never block editor actions. Events before the tracker loads may be missed.

## Exclude your visits

Run `localStorage.setItem("umami.disabled", "1")` in the production site's browser
console and reload. This applies only to that browser and origin.
To resume tracking, run `localStorage.removeItem("umami.disabled")` and reload.

# Bear Level Editor

Bear Level Editor is a web-based level editor for ElastoMania. It lets you design and test levels directly in your browser.

**Live at [beareditor.com](https://beareditor.com)**

Check latest updates at [Changelog](./CHANGELOG.md).

Currently on beta stage, getting close to be on par with the original ElastoMania editor. Some features are still missing, but they will be added soon. Check the [Roadmap](./ROADMAP.md) for more details.

## Developers

If you want to run the project yourself:

```bash
npm install
npm run dev
```

## Analytics

Analytics uses Umami Cloud's hosted Hobby plan. The editor stays on Netlify;
Umami hosts the collection service and dashboard. No analytics database or
server needs to be deployed with this project.

The public website ID and script URL are configured in `netlify.toml` under
`context.production.environment`. The next production deploy enables analytics;
no additional Netlify dashboard configuration is required. These values are
public, not API keys. To change the Umami website, update
`VITE_UMAMI_WEBSITE_ID` and `VITE_UMAMI_SCRIPT_URL` there and redeploy.

After deployment, visit the production site and check Umami's realtime dashboard.
Edit a level, start a playtest, and save to verify the three custom events.

Without a website ID, analytics is disabled. Development builds do not load the
tracker. Collection is restricted to `beareditor.com` and `www.beareditor.com`,
excluding Netlify preview URLs and localhost even in production builds.

Umami automatically records visits and pageviews. Custom events contain only
these event names, with no level contents, filenames, or custom user IDs:

| Event              | Meaning                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `first_edit`       | First change to level content during a page load; opening a level and changing view settings do not count.           |
| `playtest_started` | Each transition into play mode, including keyboard shortcuts.                                                        |
| `level_saved`      | A file write completed, or a browser download was initiated. Download completion cannot be confirmed by the browser. |

URL query strings and fragments are excluded. Blocked or unavailable analytics
never prevents editor actions; events before the tracker loads may be missed.

To exclude your own visits, open the browser console **on the production site**,
run `localStorage.setItem("umami.disabled", "1")`, and reload. This applies only
to that browser and origin. Run `localStorage.removeItem("umami.disabled")` and
reload to include your visits again.

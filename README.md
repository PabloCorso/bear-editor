# Bear Level Editor

Bear Level Editor is a web-based level editor for ElastoMania. It lets you design and test levels directly in your browser.

**Live at [beareditor.com](https://beareditor.com)**

Check latest updates at [Changelog](./CHANGELOG.md).

Check the [Roadmap](./ROADMAP.md) for planned features, known issues, and developer notes.

## Developers

If you want to run the project yourself:

```bash
npm install
npm run dev
```

## Desktop

Run `npm ci` and `npm run desktop:build` from the repository root, then
`npm install --prefix desktop` and `npm --prefix desktop start`. The desktop
renderer bundles the editor, default LGR, levels, and fonts for offline use.
Open, Save as, and the level folder use Chromium's native file pickers.

For desktop development with hot reload, run `npm run desktop:dev`. Run
`npm run desktop:test-update` to use the same development mode with the
downloaded-update prompt visible. This simulated update closes the app through
the normal unsaved-changes flow without installing anything.

Run `npm --prefix desktop run package` to build an installer for your platform.
The **Desktop builds** workflow also builds macOS DMG, Windows NSIS, and Linux
AppImage artifacts for review.

To publish a desktop release, open **Actions → Desktop builds → Run workflow**.
Select the **main** branch and choose **patch**, **minor**, or **major** under
**Release desktop**. The workflow builds and verifies the installers, commits
the version bump, creates the matching tag, and publishes the installers and
Windows and Linux update files to GitHub Releases. Choose **build-only** for
test builds. Pushing a version tag also starts a release.

macOS builds use an ad-hoc signature and are not notarized, so on the first
launch Control-click **Bear Editor** and choose **Open**. Without a paid Apple
Developer certificate, macOS updates are manual downloads from GitHub Releases.
Packaged Windows and Linux builds check for updates at startup and every six
hours. Once downloaded, **Restart to update** closes the editor through its
unsaved-changes prompt before installing.

## Analytics

Production web and desktop packages report to the same Umami website. In
Umami, open **Filters → Other → Tag** and select `web` or `desktop` to compare
visitors, page views, and custom events. Older web traffic has no tag. The
tracker handles page views automatically on both platforms.

| Event              | When it fires                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `first_edit`       | First meaningful edit in the editor session.                                                                                                |
| `playtest_started` | The user enters play mode.                                                                                                                  |
| `level_saved`      | A file write succeeds or the editor starts a level download.                                                                                |
| `level_opened`     | A local level is loaded through Open or level-folder navigation. Startup restoration and built-in examples are excluded.                    |
| `level_created`    | The user creates a level through New or its shortcut. The initial blank level is excluded.                                                  |
| `level_folder_set` | A directory picked through the File System Access API is saved as the level folder. Cancelled picks and automatic restoration are excluded. |

Custom events send no level names, directory paths, or level contents. Browsers
without directory picker support can still send the other applicable events.
Analytics is best effort and the desktop editor works offline.

The desktop packaging workflow and Netlify production configuration use the same
public website ID. Local desktop builds can opt in with
`VITE_UMAMI_WEBSITE_ID` using the default Umami Cloud tracker. For smoke tests,
use a separate test website ID or intercept the collection requests to keep test
traffic out of production.

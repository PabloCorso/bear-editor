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

Desktop releases are intentional rather than automatic on every push. On a
clean branch, run `npm run desktop:release -- patch` (or `minor`/`major`). The
command bumps both desktop version files, creates the version commit, and
creates the matching `v<version>` tag. Review the result, then push the commit
and tag with `git push --follow-tags`.

The tag starts the **Desktop builds** workflow, which publishes the macOS DMG,
Windows installer, Linux AppImage, and the Windows and Linux update files to one
GitHub release. The editor's download dialog links directly to its installers.

macOS builds use an ad-hoc signature and are not notarized, so on the first
launch Control-click **Bear Editor** and choose **Open**. Without a paid Apple
Developer certificate, macOS updates are manual downloads from GitHub Releases.
Packaged Windows and Linux builds check for updates at startup and every six
hours. Once downloaded, **Restart to update** closes the editor through its
unsaved-changes prompt before installing.

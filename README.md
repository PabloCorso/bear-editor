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

Run `npm --prefix desktop run package` to build an installer for your platform.
The **Desktop builds** workflow also builds macOS DMG and ZIP, Windows NSIS,
and Linux AppImage artifacts for review.

For a release, bump the version in `desktop/package.json`, build each target,
and attach the installers, ZIP, blockmaps, and matching `latest*.yml` files
to a single GitHub release tagged `v<version>`. Publish it after all files are
present. Use a Developer ID signed and notarized macOS build for distribution
and updates. The review workflow produces unsigned previews. Installed builds
check at startup and every six hours. Once downloaded, **Restart to update**
closes the editor through its unsaved-changes prompt before installing.

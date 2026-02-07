# NPM Version Dropdown in package.json

<p align="center">
  <img src="images/icon-readme.png" alt="NPM Version Dropdown" width="128" height="128">
</p>

<p align="center">
  <strong>See outdated npm packages and update them with a single click. Or view a list of the available versions in a dropdown straight inside the VS code editor</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=legalfina.npm-version-lens">
    <img src="https://badgen.net/vs-marketplace/v/legalfina.npm-version-lens" alt="Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=legalfina.npm-version-lens">
    <img src="https://badgen.net/vs-marketplace/i/legalfina.npm-version-lens" alt="Installs">
  </a>
  <a href="LICENSE">
    <img src="https://badgen.net/badge/license/MIT/blue" alt="License">
  </a>
</p>


<p align="center">
  Built with ❤️ by Farshad Hemmati at <3 at <a href="https://www.legalfina.com/en">Legalfina</a>
</p>
---

## Features

### Color-coded version indicators

The extension displays the latest available version inline, color-coded by update scope:

| Color | Meaning | Example |
|-------|---------|---------|
| Light blue | Major update | `1.x.x` → `2.x.x` |
| Orange | Minor update | `1.1.x` → `1.2.x` |
| Green | Patch update | `1.1.1` → `1.1.2` |
| Red | Version not found | Invalid or unpublished version |

<p align="center">
  <img src="images/screenshot-main.png" alt="Version indicators in package.json" width="700">
</p>

### Version dropdown

Click the dropdown icon next to any package to browse all available versions. The list is sorted newest-first, with the latest stable version pre-selected.

<p align="center">
  <img src="images/screenshot-dropdown.png" alt="Version dropdown selector" width="450">
</p>

### Clickable package links

Cmd+click (Ctrl+click on Windows/Linux) any package name to open its page on [npmjs.com](https://www.npmjs.com). Hover over a package name to see the link tooltip.

### Performance

- Packages are fetched in parallel
- Results are cached to avoid redundant requests
- Uses npm's abbreviated metadata endpoint
- Duplicate requests for the same package are deduplicated


---

## Usage

Open any `package.json` file. The extension activates automatically and shows version indicators next to outdated dependencies. Click the indicator or the dropdown icon to select a different version.

All dependency sections are supported: `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`.

### Commands

| Command | Description |
|---------|-------------|
| `NPM Version Lens: Refresh` | Clear cache and re-fetch all package versions |
| `NPM Version Lens: Show All Versions` | Open version dropdown for the package at cursor |

---

## Requirements

- VS Code 1.85.0+
- Internet connection (to query the npm registry)

---

## FAQ

**No version indicators are showing up**
Make sure the file is named `package.json`, check your internet connection, and try running "NPM Version Lens: Refresh" from the command palette.

**A package isn't showing as outdated**
It may already be on the latest version, use an unsupported version format (`git://`, `file:`, etc.), or not exist on the public npm registry.

**Private registries**
Only the public npm registry is supported. Private registry support is planned.

---

## Known issues

- Large `package.json` files (100+ dependencies) may take a few seconds on first load.
- Scoped packages (`@org/package`) are supported but may be slightly slower to fetch.

---

## Contributing

Contributions are welcome. Fork the repository, create a feature branch, and open a pull request.

---

## License

MIT — see [LICENSE](LICENSE) for details.



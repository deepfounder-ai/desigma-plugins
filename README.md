# Desigma Plugins

A home for independently developed plugins for [Desigma](https://github.com/deepfounder-ai/desigma).

## Status

Desigma supports installation of schema-version-1 native bundles from this repository. The installation demo is available under `plugins/install-demo`. Schema-version-2 plugins run as a panel and can insert SVG into the open document. [Icon Browser](plugins/icon-browser/README.md) is installable: search Iconify, customize an icon and insert it as editable layers. There is no Figma plugin compatibility promise.

## Direction

- Develop plugins against Desigma's own documented APIs as they become available.
- Keep plugin packages and their source together under `plugins/`.
- Give every plugin an explicit license, author, version, and permission declaration.
- Include installation instructions and tests once a supported runtime exists.
- Include third-party code or assets only when their licenses permit the intended use, retaining required notices.

This repository does not download, mirror, or redistribute Figma Community plugins. A public URL alone is not evidence of permission to reuse a package.

## Layout

- `plugins/` — native plugin projects, browser previews and contribution guidance.

The editor, document model, and MCP server remain in the main Desigma repository. See [the installation demo](plugins/install-demo/README.md) for the supported manifest format, installation URL, and authentication. Runtime APIs are still under development.

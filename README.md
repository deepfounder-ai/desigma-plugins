# Desigma Plugins

A home for independently developed plugins for [Desigma](https://github.com/deepfounder-ai/desigma).

## Status

Repository scaffold. Desigma's plugin runtime and installation format are still under development. There are no runnable plugins here yet, and this repository does not promise Figma plugin compatibility.

## Direction

- Develop plugins against Desigma's own documented APIs as they become available.
- Keep plugin packages and their source together under `plugins/`.
- Give every plugin an explicit license, author, version, and permission declaration.
- Include installation instructions and tests once a supported runtime exists.
- Include third-party code or assets only when their licenses permit the intended use, retaining required notices.

This repository does not download, mirror, or redistribute Figma Community plugins. A public URL alone is not evidence of permission to reuse a package.

## Layout

- `plugins/` — future plugin projects and contribution guidance.

The editor, document model, and MCP server remain in the main Desigma repository. Plugin manifests and APIs will be documented here when they are implemented; no draft format is presented as supported today.

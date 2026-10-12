# Installation demo

A no-op package for testing Desigma's native plugin installer. This is independently authored for Desigma and contains no Figma plugin code.

Paste this URL in Plugins > Install plugin:

https://github.com/deepfounder-ai/desigma-plugins/blob/main/plugins/install-demo/manifest.json

The repository is private. Start Desigma with `DESIGMA_PLUGINS_TOKEN` set to a GitHub token that has read access to this repository's contents. Do not put a token in the URL. Downloads use GitHub's contents API; the app does not discover credentials from your GitHub CLI.

The installer accepts schema version 1, a relative JavaScript entry file, and an empty permissions list. It saves the manifest and entry file locally. Running JavaScript is not implemented. Nested JavaScript imports, UI files and extra assets are not packaged by this initial format.

A sibling LICENSE file is required and is preserved in the installed bundle. Each downloaded file is limited to 2 MiB. Use a commit SHA instead of main in the URL to pin a revision.

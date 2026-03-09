---
"@djodjonx/create-gwen-app": patch
---

Update create-gwen-app with per-package version syncing.

- Add `versions.json` mapping for template dependency versions
- Update CLI to read and inject per-package versions instead of single GWEN_VERSION
- Add `sync:create-app-versions` script to automatically sync versions during release
- Template now uses dedicated placeholders (GWEN_ENGINE_CORE_VERSION, GWEN_KIT_VERSION, etc.)


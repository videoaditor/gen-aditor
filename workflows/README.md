# gen.aditor.ai Workflows

Workflows mit `"starred": true` erscheinen automatisch im Shortcuts Tab.

## Ordner-Struktur

```
workflows/
├── starred/       # Favoriten (erscheinen in Shortcuts)
├── community/     # Gedownloadete community workflows
├── custom/        # Eigene workflows
└── registry.json  # Index aller workflows
```

## Workflow Format

Jeder Workflow ist eine JSON-Datei:

```json
{
  "id": "product-photoshoot",
  "name": "Product Photoshoot",
  "description": "Produktfoto → professionelles Setting",
  "starred": true,
  "category": "product",
  "icon": "📸",
  "inputs": [
    { "id": "image", "type": "image", "label": "Produktfoto", "required": true },
    { "id": "scene", "type": "select", "label": "Scene", "options": ["studio", "lifestyle", "outdoor", "minimal"] },
    { "id": "prompt", "type": "text", "label": "Custom prompt", "placeholder": "marble surface, soft lighting..." }
  ],
  "pipeline": [
    { "step": "segment", "model": "sam" },
    { "step": "generate", "model": "seedream-4-5-edit", "provider": "runcomfy" }
  ],
  "output": { "type": "image", "count": 1 },
  "cost_estimate": "$0.05-0.15"
}
```

## Starred Workflows → Shortcuts

Frontend liest `registry.json`, filtert `starred: true`, zeigt als Shortcut Cards.

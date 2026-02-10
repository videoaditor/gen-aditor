# Workflow Management

## Adding a New Workflow

Edit `workflows.json` and add a new entry:

```json
{
  "id": "unique-workflow-id",
  "name": "Display Name",
  "description": "What this workflow does",
  "category": "Product|Marketing|Utility|Creative|UI",
  "template": "template-filename-without-json",
  "thumbnail": "/thumbnails/workflow-thumb.jpg",
  "params": [
    {
      "name": "param_name",
      "label": "User-Facing Label",
      "type": "text|textarea|number|select|slider|file",
      "default": "default value",
      "required": true|false
    }
  ]
}
```

## Param Types

- **text**: Single-line text input
- **textarea**: Multi-line text input
- **number**: Numeric input
- **select**: Dropdown with options
- **slider**: Range slider (needs min, max)
- **file**: File upload (needs accept mime types)

## Workflow Templates

Create workflow templates in `templates/[template-name].json`.

Use `{{param_name}}` placeholders that will be replaced with user inputs.

### Example Template: `templates/product-shot-pro.json`

```json
{
  "1": {
    "inputs": {
      "text": "{{prompt}}",
      "clip": ["2", 0]
    },
    "class_type": "CLIPTextEncode"
  },
  "2": {
    "inputs": {
      "ckpt_name": "sd_xl_base_1.0.safetensors"
    },
    "class_type": "CheckpointLoaderSimple"
  },
  "3": {
    "inputs": {
      "seed": {{seed}},
      "steps": 30,
      "cfg": 7,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["2", 0],
      "positive": ["1", 0],
      "negative": ["4", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler"
  },
  "4": {
    "inputs": {
      "text": "{{negative_prompt}}",
      "clip": ["2", 0]
    },
    "class_type": "CLIPTextEncode"
  },
  "5": {
    "inputs": {
      "width": {{width}},
      "height": {{height}},
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage"
  },
  "6": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["2", 2]
    },
    "class_type": "VAEDecode"
  },
  "7": {
    "inputs": {
      "filename_prefix": "product-shot",
      "images": ["6", 0]
    },
    "class_type": "SaveImage"
  }
}
```

## Quick Add Flow

1. Export workflow from ComfyUI UI (right-click → "Save (API Format)")
2. Save as `templates/[workflow-name].json`
3. Replace hard-coded values with `{{param_name}}` placeholders
4. Add workflow entry to `workflows.json`
5. Restart backend (auto-reloads workflows)
6. Workflow appears in UI immediately

## Categories

- **Product**: Product photography, packshots
- **Marketing**: Hero images, social media graphics
- **Utility**: Background removal, upscaling, format conversion
- **Creative**: Style transfer, artistic effects
- **UI**: Badges, overlays, interface elements

## Tips

- Use descriptive workflow IDs (lowercase, hyphenated)
- Keep param names simple and clear
- Provide good defaults for optional params
- Test workflows in ComfyUI first before adding
- Use thumbnails that show the workflow's output style

## Removing a Workflow

1. Delete the entry from `workflows.json`
2. Restart backend
3. (Optional) Delete template file if no longer needed

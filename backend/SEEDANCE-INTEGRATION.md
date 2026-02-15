# Seedance 2.0 Integration Plan

## Status: WAITING FOR RELEASE
**Expected:** Late February 2026
**Monitor:** https://www.atlascloud.ai/collections/seedance2

## Account Ready
- **Provider:** Atlas Cloud
- **Email:** player@aditor.ai  
- **API Key:** Saved in CREDENTIALS.md + backend .env as `ATLAS_CLOUD_API_KEY`
- **Base URL:** https://api.atlascloud.ai/v1

## Current Models (Seedance 1.5 Pro)
- `bytedance/seedance-v1.5-pro/image-to-video` — $0.102/sec
- `bytedance/seedance-v1.5-pro/text-to-video` — $0.102/sec

## Seedance 2.0 Features (Why We're Waiting)
- **Multi-shot consistency** — characters stay consistent across scenes
- **Universal reference** — upload reference images/videos for style/motion
- **Native audio sync** — generated audio matches video rhythm
- **4-modal input** — text + image + video + audio
- **Precise control** — replicate composition, camera movement, character actions

## Integration Points
1. **gen.aditor.ai Video Gen tab** — add Seedance 2.0 as video model option
2. **Workflow: Screenshot → Broll** — use Seedance for product video generation
3. **Workflow: Script → Explainer** — multi-shot explainer video generation

## Existing Code
- `services/seedance.js` — has OpenAI-compatible integration scaffold
- Atlas Cloud uses OpenAI-compatible API format

## When Released
1. Check model ID at Atlas Cloud
2. Top up credits (~$10-20 for testing)
3. Update seedance.js with correct model endpoint
4. Add to Video Gen tab in frontend
5. Test with product shots from existing clients

## Cost Estimate
- Seedance 1.5: $0.102/sec (~$0.51 per 5-sec video)
- Seedance 2.0: TBD (likely similar or slightly higher)
- Budget for initial testing: $20-50

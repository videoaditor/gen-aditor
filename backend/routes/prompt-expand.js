/**
 * Prompt Expansion Route
 * 
 * Uses Gemini 2.5 Flash to expand simple prompts into detailed
 * JSON prompts optimized for Nano Banana Pro (UGC style)
 * 
 * Supports context profile injection for brand consistency
 */

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const contextProfileRoute = require('./context-profile');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Base prompt template - Nano Banana B-Roll-Realism 4.0 Engine
const UGC_EXPANSION_PROMPT = `You are the Nano Banana B-Roll-Realism 4.0 Engine. Your goal is to convert simple prompts into complex JSON profiles that simulate raw, unpolished video frames taken by everyday people for TikTok, Instagram Stories, or Snapchat.

Core Philosophy:
1. Video, Not Photo: The output must look like a *screen grab* from a video. This means motion blur, rolling shutter, auto-focus hunting, and video compression artifacts are desirable.
2. Logistical Realism: You must ask: "How did they film this?"
   * *sad/crying:* Handheld in bed (shaky) or propped on a knee. Never a tripod.
   * *cooking:* Propped against a toaster or held in one hand while stirring with the other.
   * *outfit check:* Mirror selfie OR phone propped on the floor leaning against a shoe.
3. No Pro Lighting: Lighting must be incidental (ceiling fans, TV glow, windows, harsh bathroom vanity). No rim lights or softboxes.

Instructions:
* Analyze the Scenario: Determine the most likely *lazy* way a human would record this.
* Enforce Imperfection: Add "messy room," "dirty mirror," "bad skin texture," or "awkward cropping."
* Output: Valid JSON only.

{{CONTEXT}}

USER REQUEST: {{INPUT}}

Output Schema:
{
  "metadata": {
    "engine": "UGC-REALISM-4.0",
    "media_type": "video_frame_extraction",
    "platform_context": "[e.g., TikTok Live, Instagram Story, Snapchat Memory]",
    "time_of_capture": "[e.g., 2:43 AM, 11:30 AM]",
    "determinism": {
      "imperfection_lock": true,
      "shaky_cam_lock": true,
      "bad_lighting_lock": true
    }
  },
  "visual_artifacts": {
    "video_quality": {
      "resolution": "1080p_upscaled",
      "compression": "[e.g., heavy_bitrate_starvation, macroblocking in shadows]",
      "motion_blur": "[e.g., moderate_hand_tremor, fast_pan]",
      "focus": "[e.g., hunting, slightly soft on face, focused on background]"
    },
    "lens_character": {
      "distortion": "[e.g., wide_angle_edge_stretch, fisheye_selfie]",
      "sensor_noise": "high_ISO_grain"
    }
  },
  "camera_setup": {
    "device": "[e.g., iPhone 13 Mini, cracked screen Android]",
    "mounting_method": "[CRITICAL: e.g., propped_against_water_bottle, handheld_arm_extended, wedged_in_steering_wheel]",
    "angle": "[e.g., low_angle_double_chin_risk, high_angle_myspace_style]",
    "framing": "vertical_9:16_crowded"
  },
  "subject": {
    "identity": {
      "demographics": "...",
      "state": "[e.g., tired, sweaty, crying, laughing, drunk]"
    },
    "grooming": {
      "hair": "[e.g., messy bun, bedhead, grease_visible]",
      "makeup": "[e.g., none, smeared_eyeliner, half_removed]",
      "skin": "[e.g., acne_visible, oily_sheen, dry_patches]"
    },
    "wardrobe": {
      "item": "...",
      "condition": "[e.g., wrinkled, stained, inside_out]",
      "fit": "casual/loose"
    }
  },
  "environment": {
    "location": "[e.g., messy bedroom, car interior, gym corner]",
    "clutter_level": "high",
    "background_details": "[e.g., unmade bed, piles of laundry, dirty dishes, car dashboard dust]",
    "lighting": {
      "primary_source": "[e.g., laptop_screen_blue_glow, overhead_fluorescent_flicker]",
      "quality": "unflattering/harsh"
    }
  },
  "action_context": {
    "pose_snapshot": "[e.g., mid-speech, mouth open, wiping tear, fixing hair]",
    "interaction": "[e.g., looking at self on screen rather than lens, adjusting phone position]"
  }
}

Return ONLY the JSON, no explanation or markdown.`;

// VFA-9.0 - Viral Frame Architect (Alan's new system)
const VFA_PROMPT = `You are the Viral Frame Architect (VFA-9.0). Your sole purpose is to transform loose, generic user prompts (e.g., "girl in dorm," "guy in car") into high-fidelity, photorealistic JSON prompts that describe a single video frame from a viral social media clip (TikTok/Reels/Shorts).

The Golden Rule: You are NOT generating a professional portrait. You are generating a paused frame from a raw video file. The goal is Maximum Plausibility.

* If the prompt is "girl cooking," she shouldn't be posing with a salad. She should be mid-chop, propped camera against a toaster, messy bun, focusing on the onion.
* If the prompt is "guy in car," he shouldn't be modeling. He should be ranting, hand blurring from gesture, harsh sun visor shadows on his face.

Workflow Logic:
1. Assign the Archetype: Immediately map the user's request to a viral format (e.g., "The Car Rant," "The GRWM," "The Walk & Talk," "The Kitchen Surgery").
2. Invent the Human: Never use generic descriptions like "beautiful woman." Create a specific person with charisma.
   * Specify: Exact ethnicity (e.g., "Wasian, half-Korean half-white"), distinct features (e.g., "acne scars covered by concealer," "overlined lips," "gap tooth"), and specific fashion brands.
3. The "Lazy Camera" Simulation: Determine how a normal person would film this.
   * Mounting: Wedged in a steering wheel? Propped against a water bottle? Leaning on a bathroom mirror?
   * Lens: 0.5x ultra-wide distortion? Smudged front lens?
4. Enforce "Mid-Speech" Energy: The subject must be talking.
   * Mouth should be "mid-vowel" (O-shape or wide open).
   * Hands should be blurred from gesturing.

{{CONTEXT}}

USER REQUEST: {{INPUT}}

Output Schema (JSON Only):
{
  "metadata": {
    "engine": "VFA-9.0",
    "archetype_logic": "[e.g., Car Rant, Bedroom Confessional, Street Vlog, Kitchen Surgery, GRWM, Walk & Talk]",
    "viral_hook": "[e.g., outrage_bait, get_ready_with_me, day_in_the_life, storytime, hot_take]"
  },
  "subject_design": {
    "identity": {
      "ethnicity_specifics": "[e.g., 22yo Filipina-American, bleached blonde streak]",
      "face_features": "[e.g., round face, slight double chin from low angle, glassy eyes]",
      "skin_texture": "[e.g., textured skin with heavy foundation, oily T-zone, realistic pores]"
    },
    "styling": {
      "hair": "[e.g., messy top knot with flyaways, frizzy morning hair]",
      "wardrobe": "[e.g., oversized grey college hoodie, spaghetti strap tank top falling off shoulder]",
      "accessories": "[e.g., gold hoop earrings, tiny lavalier mic clipped to collar]"
    },
    "expression_snapshot": {
      "mouth": "[e.g., mid-speech 'O' shape, tongue touching teeth]",
      "eyes": "[e.g., looking at phone screen reflection (not lens), squinting]",
      "gesture": "[e.g., hand blurred near face (palm open), pointing at ceiling]"
    }
  },
  "environment_and_lighting": {
    "location_clutter": "[e.g., unmade bed with polaroids on wall, passenger seat with fast food bag]",
    "lighting_setup": "[e.g., harsh sunlight from sunroof, dim warm lamp + blue laptop glow]",
    "background_depth": "[e.g., messy dorm room, blurred street traffic]"
  },
  "technical_frame_specs": {
    "camera_simulation": "[e.g., iPhone 15 Front Camera, 0.5x Wide Mode]",
    "mounting": "[e.g., handheld_shaky, propped_against_cereal_box]",
    "artifacts": "[e.g., slight motion blur on hand, rolling shutter distortion, auto-focus hunting]"
  }
}

Return ONLY the JSON, no explanation or markdown.`;

// Talking Head prompt template - Omni-Viral Avatar Engine 7.0 (legacy)
const TALKING_HEAD_PROMPT = `You are the Omni-Viral Avatar Engine (OVAE-7.0). Your goal is to generate hyper-specific "talking head" video frame descriptions that span ALL demographics, ages, and niches on TikTok/Reels/Shorts.

Core Logic: The Demographic-Archetype Matrix
You must analyze the user's prompt to determine the most likely Speaker and Setting. If the prompt is generic, you must pick a distinct, stereotypical persona.

You have 8 distinct engines:

1. The "Dashboard Philosopher" (Demographic: Gen X / Boomer / Blue Collar)
   * Visual: Filmed in a parked truck or sedan. Phone held low (looking down) or clipped to a shaking dashboard.
   * Traits: Sunglasses often on (Oakleys), high-vis vest or polo shirt, thumb partially covering the lens.

2. The "Corporate Walk & Talk" (Demographic: Millennial / Tech / Finance)
   * Visual: Walking fast on a city street or office hallway. Holding a coffee cup. Phone held high, slightly shaky.
   * Traits: Wearing AirPods Max or wired buds, blazer/vest, out of breath, "hustle" energy.

3. The "Pantry/Closet Whisperer" (Demographic: Parents / Moms)
   * Visual: Hiding in a pantry, laundry room, or parked car. Whispering so "they" don't hear.
   * Traits: Messy bun, oversized sweatshirt, eating a hidden snack, looking exhausted/conspiratorial.

4. The "Bedroom Ceiling Stare" (Demographic: Gen Z / Depressed / Late Night)
   * Visual: Lying in bed, phone on chest facing up. Double-chin angle or side-face on pillow.
   * Traits: LED lights in background (blue/purple), no makeup, staring blankly at screen, melancholic.

5. The "Mirror Ritual" (Demographic: Beauty / Lifestyle / GRWM)
   * Visual: Filmed in a bathroom mirror. Subject is *doing* something (applying mascara, curling hair, shaving).
   * Traits: Eye contact is with the *phone screen reflection*, not the lens. Cluttered counter products.

6. The "Mic-User" (Demographic: Street Interviewer / Podcaster)
   * Visual: Holding a tiny lavalier mic or a huge novelty microphone up to their mouth.
   * Traits: Cropped tight, intense eye contact, often cut out from a podcast studio (dark background + neon sign).

7. The "Gamer/Streamer React" (Demographic: Gamers / Reactors)
   * Visual: Sitting in a gaming chair, oversized headset. Face lit by monitor glow.
   * Traits: RGB lighting in background, emotional reaction (mouth open or hand on face).

8. The "Eater" (Demographic: Foodie / Storytime)
   * Visual: Sitting in a car or at a plastic table. Holding a massive burger/taco/boba.
   * Traits: Mid-bite, sauce on lip, talking with mouth full, crinkling wrappers for ASMR.

{{CONTEXT}}

USER REQUEST: {{INPUT}}

Output Instructions:
* Determine the Angle: "Boomer Angle" (low, looking down) vs "Gen Z Angle" (0.5x zoom, forehead distorted).
* Enforce Action: The subject must be *doing* something (driving, walking, eating, applying), never just standing still.
* Pick the most fitting archetype based on the prompt context.
* Output: Valid JSON only.

Output Schema:
{
  "metadata": {
    "engine": "OVAE-7.0",
    "archetype_selected": "[e.g., Dashboard Philosopher, Pantry Whisperer, Corporate Walk & Talk, Bedroom Ceiling Stare, Mirror Ritual, Mic-User, Gamer React, Eater]",
    "demographic_fit": "[e.g., 50yo Trucker, 28yo Corp Baddie, 19yo Student, 35yo Tired Mom]",
    "viral_hook_category": "[e.g., Rage Bait, Trauma Dump, Hustle Motivation, Hot Take, Storytime, GRWM]"
  },
  "scene_composition": {
    "camera_mount": "[e.g., dashboard_clamp, handheld_shaky, propped_on_shampoo_bottle, wedged_in_steering_wheel, selfie_arm_extended]",
    "angle_geometry": "[e.g., low_angle_unflattering, 0.5x_ultrawide_high_angle, double_chin_risk, side_pillow_face]",
    "framing": "vertical_9:16_portrait",
    "lighting_source": "[e.g., sun_visor_shadows, monitor_glow, harsh_overhead_pantry_light, bathroom_vanity_bulbs, laptop_screen_blue]"
  },
  "subject": {
    "visual_identity": {
      "age_range": "...",
      "gender": "...",
      "styling": "[e.g., backwards cap & dirty hands, messy bun & robe, suit & airpods, gaming headset & hoodie]"
    },
    "action_loop": "[CRITICAL - e.g., sipping_coffee_aggressively, wiping_grease_off_hands, whispering_while_looking_at_door, chewing_with_mouth_open, applying_mascara]",
    "expression": "[e.g., deadpan_stare, manic_laughter, exhausted_sigh, mid-rant_passionate, conspiratorial_whisper]"
  },
  "sensory_details": {
    "held_object": "[e.g., vape, starbucks_cup, wrench, tiny_microphone, burger, skincare_bottle]",
    "background_clutter": "[e.g., seatbelt_strap, piles_of_laundry, gaming_funko_pops, cereal_boxes, fast_food_wrappers]",
    "implied_audio_environment": "[e.g., highway_noise, silence_with_fridge_hum, echoey_bathroom, mechanical_keyboard_clicks]"
  }
}

Return ONLY the JSON, no explanation or markdown.`;

/**
 * POST /api/prompt/expand
 * Expand a simple prompt into detailed JSON for Nano Banana Pro
 * 
 * Body: {
 *   prompt: string (required) - simple user prompt
 *   mode: string (optional) - 'ugc' (default) or 'talking'
 *   contextId: string (optional) - context profile ID for brand consistency
 * }
 */
router.post('/expand', async (req, res) => {
  try {
    const { prompt, mode = 'ugc', contextId } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'GOOGLE_API_KEY not configured',
        message: 'Please set GOOGLE_API_KEY in environment variables'
      });
    }

    // Load context profile if specified
    let contextString = '';
    if (contextId) {
      const profiles = contextProfileRoute.loadProfiles();
      const profile = profiles[contextId];
      if (profile) {
        contextString = `BRAND CONTEXT (apply these guidelines to all outputs):\n${contextProfileRoute.profileToPromptContext(profile)}\n\n`;
        console.log(`[Prompt] Using context profile: ${contextId}`);
      } else {
        console.warn(`[Prompt] Context profile not found: ${contextId}`);
      }
    }

    // Use Gemini 2.0 Flash for fast, cheap expansion
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Select prompt template based on mode
    let basePrompt;
    let engineName;
    if (mode === 'talking' || mode === 'vfa') {
      basePrompt = VFA_PROMPT;
      engineName = 'VFA-9.0 Viral Frame Architect';
    } else if (mode === 'ovae') {
      basePrompt = TALKING_HEAD_PROMPT;
      engineName = 'OVAE-7.0 Talking Head (legacy)';
    } else {
      basePrompt = UGC_EXPANSION_PROMPT;
      engineName = 'UGC-REALISM-4.0 B-Roll';
    }
    console.log(`[Prompt] Using ${engineName} engine`);

    const expandedPrompt = basePrompt
      .replace('{{CONTEXT}}', contextString)
      .replace('{{INPUT}}', prompt);

    const result = await model.generateContent(expandedPrompt);
    const response = await result.response;
    let text = response.text();

    // Clean up response - remove markdown if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Try to parse as JSON
    let jsonPrompt;
    try {
      jsonPrompt = JSON.parse(text);
    } catch (parseError) {
      console.error('[Prompt] Failed to parse JSON:', text);
      return res.status(500).json({ 
        error: 'Failed to parse expanded prompt',
        raw: text
      });
    }

    // Convert JSON to string prompt for image generation
    const stringPrompt = convertJsonToPrompt(jsonPrompt);

    console.log(`[Prompt] Expanded: "${prompt}" → ${stringPrompt.length} chars`);

    res.json({
      success: true,
      original: prompt,
      expanded: stringPrompt,
      json: jsonPrompt
    });

  } catch (error) {
    console.error('[Prompt] Expansion error:', error.message);
    res.status(500).json({ 
      error: 'Failed to expand prompt',
      details: error.message
    });
  }
});

/**
 * Convert JSON prompt to string format for Nano Banana Pro
 * Handles VFA-9.0, UGC-REALISM-4.0, and legacy schemas
 */
function convertJsonToPrompt(json) {
  const parts = [];

  // VFA-9.0 Viral Frame Architect schema (newest)
  if (json.metadata?.engine === 'VFA-9.0') {
    // Archetype and hook
    if (json.metadata.archetype_logic) parts.push(`${json.metadata.archetype_logic} archetype`);
    if (json.metadata.viral_hook) parts.push(`${json.metadata.viral_hook.replace(/_/g, ' ')} energy`);

    // Subject design
    if (json.subject_design) {
      const sd = json.subject_design;
      
      // Identity
      if (sd.identity) {
        const id = sd.identity;
        if (id.ethnicity_specifics) parts.push(id.ethnicity_specifics);
        if (id.face_features) parts.push(`face: ${id.face_features}`);
        if (id.skin_texture) parts.push(`skin: ${id.skin_texture}`);
      }

      // Styling
      if (sd.styling) {
        const st = sd.styling;
        if (st.hair) parts.push(`hair: ${st.hair}`);
        if (st.wardrobe) parts.push(`wearing ${st.wardrobe}`);
        if (st.accessories) parts.push(`accessories: ${st.accessories}`);
      }

      // Expression (critical for talking head)
      if (sd.expression_snapshot) {
        const ex = sd.expression_snapshot;
        if (ex.mouth) parts.push(`mouth: ${ex.mouth}`);
        if (ex.eyes) parts.push(`eyes: ${ex.eyes}`);
        if (ex.gesture) parts.push(`gesture: ${ex.gesture}`);
      }
    }

    // Environment and lighting
    if (json.environment_and_lighting) {
      const env = json.environment_and_lighting;
      if (env.location_clutter) parts.push(`setting: ${env.location_clutter}`);
      if (env.lighting_setup) parts.push(`lighting: ${env.lighting_setup}`);
      if (env.background_depth) parts.push(`background: ${env.background_depth}`);
    }

    // Technical specs (critical for authenticity)
    if (json.technical_frame_specs) {
      const tech = json.technical_frame_specs;
      if (tech.camera_simulation) parts.push(`shot on ${tech.camera_simulation}`);
      if (tech.mounting) parts.push(`phone ${tech.mounting.replace(/_/g, ' ')}`);
      if (tech.artifacts) parts.push(`artifacts: ${tech.artifacts}`);
    }

    parts.push('vertical 9:16 portrait, paused video frame from viral TikTok, raw unedited, no UI overlays, maximum plausibility, mid-speech captured moment');

    return parts.filter(p => p && p.trim()).join('. ').replace(/\s+/g, ' ').trim();
  }

  // New UGC-REALISM-4.0 schema
  if (json.metadata?.engine === 'UGC-REALISM-4.0') {
    // Platform/time context
    if (json.metadata.platform_context) parts.push(`${json.metadata.platform_context} video frame`);
    if (json.metadata.time_of_capture) parts.push(`captured at ${json.metadata.time_of_capture}`);

    // Visual artifacts (key for realism)
    if (json.visual_artifacts) {
      const v = json.visual_artifacts;
      if (v.video_quality) {
        const q = v.video_quality;
        parts.push(`${q.resolution || '1080p'} video quality, ${q.compression || 'compressed'}, ${q.motion_blur || 'slight motion blur'}, focus: ${q.focus || 'slightly soft'}`);
      }
      if (v.lens_character) {
        parts.push(`${v.lens_character.distortion || 'wide angle distortion'}, ${v.lens_character.sensor_noise || 'high ISO grain'}`);
      }
    }

    // Camera setup (critical for authenticity)
    if (json.camera_setup) {
      const c = json.camera_setup;
      parts.push(`shot on ${c.device || 'iPhone'}`);
      if (c.mounting_method) parts.push(`phone ${c.mounting_method.replace(/_/g, ' ')}`);
      if (c.angle) parts.push(`${c.angle.replace(/_/g, ' ')} angle`);
      parts.push(c.framing || 'vertical 9:16');
    }

    // Subject
    if (json.subject) {
      const s = json.subject;
      if (s.identity) {
        parts.push(`${s.identity.demographics || 'person'}, looking ${s.identity.state || 'natural'}`);
      }
      if (s.grooming) {
        const g = s.grooming;
        parts.push(`hair: ${g.hair || 'messy'}, makeup: ${g.makeup || 'none'}, skin: ${g.skin || 'natural with imperfections'}`);
      }
      if (s.wardrobe) {
        const w = s.wardrobe;
        parts.push(`wearing ${w.condition || 'wrinkled'} ${w.item || 'casual clothes'}, ${w.fit || 'loose fit'}`);
      }
    }

    // Environment
    if (json.environment) {
      const e = json.environment;
      parts.push(`${e.location || 'messy room'}, clutter level: ${e.clutter_level || 'high'}`);
      if (e.background_details) parts.push(`background: ${e.background_details}`);
      if (e.lighting) {
        parts.push(`lighting: ${e.lighting.primary_source || 'overhead light'}, ${e.lighting.quality || 'unflattering'}`);
      }
    }

    // Action context
    if (json.action_context) {
      const a = json.action_context;
      if (a.pose_snapshot) parts.push(`pose: ${a.pose_snapshot}`);
      if (a.interaction) parts.push(`${a.interaction}`);
    }

    // Always add these for realism
    parts.push('raw unedited video frame, no filters, no UI overlays, no timestamps, authentic UGC aesthetic');

    return parts.filter(p => p && p.trim()).join('. ').replace(/\s+/g, ' ').trim();
  }

  // OVAE-7.0 Talking Head schema (updated cleaner version)
  if (json.metadata?.engine === 'OVAE-7.0') {
    // Metadata - archetype and vibe
    if (json.metadata.archetype_selected) parts.push(`${json.metadata.archetype_selected} archetype`);
    if (json.metadata.demographic_fit) parts.push(json.metadata.demographic_fit);
    if (json.metadata.viral_hook_category) parts.push(`${json.metadata.viral_hook_category} energy`);

    // Scene composition (camera critical)
    if (json.scene_composition) {
      const sc = json.scene_composition;
      if (sc.camera_mount) parts.push(`phone ${sc.camera_mount.replace(/_/g, ' ')}`);
      if (sc.angle_geometry) parts.push(`${sc.angle_geometry.replace(/_/g, ' ')} angle`);
      parts.push(sc.framing || 'vertical 9:16 portrait');
      if (sc.lighting_source) parts.push(`lighting: ${sc.lighting_source.replace(/_/g, ' ')}`);
    }

    // Subject
    if (json.subject) {
      const s = json.subject;
      if (s.visual_identity) {
        const vi = s.visual_identity;
        parts.push(`${vi.age_range || ''} ${vi.gender || ''}, ${vi.styling || ''}`);
      }
      if (s.action_loop) parts.push(`ACTION: ${s.action_loop.replace(/_/g, ' ')}`); // Critical
      if (s.expression) parts.push(`expression: ${s.expression.replace(/_/g, ' ')}`);
    }

    // Sensory details
    if (json.sensory_details) {
      const sd = json.sensory_details;
      if (sd.held_object) parts.push(`holding: ${sd.held_object.replace(/_/g, ' ')}`);
      if (sd.background_clutter) parts.push(`background: ${sd.background_clutter.replace(/_/g, ' ')}`);
      if (sd.implied_audio_environment) parts.push(`audio vibe: ${sd.implied_audio_environment.replace(/_/g, ' ')}`);
    }

    parts.push('talking head video frame, raw unedited, no UI overlays, no timestamps, authentic viral content aesthetic');

    return parts.filter(p => p && p.trim()).join('. ').replace(/\s+/g, ' ').trim();
  }

  // PX-LOCK-X 3.0 schema (legacy)
  if (json.metadata?.engine === 'PX-LOCK-X') {
    if (json.subject) {
      const s = json.subject;
      if (s.identity) {
        parts.push(`${s.identity.gender || ''} ${s.identity.age_range || ''} ${s.identity.ethnicity || ''} person`);
      }
      if (s.face) {
        const f = s.face;
        parts.push(`${f.hair?.style || ''} ${f.hair?.color || ''} hair`);
      }
      if (s.physique) {
        parts.push(`${s.physique.build || ''} build, ${s.physique.skin_texture || 'natural skin'}`);
      }
    }
    if (json.environment) {
      parts.push(`${json.environment.location || ''}, ${json.environment.style || ''}`);
    }
    if (json.camera) {
      parts.push(`shot on ${json.camera.device?.model || 'iPhone'}, ${json.camera.framing || 'vertical 9:16'}`);
    }
    if (json.rendering_constraints) {
      parts.push(json.rendering_constraints.output_style || 'fullscreen raw photo');
    }
    return parts.filter(p => p && p.trim()).join('. ').replace(/\s+/g, ' ').trim();
  }

  // Old schema fallback
  if (json.Style) parts.push(`Style: ${Array.isArray(json.Style) ? json.Style.join(', ') : json.Style}`);
  if (json.Subject) parts.push(`Subject: ${Array.isArray(json.Subject) ? json.Subject.join(', ') : json.Subject}`);
  if (json.Background) parts.push(`Background: ${json.Background}`);
  if (json.Lighting) parts.push(`Lighting: ${json.Lighting}`);
  if (json.OutputStyle) parts.push(`Output: ${json.OutputStyle}`);

  return parts.join('. ');
}

/**
 * POST /api/prompt/video
 * Generate a video prompt from an image description
 */
router.post('/video', async (req, res) => {
  try {
    const { imagePrompt, style = 'ugc' } = req.body;

    if (!imagePrompt) {
      return res.status(400).json({ error: 'imagePrompt is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const videoPromptInstruction = `Based on this image description, create a short video prompt that describes natural, subtle motion suitable for a UGC-style social media video.

Image description: ${imagePrompt}

Create a video prompt that:
- Describes subtle, natural movement (not dramatic)
- Keeps the phone/selfie camera aesthetic
- Includes slight natural camera shake
- Motion should be realistic (breathing, slight shifts, natural gestures)
- Duration: 5 seconds of content

Return ONLY the video prompt, no explanation. Keep it under 100 words.`;

    const result = await model.generateContent(videoPromptInstruction);
    const videoPrompt = result.response.text().trim();

    res.json({
      success: true,
      imagePrompt,
      videoPrompt
    });

  } catch (error) {
    console.error('[Prompt] Video prompt error:', error.message);
    res.status(500).json({ error: 'Failed to generate video prompt' });
  }
});

/**
 * Direct function export for use by other routes (like kickstarter)
 * Expands a simple prompt into detailed UGC-style prompt
 * @param {string} simplePrompt - The simple prompt to expand
 * @param {string} contextId - Optional context profile ID
 * @param {string} mode - 'ugc' (default) or 'talking'
 */
async function expandPromptDirect(simplePrompt, contextId = null, mode = 'ugc') {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY not configured');
  }

  // Load context profile if specified
  let contextString = '';
  if (contextId) {
    const profiles = contextProfileRoute.loadProfiles();
    const profile = profiles[contextId];
    if (profile) {
      contextString = `BRAND CONTEXT:\n${contextProfileRoute.profileToPromptContext(profile)}\n\n`;
    }
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Select prompt template based on mode
  let basePrompt;
  if (mode === 'talking' || mode === 'vfa') {
    basePrompt = VFA_PROMPT;
  } else if (mode === 'ovae') {
    basePrompt = TALKING_HEAD_PROMPT;
  } else {
    basePrompt = UGC_EXPANSION_PROMPT;
  }

  const expandedPrompt = basePrompt
    .replace('{{CONTEXT}}', contextString)
    .replace('{{INPUT}}', simplePrompt);

  const result = await model.generateContent(expandedPrompt);
  const response = await result.response;
  let text = response.text();

  // Clean up response
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Parse JSON
  const jsonPrompt = JSON.parse(text);

  // Convert to string
  return convertJsonToPrompt(jsonPrompt);
}

module.exports = router;
module.exports.expandPromptDirect = expandPromptDirect;

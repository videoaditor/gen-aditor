/**
 * Node Definitions
 * Each node is a reusable processing unit
 */

const vapVideo = require('../services/vap-video');
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

class WorkflowNode {
  constructor(id, type, config) {
    this.id = id;
    this.type = type;
    this.config = config || {};
    this.inputs = {};
    this.outputs = {};
  }

  async execute() {
    throw new Error('execute() must be implemented by subclass');
  }

  setInput(name, value) {
    this.inputs[name] = value;
  }

  getOutput(name) {
    return this.outputs[name];
  }
}

/**
 * INPUT NODE
 * Receives user input (script, URL, etc.)
 */
class InputNode extends WorkflowNode {
  async execute() {
    // Just pass through the configured value
    this.outputs.value = this.config.value || this.inputs.value;
    return this.outputs;
  }
}

/**
 * TEXT SPLITTER NODE
 * Splits text into chunks/scenes
 */
class TextSplitterNode extends WorkflowNode {
  async execute() {
    const text = this.inputs.text || '';
    const sentencesPerScene = this.config.sentencesPerScene || 2;
    const maxScenes = this.config.maxScenes || 10;

    // Clean text
    const cleanText = text
      .replace(/^###.*$/gm, '')   // Remove ### headers
      .replace(/\*[^*]*\*/g, '')  // Remove *annotations*
      .replace(/\[.*?\]/g, '')    // Remove [annotations]
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    // Split into sentences
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

    // Group into scenes
    const scenes = [];
    for (let i = 0; i < Math.min(sentences.length, maxScenes * sentencesPerScene); i += sentencesPerScene) {
      const sceneText = sentences.slice(i, i + sentencesPerScene).join(' ').trim();
      if (sceneText) {
        scenes.push({
          index: scenes.length,
          text: sceneText,
        });
      }
    }

    this.outputs.scenes = scenes;
    this.outputs.cleanText = cleanText;
    return this.outputs;
  }
}

/**
 * STYLE DETECTOR NODE
 * Analyzes text to determine visual style
 */
class StyleDetectorNode extends WorkflowNode {
  async execute() {
    const text = (this.inputs.text || '').toLowerCase();
    
    // Style detection rules (configurable)
    const rules = this.config.rules || {
      '3d-tech': /software|app|platform|automation|ai|data|cloud|future|innovation|cutting-edge/,
      'professional-minimal': /money|invest|business|revenue|profit|growth/,
      'organic-warm': /health|wellness|fitness|body|mind|energy/,
      'friendly-cartoon': /learn|teach|education|student|course|skill/,
      'bold-dynamic': /create|design|art|music|video|content/,
    };

    let detectedStyle = this.config.defaultStyle || 'modern-minimal';

    // Check each rule
    for (const [style, pattern] of Object.entries(rules)) {
      if (pattern.test(text)) {
        detectedStyle = style;
        break;
      }
    }

    this.outputs.style = detectedStyle;
    return this.outputs;
  }
}

/**
 * PROMPT BUILDER NODE
 * Builds image generation prompts from templates
 */
class PromptBuilderNode extends WorkflowNode {
  async execute() {
    const scene = this.inputs.scene || {};
    const style = this.inputs.style || 'modern-minimal';
    const sceneIndex = this.inputs.sceneIndex || 0;
    const totalScenes = this.inputs.totalScenes || 1;

    // Style templates (configurable)
    const styleTemplates = this.config.styleTemplates || {
      'modern-minimal': 'Clean modern minimal design, soft gradients, geometric shapes, pastel colors',
      '3d-tech': 'Futuristic 3D tech aesthetic, glowing elements, holographic effects, neon accents',
      'professional-minimal': 'Professional minimal design, charts and graphs, data visualization, corporate colors',
      'organic-warm': 'Warm organic style, natural colors, flowing shapes, soft textures',
      'friendly-cartoon': 'Friendly cartoon style, bold colors, simple shapes, playful, rounded edges',
      'bold-dynamic': 'Bold dynamic motion graphics, vibrant colors, energetic, abstract shapes',
    };

    const styleTemplate = styleTemplates[style] || styleTemplates['modern-minimal'];

    // Extract key concept
    const concept = this.extractConcept(scene.text || '');

    // Build prompt
    let prompt = this.config.foundation || 'Explainer video frame.';
    prompt += ` ${concept}. ${styleTemplate}. `;

    // Add text overlay if configured
    if (this.config.textOverlay && this.config.overlayPrompt && scene.text) {
      const overlayText = this.config.overlayPrompt.replace('{text}', scene.text);
      prompt += ` ${overlayText}. `;
    }

    // Add scene context
    if (sceneIndex === 0) {
      prompt += this.config.openingContext || 'Opening scene, introduction. ';
    } else if (sceneIndex === totalScenes - 1) {
      prompt += this.config.closingContext || 'Final scene, conclusion. ';
    } else {
      prompt += `Scene ${sceneIndex + 1} of ${totalScenes}. `;
    }

    // Add technical details
    prompt += this.config.technical || '16:9 aspect ratio, high quality illustration.';

    this.outputs.prompt = prompt;
    this.outputs.scene = scene;
    return this.outputs;
  }

  extractConcept(text) {
    const cleanText = text
      .toLowerCase()
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, '')
      .trim();
    return cleanText.substring(0, 80) || text.substring(0, 80);
  }
}

/**
 * IMAGE GENERATOR NODE
 * Generates image from prompt using VAP
 */
class ImageGeneratorNode extends WorkflowNode {
  async execute() {
    const prompt = this.inputs.prompt || '';
    
    // Support both aspectRatio and width/height
    let imageSize;
    if (this.config.width && this.config.height) {
      imageSize = `${this.config.width}x${this.config.height}`;
    } else if (this.config.aspectRatio) {
      const aspectRatio = this.config.aspectRatio;
      // Convert aspect ratio to size (assume 1080 height for vertical, 1920 width for horizontal)
      if (aspectRatio === '16:9') {
        imageSize = '1920x1080';
      } else if (aspectRatio === '9:16') {
        imageSize = '1080x1920';
      } else if (aspectRatio === '1:1') {
        imageSize = '1080x1080';
      } else {
        imageSize = '1920x1080';
      }
    } else {
      imageSize = '1920x1080';
    }

    try {
      const result = await vapVideo.generateImage({
        prompt,
        imageSize,
        model: this.config.model || 'fal-ai/flux-lora'
      });

      this.outputs.imageUrl = result.imageUrl;
      this.outputs.image_url = result.imageUrl; // Support both naming conventions
      this.outputs.cost = parseFloat(result.cost || 0);
      this.outputs.success = true;
      return this.outputs;

    } catch (error) {
      console.error(`Image generation failed:`, error.message);
      this.outputs.error = error.message;
      this.outputs.success = false;
      return this.outputs;
    }
  }
}

/**
 * LOOP NODE
 * Executes child nodes for each item in array
 */
class LoopNode extends WorkflowNode {
  constructor(id, type, config, childNodes) {
    super(id, type, config);
    this.childNodes = childNodes || [];
  }

  async execute() {
    const items = this.inputs.items || [];
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Execute child nodes with item as input
      const itemResults = {};
      for (const childNode of this.childNodes) {
        // Pass item and index to child
        childNode.setInput('item', item);
        childNode.setInput('index', i);
        childNode.setInput('total', items.length);
        
        // Execute
        await childNode.execute();
        
        // Collect outputs
        Object.assign(itemResults, childNode.outputs);
      }

      results.push(itemResults);

      // Progress callback
      if (this.config.onProgress) {
        this.config.onProgress((i + 1) / items.length);
      }
    }

    this.outputs.results = results;
    return this.outputs;
  }
}

/**
 * PROMPT NODE (LLM-based)
 * Uses Claude API to generate text from prompts
 */
class PromptNode extends WorkflowNode {
  async execute() {
    const model = this.config.model || 'anthropic/claude-sonnet-4-5';
    const systemPrompt = this.config.systemPrompt || '';
    let userPrompt = this.config.userPrompt || '';
    const outputFormat = this.config.outputFormat || 'text';
    
    // Replace placeholders in user prompt with input values
    for (const [key, value] of Object.entries(this.inputs)) {
      const placeholder = `{${key}}`;
      if (userPrompt.includes(placeholder)) {
        userPrompt = userPrompt.replace(new RegExp(placeholder, 'g'), value || '');
      }
    }
    
    try {
      const response = await anthropic.messages.create({
        model: model.replace('anthropic/', ''),
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      });
      
      const content = response.content[0].text;
      
      // Parse output based on format
      if (outputFormat === 'json') {
        try {
          this.outputs.output = JSON.parse(content);
        } catch (e) {
          // Try to extract JSON from markdown code blocks
          const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            this.outputs.output = JSON.parse(jsonMatch[1]);
          } else {
            throw new Error('Failed to parse JSON output');
          }
        }
      } else {
        this.outputs.output = content;
      }
      
      this.outputs.success = true;
      return this.outputs;
      
    } catch (error) {
      console.error(`Prompt node ${this.id} failed:`, error.message);
      this.outputs.error = error.message;
      this.outputs.success = false;
      return this.outputs;
    }
  }
}

/**
 * OUTPUT NODE
 * Collects final results
 */
class OutputNode extends WorkflowNode {
  async execute() {
    // Just collect all inputs as output
    this.outputs = { ...this.inputs };
    return this.outputs;
  }
}

module.exports = {
  WorkflowNode,
  InputNode,
  TextSplitterNode,
  StyleDetectorNode,
  PromptBuilderNode,
  PromptNode,
  ImageGeneratorNode,
  LoopNode,
  OutputNode,
};

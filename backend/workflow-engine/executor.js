/**
 * Workflow Execution Engine
 * Runs node graphs in correct order
 */

const {
  InputNode,
  TextSplitterNode,
  StyleDetectorNode,
  PromptBuilderNode,
  PromptNode,
  ImageGeneratorNode,
  LoopNode,
  OutputNode,
} = require('./nodes');

class WorkflowExecutor {
  constructor(workflowGraph) {
    this.graph = workflowGraph;
    this.nodes = new Map();
    this.results = {};
  }

  /**
   * Build nodes from graph definition
   */
  buildNodes() {
    for (const nodeDef of this.graph.nodes) {
      let node;

      switch (nodeDef.type) {
        case 'input':
          node = new InputNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        case 'text-splitter':
          node = new TextSplitterNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        case 'style-detector':
          node = new StyleDetectorNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        case 'prompt-builder':
          node = new PromptBuilderNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        case 'prompt':
          node = new PromptNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        case 'image-generator':
        case 'image_gen':
          node = new ImageGeneratorNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        case 'loop':
          // Loop nodes need special handling - build child nodes
          const childNodes = this.buildChildNodes(nodeDef.children || []);
          node = new LoopNode(nodeDef.id, nodeDef.type, nodeDef.config, childNodes);
          break;
        case 'output':
          node = new OutputNode(nodeDef.id, nodeDef.type, nodeDef.config);
          break;
        default:
          throw new Error(`Unknown node type: ${nodeDef.type}`);
      }

      this.nodes.set(nodeDef.id, node);
    }
  }

  /**
   * Build child nodes for loop
   */
  buildChildNodes(childDefs) {
    const childNodes = [];
    for (const childDef of childDefs) {
      let node;
      switch (childDef.type) {
        case 'prompt-builder':
          node = new PromptBuilderNode(childDef.id, childDef.type, childDef.config);
          break;
        case 'image-generator':
          node = new ImageGeneratorNode(childDef.id, childDef.type, childDef.config);
          break;
        default:
          throw new Error(`Unknown child node type: ${childDef.type}`);
      }
      childNodes.push(node);
    }
    return childNodes;
  }

  /**
   * Execute workflow
   */
  async execute(inputs = {}, onProgress = null) {
    this.buildNodes();

    // Set initial inputs
    for (const [key, value] of Object.entries(inputs)) {
      const inputNode = Array.from(this.nodes.values()).find(n => n.type === 'input');
      if (inputNode) {
        inputNode.config.value = value;
      }
    }

    // Build execution order (topological sort)
    const executionOrder = this.topologicalSort();

    // Execute nodes in order
    for (const nodeId of executionOrder) {
      const node = this.nodes.get(nodeId);

      // Set inputs from connected nodes
      const connections = this.graph.edges.filter(e => (e.target || e.to) === nodeId);
      for (const conn of connections) {
        const sourceId = conn.source || conn.from;
        const sourceNode = this.nodes.get(sourceId);
        
        if (!sourceNode) {
          console.warn(`Source node ${sourceId} not found for connection to ${nodeId}`);
          continue;
        }
        
        // Handle mapping from edge
        if (conn.mapping) {
          for (const [sourceKey, targetKey] of Object.entries(conn.mapping)) {
            const value = sourceNode.outputs[sourceKey];
            node.setInput(targetKey, value);
          }
        } else {
          // Fallback to simple output -> input
          const value = sourceNode.getOutput(conn.sourceHandle || 'output');
          node.setInput(conn.targetHandle || 'value', value);
        }
      }

      // Add progress callback for loop nodes
      if (node.type === 'loop' && onProgress) {
        node.config.onProgress = onProgress;
      }

      // Execute
      console.log(`  Executing node: ${nodeId} (${node.type})`);
      await node.execute();

      // Store results
      this.results[nodeId] = node.outputs;
    }

    // Return final output
    const outputNode = Array.from(this.nodes.values()).find(n => n.type === 'output');
    return outputNode ? outputNode.outputs : this.results;
  }

  /**
   * Topological sort for execution order
   */
  topologicalSort() {
    const visited = new Set();
    const sorted = [];

    const visit = (nodeId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      // Visit dependencies first
      const dependencies = this.graph.edges
        .filter(e => (e.target || e.to) === nodeId)
        .map(e => e.source || e.from);

      for (const dep of dependencies) {
        visit(dep);
      }

      sorted.push(nodeId);
    };

    // Start from nodes with no inputs (input nodes)
    for (const nodeDef of this.graph.nodes) {
      visit(nodeDef.id);
    }

    return sorted;
  }
}

module.exports = WorkflowExecutor;

import { useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data/peer/esm/vis-data";
import { Network } from "vis-network/standalone/esm/vis-network";
import "vis-network/styles/vis-network.css";
import { nodeTypeMeta } from "../../data/mockGraphData";
import type { GraphData, GraphNode } from "../../types/graph";
import { getNeighborIds, searchNodes } from "../../utils/graphUtils";
import GraphLegend from "./GraphLegend";

type VisNodeItem = {
  id: string;
  label: string;
  title: string;
  x?: number;
  y?: number;
  shape: "dot";
  size: number;
  color: {
    background: string;
    border: string;
    highlight: { background: string; border: string };
    hover: { background: string; border: string };
  };
  font: {
    color: string;
    size: number;
    face: string;
    strokeWidth: number;
    strokeColor: string;
  };
  borderWidth: number;
  shadow: {
    enabled: boolean;
    color: string;
    size: number;
    x: number;
    y: number;
  };
  fixed?: boolean | { x: boolean; y: boolean };
};

type VisEdgeItem = {
  id: string;
  from: string;
  to: string;
  label?: string;
  width: number;
  color: { color: string; highlight: string; hover: string; opacity: number };
  smooth: { enabled: boolean; type: "continuous"; roundness: number };
  selectionWidth: number;
};

type VisualOptions = {
  opacity?: number;
  shadowScale?: number;
  sizeDelta?: number;
};

type StarParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
};

type SearchRipple = {
  nodeId: string;
  start: number;
  delay: number;
  duration: number;
};

interface KnowledgeGraphProps {
  data: GraphData;
  selectedNodeId: string | null;
  searchQuery: string;
  focusRequest?: { nodeId: string; version: number } | null;
  onSelectNode: (node: GraphNode | null) => void;
  onSearchMiss: (query: string) => void;
  onSwitchLocal: (nodeId: string) => void;
  onDeleteNode?: (node: GraphNode) => void;
}

function colorWithAlpha(hex: string, alpha: number) {
  const resolved = resolveCssColor(hex);
  if (resolved.startsWith("rgb(")) return resolved.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  if (resolved.startsWith("rgba(")) return resolved.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
  if (!resolved.startsWith("#")) return resolved;
  const normalized = resolved.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveCssColor(value: string) {
  const match = value.match(/^var\((--[^)]+)\)$/);
  if (!match || typeof document === "undefined") return value;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || value;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function sizeForNode(node: GraphNode) {
  const base = node.type === "project" ? 12 : node.type === "document" ? 7 : 4.8;
  return base + Math.min((node.value ?? 8) / 7, 5);
}

function isImportantNode(node: GraphNode) {
  return node.type === "project" || node.type === "document" || (node.value ?? 0) >= 18;
}

function toVisNode(
  node: GraphNode,
  selected = false,
  dimmed = false,
  includePosition = true,
  visual: VisualOptions = {},
): VisNodeItem {
  const meta = nodeTypeMeta[node.type];
  const nodeColor = resolveCssColor(meta.color);
  const nodeGlow = resolveCssColor(meta.glow);
  const opacity = visual.opacity ?? (dimmed ? 0.26 : 0.92);
  const shadowScale = visual.shadowScale ?? 1;
  const labelVisible = selected || isImportantNode(node);
  const background = dimmed ? colorWithAlpha("var(--text-faint)", opacity) : colorWithAlpha(nodeColor, opacity);
  const sizeDelta = visual.sizeDelta ?? 0;

  return {
    id: node.id,
    label: node.label,
    title: node.label,
    ...(includePosition ? { x: node.x, y: node.y } : {}),
    shape: "dot",
    size: selected ? sizeForNode(node) + 4 + sizeDelta : sizeForNode(node) + sizeDelta,
    borderWidth: 0,
    color: {
      background,
      border: background,
      highlight: { background: nodeColor, border: resolveCssColor("var(--text-primary)") },
      hover: { background: nodeColor, border: resolveCssColor("var(--text-primary)") },
    },
    font: {
      color: labelVisible ? resolveCssColor("var(--text-primary)") : colorWithAlpha("var(--text-primary)", 0),
      size: labelVisible ? 18 : 0,
      face: "Geist, ui-sans-serif",
      strokeWidth: labelVisible ? 5 : 0,
      strokeColor: resolveCssColor("var(--page-bg)"),
    },
    shadow: {
      enabled: !dimmed && opacity > 0.12,
      color: nodeGlow,
      size: Math.round((selected ? 25 : 13) * shadowScale),
      x: 0,
      y: 0,
    },
  };
}

function toVisEdge(
  edge: GraphData["edges"][number],
  highlighted = false,
  dimmed = false,
  opacityScale = 1,
): VisEdgeItem {
  const baseAlpha = highlighted ? 0.88 : dimmed ? 0.14 : 0.34;
  const edgeColor = highlighted ? "var(--accent)" : dimmed ? "var(--text-faint)" : "var(--text-muted)";
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: undefined,
    width: highlighted ? 1.5 : dimmed ? 0.18 : Math.max(0.45, edge.weight ?? 0.55),
    color: {
      color: colorWithAlpha(edgeColor, baseAlpha * opacityScale),
      highlight: colorWithAlpha("var(--accent)", 0.95),
      hover: colorWithAlpha("var(--accent)", 0.9),
      opacity: Math.min(1, baseAlpha * opacityScale),
    },
    smooth: { enabled: true, type: "continuous", roundness: 0.28 },
    selectionWidth: 1.5,
  };
}

export default function KnowledgeGraph({
  data,
  selectedNodeId,
  searchQuery,
  focusRequest,
  onSelectNode,
  onSearchMiss,
  onSwitchLocal,
  onDeleteNode,
}: KnowledgeGraphProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<VisNodeItem> | null>(null);
  const edgesRef = useRef<DataSet<VisEdgeItem> | null>(null);
  const selectedRef = useRef<string | null>(selectedNodeId);
  const graphDataRef = useRef<GraphData>(data);
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map(data.nodes.map((node) => [node.id, node])));
  const onSelectNodeRef = useRef(onSelectNode);
  const onSearchMissRef = useRef(onSearchMiss);
  const onSwitchLocalRef = useRef(onSwitchLocal);
  const onDeleteNodeRef = useRef(onDeleteNode);
  const firstDataSyncRef = useRef(true);
  const hoverFrameRef = useRef<number | null>(null);
  const visualFrameRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const stabilizeTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const dragHighlightTimerRef = useRef<number | null>(null);
  const fitTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const starParticlesRef = useRef<StarParticle[]>([]);
  const ripplesRef = useRef<SearchRipple[]>([]);
  const draggingNodeRef = useRef<string | null>(null);

  function clearTimer(ref: React.MutableRefObject<number | null>) {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }

  function cancelTransition() {
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
  }

  function freezePhysics() {
    const network = networkRef.current;
    if (!network) return;
    network.stopSimulation();
    network.setOptions({ physics: false });
  }

  function enableInteractivePhysics() {
    const network = networkRef.current;
    if (!network) return;
    clearTimer(stabilizeTimerRef);
    clearTimer(settleTimerRef);
    network.setOptions({
      physics: {
        enabled: true,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -45,
          centralGravity: 0.015,
          springLength: 135,
          springConstant: 0.045,
          damping: 0.72,
          avoidOverlap: 0.25,
        },
        maxVelocity: 35,
        minVelocity: 0.35,
        timestep: 0.45,
        adaptiveTimestep: true,
        stabilization: false,
      },
    });
    network.startSimulation();
  }

  function settleAfterDrag(delay = 1200) {
    const network = networkRef.current;
    if (!network) return;
    clearTimer(settleTimerRef);
    network.startSimulation();
    settleTimerRef.current = window.setTimeout(() => {
      freezePhysics();
      releaseLocalPhysicsPins();
      draggingNodeRef.current = null;
    }, delay);
  }

  function scheduleFit(delay = 120) {
    clearTimer(fitTimerRef);
    fitTimerRef.current = window.setTimeout(() => {
      networkRef.current?.fit({
        minZoomLevel: 0.42,
        maxZoomLevel: 1.18,
        animation: { duration: 420, easingFunction: "easeInOutQuad" },
      });
    }, delay);
  }

  function focusSearchResult(nodeId: string) {
    const network = networkRef.current;
    if (!network) return;
    const currentScale = network.getScale();
    network.focus(nodeId, {
      scale: currentScale,
      animation: { duration: 620, easingFunction: "easeInOutQuad" },
    });
  }

  function stabilizeBriefly(iterations = 70) {
    const network = networkRef.current;
    if (!network) return;
    clearTimer(stabilizeTimerRef);
    network.setOptions({ physics: true });
    network.stabilize(iterations);
    stabilizeTimerRef.current = window.setTimeout(() => {
      freezePhysics();
    }, 900);
  }

  function getTwoHopRelatedIds(nodeId: string) {
    const graphData = graphDataRef.current;
    const firstHop = getNeighborIds(nodeId, graphData.edges);
    const related = new Set<string>([nodeId, ...firstHop]);
    firstHop.forEach((neighborId) => {
      getNeighborIds(neighborId, graphData.edges).forEach((secondHopId) => related.add(secondHopId));
    });
    return related;
  }

  function applyLocalPhysicsPins(nodeId: string) {
    const nodes = nodesRef.current;
    if (!nodes) return;
    const graphData = graphDataRef.current;
    const relatedIds = getTwoHopRelatedIds(nodeId);
    nodes.update(
      graphData.nodes.map((node) => ({
        id: node.id,
        fixed: relatedIds.has(node.id) ? false : { x: true, y: true },
      })),
    );
  }

  function releaseLocalPhysicsPins() {
    const nodes = nodesRef.current;
    if (!nodes) return;
    nodes.update(graphDataRef.current.nodes.map((node) => ({ id: node.id, fixed: false })));
  }

  function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
    const nextWidth = Math.max(1, Math.floor(width * dpr));
    const nextHeight = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }

  function syncCanvasSizes() {
    const host = containerRef.current;
    if (!host) return { width: 0, height: 0, dpr: 1 };
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (backgroundCanvasRef.current) resizeCanvas(backgroundCanvasRef.current, width, height, dpr);
    if (overlayCanvasRef.current) resizeCanvas(overlayCanvasRef.current, width, height, dpr);
    return { width, height, dpr };
  }

  function ensureStarParticles(width: number, height: number) {
    if (starParticlesRef.current.length > 0) return;
    starParticlesRef.current = Array.from({ length: 54 }, (_, index) => {
      const seed = index + 1;
      return {
        x: (seed * 97) % Math.max(width, 1),
        y: (seed * 53) % Math.max(height, 1),
        vx: (((seed * 17) % 11) - 5) * 0.004,
        vy: (((seed * 29) % 13) - 6) * 0.004,
        size: 0.7 + ((seed * 7) % 10) / 10,
        alpha: 0.12 + ((seed * 13) % 18) / 100,
        phase: seed * 0.57,
      };
    });
  }

  function getDomPosition(nodeId: string) {
    const network = networkRef.current;
    if (!network) return null;
    const positions = network.getPositions([nodeId]);
    const position = positions[nodeId];
    if (!position) return null;
    const dom = network.canvasToDOM(position);
    if (!Number.isFinite(dom.x) || !Number.isFinite(dom.y)) return null;
    return dom;
  }

  function drawBackground(now: number, width: number, height: number, dpr: number) {
    const canvas = backgroundCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ensureStarParticles(width, height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colorWithAlpha("var(--page-bg)", 0.18);
    ctx.fillRect(0, 0, width, height);

    const particles = starParticlesRef.current;
    particles.forEach((particle, index) => {
      particle.x = (particle.x + particle.vx * 16 + width) % width;
      particle.y = (particle.y + particle.vy * 16 + height) % height;
      const pulse = 0.65 + Math.sin(now / 1800 + particle.phase) * 0.35;
      ctx.beginPath();
      ctx.fillStyle = colorWithAlpha("var(--text-secondary)", particle.alpha * pulse);
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();

      if (index % 9 === 0) {
        ctx.beginPath();
        ctx.fillStyle = colorWithAlpha("var(--accent-strong)", 0.035 * pulse);
        ctx.arc(particle.x, particle.y, particle.size * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawOverlay(now: number, width: number, height: number, dpr: number) {
    const canvas = overlayCanvasRef.current;
    const network = networkRef.current;
    if (!canvas || !network) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const graphData = graphDataRef.current;
    const visibleNodes = nodesRef.current;
    const importantNodes = graphData.nodes.filter((node) => isImportantNode(node) && visibleNodes?.get(node.id)).slice(0, 24);
    importantNodes.forEach((node, index) => {
      const position = getDomPosition(node.id);
      if (!position) return;
      const meta = nodeTypeMeta[node.type];
      const nodeColor = resolveCssColor(meta.color);
      const pulse = 0.5 + Math.sin(now / 1500 + index * 0.6) * 0.5;
      const radius = node.type === "project" ? 24 + pulse * 6 : 14 + pulse * 4;
      const gradient = ctx.createRadialGradient(position.x, position.y, 0, position.x, position.y, radius);
      gradient.addColorStop(0, colorWithAlpha(nodeColor, 0.12 + pulse * 0.05));
      gradient.addColorStop(1, colorWithAlpha(nodeColor, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    const activeId = hoveredNodeRef.current ?? selectedRef.current;
    if (activeId) {
      const neighborIds = getNeighborIds(activeId, graphData.edges);
      const activeEdges = graphData.edges
        .filter((edge) => edge.from === activeId || edge.to === activeId || (neighborIds.has(edge.from) && neighborIds.has(edge.to)))
        .slice(0, 20);

      activeEdges.forEach((edge, index) => {
        const from = getDomPosition(edge.from);
        const to = getDomPosition(edge.to);
        if (!from || !to) return;
        const phase = (now / 1450 + index * 0.11) % 1;
        const particleX = from.x + (to.x - from.x) * phase;
        const particleY = from.y + (to.y - from.y) * phase;
        ctx.strokeStyle = colorWithAlpha("var(--accent)", 0.14);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        const glow = ctx.createRadialGradient(particleX, particleY, 0, particleX, particleY, 12);
        glow.addColorStop(0, colorWithAlpha("var(--accent)", 0.52));
        glow.addColorStop(1, colorWithAlpha("var(--accent-strong)", 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(particleX, particleY, 12, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    const activeRipples = ripplesRef.current.filter((ripple) => now - ripple.start - ripple.delay < ripple.duration);
    ripplesRef.current = activeRipples;
    activeRipples.forEach((ripple) => {
      const elapsed = now - ripple.start - ripple.delay;
      if (elapsed < 0) return;
      const progress = Math.min(1, elapsed / ripple.duration);
      const position = getDomPosition(ripple.nodeId);
      if (!position) return;
      const radius = 14 + progress * 46;
      const alpha = (1 - progress) * 0.42;
      ctx.strokeStyle = colorWithAlpha("var(--accent-strong)", alpha);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function startVisualLoop() {
    const frame = (now: number) => {
      const { width, height, dpr } = syncCanvasSizes();
      if (width > 0 && height > 0) {
        drawBackground(now, width, height, dpr);
        drawOverlay(now, width, height, dpr);
      }
      visualFrameRef.current = window.requestAnimationFrame(frame);
    };
    visualFrameRef.current = window.requestAnimationFrame(frame);
  }

  function revealGraph(duration = 650) {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!nodes || !edges) return;
    cancelTransition();
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(progress);
      const graphData = graphDataRef.current;
      nodes.update(
        graphData.nodes.map((node) =>
          toVisNode(node, node.id === selectedRef.current, false, false, {
            opacity: 0.05 + eased * 0.87,
            shadowScale: 0.25 + eased * 0.75,
          }),
        ),
      );
      edges.update(graphData.edges.map((edge) => toVisEdge(edge, false, false, 0.08 + eased * 0.92)));
      if (progress < 1) {
        transitionFrameRef.current = window.requestAnimationFrame(step);
      } else {
        transitionFrameRef.current = null;
        paintGraph(selectedRef.current);
      }
    };
    transitionFrameRef.current = window.requestAnimationFrame(step);
  }

  function fadeGraphOut(graphData: GraphData, done: () => void) {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!nodes || !edges) {
      done();
      return;
    }
    cancelTransition();
    const start = performance.now();
    const duration = 180;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const opacity = Math.max(0.04, 1 - progress);
      nodes.update(
        graphData.nodes.map((node) =>
          toVisNode(node, node.id === selectedRef.current, false, false, {
            opacity,
            shadowScale: Math.max(0.25, opacity),
          }),
        ),
      );
      edges.update(graphData.edges.map((edge) => toVisEdge(edge, false, false, opacity)));
      if (progress < 1) {
        transitionFrameRef.current = window.requestAnimationFrame(step);
      } else {
        transitionFrameRef.current = null;
        done();
      }
    };
    transitionFrameRef.current = window.requestAnimationFrame(step);
  }

  function addRipple(nodeId: string) {
    const now = performance.now();
    ripplesRef.current.push(
      { nodeId, start: now, delay: 0, duration: 760 },
      { nodeId, start: now, delay: 210, duration: 760 },
    );
  }

  function paintGraph(focusId?: string | null) {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!nodes || !edges) return;

    const graphData = graphDataRef.current;
    const activeId = focusId ?? draggingNodeRef.current ?? selectedRef.current;
    const activeNodeVisible = activeId ? nodes.get(activeId) : null;

    if (!activeId || !activeNodeVisible) {
      nodes.update(graphData.nodes.map((node) => toVisNode(node, false, false, false)));
      edges.update(graphData.edges.map((edge) => toVisEdge(edge)));
      return;
    }

    const neighbors = getNeighborIds(activeId, graphData.edges);
    const relatedIds = new Set<string>([activeId, ...neighbors]);
    nodes.update(
      graphData.nodes.map((node) =>
        toVisNode(node, node.id === activeId, !relatedIds.has(node.id), false, {
          sizeDelta: node.id === activeId ? 0.8 : 0,
          shadowScale: node.id === activeId ? 1.35 : 1,
        }),
      ),
    );
    edges.update(
      graphData.edges.map((edge) =>
        toVisEdge(
          edge,
          edge.from === activeId || edge.to === activeId,
          !(relatedIds.has(edge.from) && relatedIds.has(edge.to)),
        ),
      ),
    );
  }

  function scheduleHoverPaint(nodeId: string | null) {
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
    }
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      paintGraph(nodeId);
    });
  }

  function syncDataSets(nextData: GraphData, hidden = false) {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!nodes || !edges) return;

    const nextNodeIds = new Set(nextData.nodes.map((node) => node.id));
    const nextEdgeIds = new Set(nextData.edges.map((edge) => edge.id));
    const currentNodeIds = new Set(nodes.getIds().map(String));
    const currentEdgeIds = new Set(edges.getIds().map(String));
    const opacity = hidden ? 0.04 : 0.92;

    const removedEdges = [...currentEdgeIds].filter((id) => !nextEdgeIds.has(id));
    const removedNodes = [...currentNodeIds].filter((id) => !nextNodeIds.has(id));
    if (removedEdges.length > 0) edges.remove(removedEdges);
    if (removedNodes.length > 0) nodes.remove(removedNodes);

    nodes.update(
      nextData.nodes.map((node) =>
        toVisNode(node, node.id === selectedRef.current, false, !currentNodeIds.has(node.id), {
          opacity,
          shadowScale: hidden ? 0.25 : 1,
        }),
      ),
    );
    edges.update(nextData.edges.map((edge) => toVisEdge(edge, false, false, hidden ? 0.08 : 1)));
    if (!hidden) paintGraph(nextNodeIds.has(selectedRef.current ?? "") ? selectedRef.current : null);
  }

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  useEffect(() => {
    onSearchMissRef.current = onSearchMiss;
  }, [onSearchMiss]);

  useEffect(() => {
    onSwitchLocalRef.current = onSwitchLocal;
  }, [onSwitchLocal]);

  useEffect(() => {
    onDeleteNodeRef.current = onDeleteNode;
  }, [onDeleteNode]);

  useEffect(() => {
    if (!containerRef.current || networkRef.current) return;

    const initialData = graphDataRef.current;
    const visNodes = new DataSet<VisNodeItem>(
      initialData.nodes.map((node) =>
        toVisNode(node, node.id === selectedRef.current, true, true, {
          opacity: 0.04,
          shadowScale: 0.2,
        }),
      ),
    );
    const visEdges = new DataSet<VisEdgeItem>(initialData.edges.map((edge) => toVisEdge(edge, false, false, 0.08)));
    nodesRef.current = visNodes;
    edgesRef.current = visEdges;

    const network = new Network(
      containerRef.current,
      { nodes: visNodes, edges: visEdges },
      {
        autoResize: true,
        layout: {
          improvedLayout: false,
          randomSeed: 13,
        },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -45,
            centralGravity: 0.015,
            springLength: 135,
            springConstant: 0.045,
            damping: 0.72,
            avoidOverlap: 0.25,
          },
          maxVelocity: 35,
          minVelocity: 0.35,
          timestep: 0.45,
          adaptiveTimestep: true,
          stabilization: {
            enabled: true,
            iterations: 180,
            updateInterval: 20,
            fit: false,
          },
        },
        nodes: {
          shape: "dot",
          borderWidth: 0,
          scaling: {
            min: 3,
            max: 18,
          },
        },
        edges: {
          hoverWidth: 1.2,
          smooth: true,
        },
        interaction: {
          hover: true,
          dragNodes: true,
          dragView: true,
          zoomView: true,
          multiselect: false,
          tooltipDelay: 60,
        },
      },
    );

    networkRef.current = network;
    syncCanvasSizes();
    startVisualLoop();

    network.on("hoverNode", (params) => {
      const id = String(params.node);
      if (hoveredNodeRef.current === id) return;
      hoveredNodeRef.current = id;
      scheduleHoverPaint(id);
    });

    network.on("blurNode", () => {
      hoveredNodeRef.current = null;
      scheduleHoverPaint(draggingNodeRef.current ?? selectedRef.current);
    });

    network.on("dragStart", (params) => {
      const id = params.nodes?.[0] ? String(params.nodes[0]) : null;
      if (!id) return;
      draggingNodeRef.current = id;
      clearTimer(dragHighlightTimerRef);
      clearTimer(settleTimerRef);
      applyLocalPhysicsPins(id);
      paintGraph(id);
      enableInteractivePhysics();
    });

    network.on("dragging", (params) => {
      const id = params.nodes?.[0] ? String(params.nodes[0]) : draggingNodeRef.current;
      if (!id || hoveredNodeRef.current === id) return;
      hoveredNodeRef.current = id;
      scheduleHoverPaint(id);
    });

    network.on("dragEnd", (params) => {
      const id = params.nodes?.[0] ? String(params.nodes[0]) : draggingNodeRef.current;
      if (!id) return;
      draggingNodeRef.current = id;
      paintGraph(id);
      settleAfterDrag(1200);
      clearTimer(dragHighlightTimerRef);
      dragHighlightTimerRef.current = window.setTimeout(() => {
        if (draggingNodeRef.current === id) {
          draggingNodeRef.current = null;
          hoveredNodeRef.current = null;
          paintGraph(selectedRef.current);
        }
      }, 1050);
    });

    network.on("click", (params) => {
      setContextMenu(null);
      const id = params.nodes?.[0] ? String(params.nodes[0]) : null;
      selectedRef.current = id;
      onSelectNodeRef.current(id ? (nodeMapRef.current.get(id) ?? null) : null);
      paintGraph(id);
      if (id) {
        addRipple(id);
      }
    });

    network.on("oncontext", (params) => {
      params.event.preventDefault();
      const nodeId = network.getNodeAt(params.pointer.DOM);
      if (!nodeId) {
        setContextMenu(null);
        return;
      }
      const node = nodeMapRef.current.get(String(nodeId));
      if (!node) return;
      selectedRef.current = node.id;
      onSelectNodeRef.current(node);
      paintGraph(node.id);
      setContextMenu({ x: params.pointer.DOM.x, y: params.pointer.DOM.y, node });
    });

    network.on("doubleClick", (params) => {
      const id = params.nodes?.[0] ? String(params.nodes[0]) : null;
      if (!id) return;
      selectedRef.current = id;
      onSelectNodeRef.current(nodeMapRef.current.get(id) ?? null);
      addRipple(id);
      onSwitchLocalRef.current(id);
    });

    network.once("stabilizationIterationsDone", () => {
      freezePhysics();
      scheduleFit(80);
      revealGraph(720);
    });

    network.on("stabilized", () => {
      if (draggingNodeRef.current || settleTimerRef.current !== null) return;
      freezePhysics();
    });

    if ("ResizeObserver" in window) {
      resizeObserverRef.current = new ResizeObserver(() => {
        clearTimer(resizeTimerRef);
        resizeTimerRef.current = window.setTimeout(() => {
          syncCanvasSizes();
          networkRef.current?.redraw();
        }, 180);
      });
      resizeObserverRef.current.observe(containerRef.current);
    }

    return () => {
      if (hoverFrameRef.current !== null) window.cancelAnimationFrame(hoverFrameRef.current);
      if (visualFrameRef.current !== null) window.cancelAnimationFrame(visualFrameRef.current);
      cancelTransition();
      clearTimer(stabilizeTimerRef);
      clearTimer(settleTimerRef);
      clearTimer(dragHighlightTimerRef);
      clearTimer(fitTimerRef);
      clearTimer(resizeTimerRef);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
      edgesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!networkRef.current || !nodesRef.current || !edgesRef.current) return;

    if (firstDataSyncRef.current) {
      firstDataSyncRef.current = false;
      graphDataRef.current = data;
      nodeMapRef.current = new Map(data.nodes.map((node) => [node.id, node]));
      return;
    }

    const previousData = graphDataRef.current;
    fadeGraphOut(previousData, () => {
      graphDataRef.current = data;
      nodeMapRef.current = new Map(data.nodes.map((node) => [node.id, node]));
      syncDataSets(data, true);
      stabilizeBriefly(70);
      window.setTimeout(() => revealGraph(520), 520);
    });
  }, [data]);

  useEffect(() => {
    selectedRef.current = selectedNodeId;
    paintGraph(selectedNodeId);
  }, [selectedNodeId]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || !networkRef.current) return;

    const searchTimer = window.setTimeout(() => {
      const results = searchNodes(graphDataRef.current.nodes, query);
      const target = results[0];
      if (!target) {
        onSearchMissRef.current(query);
        return;
      }
      selectedRef.current = target.id;
      onSelectNodeRef.current(target);
      paintGraph(target.id);
      addRipple(target.id);
      networkRef.current?.selectNodes([target.id]);
      focusSearchResult(target.id);
    }, 160);

    return () => window.clearTimeout(searchTimer);
  }, [searchQuery]);

  useEffect(() => {
    if (!focusRequest?.nodeId || !networkRef.current) return;
    const target = nodeMapRef.current.get(focusRequest.nodeId);
    if (!target) return;
    selectedRef.current = target.id;
    onSelectNodeRef.current(target);
    paintGraph(target.id);
    addRipple(target.id);
    networkRef.current.selectNodes([target.id]);
    focusSearchResult(target.id);
  }, [focusRequest?.version]);

  return (
    <div className="knowledge-graph-frame graph-glass-frame starfield graph-canvas graph-shadow relative min-w-0 overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--page-bg)]">
      <canvas ref={backgroundCanvasRef} className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
      <div ref={containerRef} className="relative z-10 h-full w-full" />
      <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 z-[12]" aria-hidden="true" />
      {contextMenu && (
        <div
          className="absolute z-30 w-44 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2 text-sm shadow-glass backdrop-blur-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              onSelectNode(contextMenu.node);
              setContextMenu(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            查看详情
          </button>
          <button
            type="button"
            onClick={() => {
              onSwitchLocal(contextMenu.node.id);
              setContextMenu(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            高亮关联
          </button>
          <button
            type="button"
            onClick={() => {
              onDeleteNodeRef.current?.(contextMenu.node);
              setContextMenu(null);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-[var(--danger)] transition hover:bg-[var(--danger-bg)]"
          >
            删除节点
          </button>
        </div>
      )}
      {data.nodes.length === 0 && (
        <div className="scrim-soft pointer-events-none absolute inset-0 z-20 grid place-items-center px-8 text-center backdrop-blur-[1px]">
          <div className="empty-orbit max-w-lg rounded-3xl p-8">
            <p className="text-sm text-[var(--accent)]">空星图</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">导入资料后生成第一组知识节点</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
              上传项目文档、课程笔记或比赛材料，系统会自动抽取文档节点、知识节点和关系边。
            </p>
          </div>
        </div>
      )}
      <GraphLegend />
      <div className="graph-corner-note pointer-events-none absolute right-5 top-5 z-20 rounded-2xl border border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-muted)] backdrop-blur-xl">
        稳定布局 · 动态光效 · 双击局部图谱
      </div>
    </div>
  );
}

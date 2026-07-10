import type { ParseDiagnostics } from "./document";

export type GraphNodeType =
  | "project"
  | "document"
  | "tech"
  | "problem"
  | "output"
  | "tag"
  | "concept";

export type GraphRelationType =
  | "mentions"
  | "belongs_to"
  | "uses"
  | "depends_on"
  | "solves"
  | "generates"
  | "related_to"
  | "proves"
  | "references"
  | "custom";

export type GraphLayoutMode = "auto" | "stable" | "free";

export interface GraphNode {
  id: string;
  workspaceId?: string;
  label: string;
  type: GraphNodeType;
  group: string;
  description?: string;
  sourceDocumentIds?: string[];
  value?: number;
  confidence?: number;
  cluster?: string;
  x?: number;
  y?: number;
  fixed?: boolean;
  layoutMode?: GraphLayoutMode;
  positionUpdatedAt?: string;
  positionUpdatedBy?: string;
  manualPosition?: boolean;
  analysisProvider?: string;
  analysisSourceStatus?: "api" | "mock" | "local_rule";
  analyzedAt?: string;
  tags?: string[];
  sourceNote?: string;
  isManual?: boolean;
  isRoot?: boolean;
  originalDescription?: string;
  userDescription?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface GraphEdge {
  id: string;
  workspaceId?: string;
  from: string;
  to: string;
  label?: string;
  relationType: GraphRelationType;
  description?: string;
  isBidirectional?: boolean;
  isManual?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  weight?: number;
  confidence?: number;
  evidence?: string;
  analysisProvider?: string;
  analysisSourceStatus?: "api" | "mock" | "local_rule";
  analyzedAt?: string;
}

export interface SourceReference {
  sourceType?: "local" | "web";
  workspaceId?: string;
  documentId: string;
  documentTitle: string;
  snippet: string;
  score?: number;
  nodeId?: string;
  nodeLabel?: string;
  chunkId?: string;
  isParsed?: boolean;
  siteName?: string;
  url?: string;
  retrievedAt?: string;
}

export interface AnalysisResult {
  title: string;
  type: string;
  summary: string;
  keywords: string[];
  entities: GraphNode[];
  relations: GraphEdge[];
  outputs: string[];
  sources: SourceReference[];
  confidence: number;
  parsing?: ParseDiagnostics;
  provider?: string;
  sourceStatus?: "api" | "mock" | "local_rule";
  analyzedAt?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeTypeMeta {
  label: string;
  color: string;
  glow: string;
}

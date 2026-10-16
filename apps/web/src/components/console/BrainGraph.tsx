"use client";

// The Obsidian Neural Core: every vault note as a node. Notes light up as
// Friday recalls, reads or writes them (live over /api/neural/stream).
// Click a node to read it in a drawer and open it in Obsidian.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { useThoughts } from "@/components/deck/NeuralCore";
import { layout, matchNode, obsidianUri, type GraphNode } from "@/lib/vault-graph";
import { useResource } from "./useResource";

interface Graph {
  vaultName?: string;
  nodes?: GraphNode[];
  edges?: Array<[string, string]>;
  error?: string;
}

const SAMPLE: Graph = {
  vaultName: "Sample",
  nodes: [
    { id: "SAMPLE/Friday.md", name: "SAMPLE Friday", folder: "SAMPLE", links: 1 },
    { id: "SAMPLE/Note.md", name: "SAMPLE Note", folder: "SAMPLE", links: 1 },
  ],
  edges: [["SAMPLE/Friday.md", "SAMPLE/Note.md"]],
};

const LIT_MS = 12_000;

export function BrainGraph({ compact = false }: { compact?: boolean }) {
  const graph = useResource<Graph>("/api/neural/graph", SAMPLE);
  const thoughts = useThoughts();
  const nodes = useMemo(() => graph.data?.nodes || [], [graph.data]);
  const edges = useMemo(() => graph.data?.edges || [], [graph.data]);
  const positions = useMemo(() => layout(nodes), [nodes]);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [lit, setLit] = useState<Map<string, { at: number; kind: string }>>(new Map());
  const [view, setView] = useState({ x: 0, y: 0, k: compact ? 0.35 : 0.6 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const folders = useMemo(() => Array.from(new Set(nodes.map((node) => node.folder))).sort(), [nodes]);

  useEffect(() => {
    if (!nodes.length) return;
    setLit((current) => {
      const next = new Map(current);
      for (const thought of thoughts) {
        const at = Date.parse(thought.at);
        if (Date.now() - at > LIT_MS * 5) continue;
        const id = matchNode(nodes, thought.label, thought.detail);
        if (id && (next.get(id)?.at || 0) < at) next.set(id, { at, kind: thought.kind });
      }
      return next;
    });
  }, [thoughts, nodes]);

  const visible = useCallback(
    (node: GraphNode) => (!folder || node.folder === folder) && (!query || node.name.toLowerCase().includes(query.toLowerCase())),
    [folder, query]
  );

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.translate(rect.width / 2 + view.x, rect.height / 2 + view.y);
      ctx.scale(view.k, view.k);
      const now = Date.now();
      const filtering = Boolean(query || folder);
      ctx.lineWidth = 1 / view.k;
      ctx.strokeStyle = "rgba(94,220,255,0.10)";
      ctx.beginPath();
      for (const [a, b] of edges) {
        const pa = positions.get(a);
        const pb = positions.get(b);
        if (!pa || !pb) continue;
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();
      let animating = false;
      for (const node of nodes) {
        const p = positions.get(node.id);
        if (!p) continue;
        const on = visible(node);
        const glow = lit.get(node.id);
        const age = glow ? now - glow.at : Infinity;
        const r = (2.5 + Math.min(8, Math.sqrt(node.links) * 1.5)) / Math.max(0.6, view.k);
        if (age < LIT_MS) {
          animating = true;
          const pulse = 1 - age / LIT_MS;
          ctx.fillStyle = glow!.kind === "learning" ? `rgba(236,184,64,${0.35 * pulse})` : `rgba(94,220,255,${0.35 * pulse})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * (3 + 2 * pulse), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = node.id === selected ? "#ffffff" : age < LIT_MS ? (glow!.kind === "learning" ? "#ecb840" : "#5edcff") : on ? (filtering ? "#ecb840" : "rgba(214,40,56,0.85)") : "rgba(120,62,66,0.25)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if ((filtering && on) || age < LIT_MS || node.id === selected || view.k > 1.4) {
          ctx.fillStyle = "rgba(236,238,241,0.9)";
          ctx.font = `${11 / view.k}px ui-sans-serif`;
          ctx.fillText(node.name, p.x + r + 2 / view.k, p.y + 3 / view.k);
        }
      }
      if (animating) frame = window.setTimeout(() => requestAnimationFrame(draw), 80) as unknown as number;
    };
    requestAnimationFrame(draw);
    return () => window.clearTimeout(frame);
  }, [nodes, edges, positions, lit, view, selected, visible, query, folder]);

  function nodeAt(clientX: number, clientY: number): string | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - rect.width / 2 - view.x) / view.k;
    const y = (clientY - rect.top - rect.height / 2 - view.y) / view.k;
    let best: string | null = null;
    let bestDist = (12 / view.k) ** 2;
    for (const node of nodes) {
      if (!visible(node)) continue;
      const p = positions.get(node.id)!;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestDist) {
        best = node.id;
        bestDist = d;
      }
    }
    return best;
  }

  const matches = query ? nodes.filter(visible).slice(0, 8) : [];
  const litCount = Array.from(lit.values()).filter((value) => Date.now() - value.at < LIT_MS).length;

  return (
    <div className={`relative flex min-h-0 flex-col rounded-lg border border-line bg-[#07060a] ${compact ? "h-full" : "h-[calc(100vh-11rem)]"}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <span className="font-mono uppercase tracking-[0.2em] text-info">Neural Core</span>
        <span className="text-faint">{graph.loading ? "loading vault" : `${nodes.length} notes · ${edges.length} links${litCount ? ` · ${litCount} live` : ""}`}</span>
        <div className="ml-auto flex items-center gap-1 rounded border border-line bg-app px-2">
          <Search className="h-3 w-3 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a note" aria-label="Find a note" className="h-7 w-32 bg-transparent text-ink outline-none" />
        </div>
        {!compact && (
          <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Filter by folder" className="h-7 rounded border border-line bg-app px-1 text-ink">
            <option value="">All folders</option>
            {folders.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
      </div>
      {graph.error && <p className="p-4 text-sm text-danger">{graph.error}</p>}
      {matches.length > 0 && (
        <ul className="absolute left-3 top-12 z-10 w-64 rounded border border-line bg-panel p-1 text-sm shadow-lg">
          {matches.map((node) => (
            <li key={node.id}>
              <button type="button" className="w-full truncate rounded px-2 py-1 text-left text-ink hover:bg-raised" onClick={() => {
                const p = positions.get(node.id)!;
                setView((v) => ({ ...v, x: -p.x * v.k, y: -p.y * v.k }));
                setSelected(node.id);
              }}>{node.name} <span className="text-xs text-faint">{node.folder}</span></button>
            </li>
          ))}
        </ul>
      )}
      <canvas
        ref={canvasRef}
        className="min-h-0 w-full flex-1 cursor-grab"
        onWheel={(e) => setView((v) => ({ ...v, k: Math.min(6, Math.max(0.08, v.k * (e.deltaY < 0 ? 1.15 : 0.87))) }))}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
          if (d.moved) {
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
            drag.current = { x: e.clientX, y: e.clientY, moved: true };
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) setSelected(nodeAt(e.clientX, e.clientY));
        }}
      />
      {selected && <NoteDrawer path={selected} vaultName={graph.data?.vaultName || ""} onClose={() => setSelected(null)} />}
    </div>
  );
}

function NoteDrawer({ path, vaultName, onClose }: { path: string; vaultName: string; onClose: () => void }) {
  const note = useResource<{ path?: string; content?: string; modified?: string; error?: string }>(
    `/api/neural/note?path=${encodeURIComponent(path)}`,
    { path, content: "SAMPLE note. Demo mode does not read the vault." }
  );
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-line bg-panel shadow-xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={path}>{path}</p>
        <a href={obsidianUri(vaultName, path)} className="inline-flex items-center gap-1 text-xs text-brass hover:underline">
          Open in Obsidian <ExternalLink className="h-3 w-3" />
        </a>
        <button type="button" aria-label="Close note" onClick={onClose} className="rounded p-1 text-faint hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      {note.loading && <p className="p-4 text-sm text-muted">Reading the note…</p>}
      {note.error && <p className="p-4 text-sm text-danger">{note.error}</p>}
      {note.data?.modified && <p className="px-4 pt-3 text-xs text-faint">Edited {new Date(note.data.modified).toLocaleString()}</p>}
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed text-ink">{note.data?.content}</pre>
    </aside>
  );
}
// Layout and matching helpers for the Brain graph. Pure, so they are tested.

export interface GraphNode {
  id: string;
  name: string;
  folder: string;
  links: number;
}

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Folders sit around a ring; each note lands inside its folder's cluster.
export function layout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const folders = Array.from(new Set(nodes.map((node) => node.folder))).sort();
  const out = new Map<string, { x: number; y: number }>();
  folders.forEach((folder, index) => {
    const members = nodes.filter((node) => node.folder === folder);
    const angle = (index / Math.max(1, folders.length)) * Math.PI * 2;
    const ring = folders.length > 1 ? 420 : 0;
    const cx = Math.cos(angle) * ring;
    const cy = Math.sin(angle) * ring;
    const spread = 40 + Math.sqrt(members.length) * 14;
    for (const node of members) {
      const a = hash(node.id) * Math.PI * 2;
      const r = Math.sqrt(hash(`${node.id}#r`)) * spread;
      out.set(node.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  });
  return out;
}

function key(text: string): string {
  return text.replace(/\\/g, "/").split("/").pop()!.replace(/\.md$/i, "").trim().toLowerCase();
}

// Which node a thought (label + detail path) is about, if any.
export function matchNode(nodes: GraphNode[], label: string, detail: string): string | null {
  const path = detail.replace(/\\/g, "/").toLowerCase();
  const exact = nodes.find((node) => node.id.toLowerCase() === path || path.endsWith(`/${node.id.toLowerCase()}`));
  if (exact) return exact.id;
  const wanted = [key(detail), key(label)];
  const byName = nodes.find((node) => wanted.includes(node.name.toLowerCase()));
  return byName ? byName.id : null;
}

export function obsidianUri(vaultName: string, notePath: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(notePath.replace(/\.md$/i, ""))}`;
}
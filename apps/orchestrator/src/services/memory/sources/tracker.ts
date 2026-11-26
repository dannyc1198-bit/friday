import { readFile } from "fs/promises";
import path from "path";
import { tasksFromStore, overdueTasks, type NormalizedTask } from "../../task-store.js";
import { writeNote, type WriteFolder } from "./obsidian.js";
import type { PortItemInput } from "../port-db.js";

export interface Project {
  name: string;
  status: "current" | "upcoming" | "paused" | "done";
  nextStep: string;
  due?: string;
  updated?: string;
}

const STATUSES = new Set<Project["status"]>(["current", "upcoming", "paused", "done"]);

export function parseProjects(markdown: string): Project[] {
  const projects: Project[] = [];
  let status: Project["status"] = "current";
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(current|upcoming|paused|done)\b/i);
    if (heading) {
      status = heading[1].toLowerCase() as Project["status"];
      continue;
    }
    const item = line.match(/^- \*\*(.+?)\*\*(.*)$/);
    if (!item) continue;
    const rest = item[2];
    projects.push({
      name: item[1].trim(),
      status,
      nextStep: rest.match(/next:\s*([^.]*)/i)?.[1].trim() || "",
      due: rest.match(/due:\s*(\d{4}-\d{2}-\d{2})/i)?.[1],
      updated: rest.match(/updated:\s*(\d{4}-\d{2}-\d{2})/i)?.[1],
    });
  }
  return projects;
}

export function renderProjects(projects: Project[]): string {
  const lines = ["# Projects", "", "Jarvis keeps this note in sync with the project tracker.", ""];
  for (const status of ["current", "upcoming", "paused", "done"] as const) {
    lines.push(`## ${status[0].toUpperCase()}${status.slice(1)}`, "");
    const rows = projects.filter((project) => project.status === status);
    if (rows.length === 0) {
      lines.push("_None._", "");
      continue;
    }
    for (const project of rows) {
      const next = project.nextStep ? ` Next: ${project.nextStep}.` : "";
      const due = project.due ? ` due: ${project.due}.` : "";
      const updated = project.updated ? ` updated: ${project.updated}.` : "";
      lines.push(`- **${project.name}**.${next}${due}${updated}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function isQuietHours(now: Date, spec = "23:00-05:30"): boolean {
  const [start, end] = spec.split("-");
  const minutes = (value: string) => {
    const [hour, minute] = value.split(":").map((part) => Number(part));
    return hour * 60 + (minute || 0);
  };
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutes(start || "23:00");
  const to = minutes(end || "05:30");
  if (from <= to) return current >= from && current < to;
  return current >= from || current < to;
}

export function suggestOneStep(input: {
  projects: Project[];
  tasks?: NormalizedTask[];
  now?: Date;
  stallDays?: number;
}): string | null {
  const now = input.now || new Date();
  const stallDays = input.stallDays ?? 3;
  const open = input.projects.filter((project) => project.status === "current" || project.status === "upcoming");
  const ranked = open
    .map((project) => {
      const updated = project.updated ? Date.parse(`${project.updated}T12:00:00`) : now.getTime();
      const ageDays = (now.getTime() - updated) / 86_400_000;
      const dueSoon = project.due ? (Date.parse(`${project.due}T12:00:00`) - now.getTime()) / 86_400_000 <= 2 : false;
      return { project, ageDays, dueSoon };
    })
    .filter((row) => row.project.nextStep && (row.ageDays >= stallDays || row.dueSoon))
    .sort((a, b) => Number(b.dueSoon) - Number(a.dueSoon) || b.ageDays - a.ageDays);
  if (ranked[0]) {
    return `Next step on ${ranked[0].project.name}: ${ranked[0].project.nextStep}`;
  }
  const overdue = overdueTasks(input.tasks || [], now);
  if (overdue[0]?.title) return `Next step: ${overdue[0].title}`;
  return null;
}

export async function saveProjects(vault: string, projects: Project[], now = new Date()): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const stamped = projects.map((project) => ({ ...project, updated: project.updated || day }));
  for (const project of stamped) {
    if (!STATUSES.has(project.status)) throw new Error(`Unknown project status: ${project.status}`);
  }
  const mode = (await noteExists(vault)) ? "replace" : "create";
  const written = await writeNote({
    vault,
    title: "Projects",
    folder: "Jarvis" satisfies WriteFolder,
    body: renderProjects(stamped),
    mode,
    now,
  });
  return written.relativePath;
}

async function noteExists(vault: string): Promise<boolean> {
  try {
    await readFile(path.join(vault, "Jarvis", "Projects.md"), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function readProjects(vault: string): Promise<Project[]> {
  try {
    return parseProjects(await readFile(path.join(vault, "Jarvis", "Projects.md"), "utf8"));
  } catch {
    return [];
  }
}

export function projectRecords(projects: Project[]): PortItemInput[] {
  return projects.map((project) => ({
    source: "tracker",
    externalId: project.name.toLowerCase(),
    title: project.name,
    content: `${project.name}. ${project.status}. Next: ${project.nextStep}`,
    kind: "project",
    path: "Jarvis/Projects.md",
    metadata: { status: project.status, due: project.due || "", updated: project.updated || "" },
  }));
}

export function readTaskFile(raw: string): NormalizedTask[] {
  return tasksFromStore(JSON.parse(raw));
}

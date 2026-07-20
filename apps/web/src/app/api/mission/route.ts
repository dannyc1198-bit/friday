import { promises as fs } from "fs";

// Mission feed — reads Danny's Champion Log (his external brain) so the deck
// always opens holding his place: the phase, the spear, THE ONE THING.
// Read-only. The log stays canonical; this only parses the START HERE box
// and the TO-DO section.

const LOG_PATH =
  process.env.MISSION_LOG_PATH ||
  "C:\\Users\\12368\\Desktop\\WAVELENGTH-CHAMPION-LOG.md";

export const dynamic = "force-dynamic";

// Strip markdown noise for instrument display: bold, code, links → plain text.
function clean(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

export async function GET() {
  try {
    const md = await fs.readFile(LOG_PATH, "utf-8");
    const grab = (re: RegExp) => {
      const m = md.match(re);
      return m ? clean(m[1]) : null;
    };

    const lastUpdated = grab(/\*\*Last updated:\*\*\s*(.+)/);
    const phase = grab(/\*\*Phase:\*\*\s*(.+)/);
    const spear = grab(/\*\*The Spear[^:]*:\*\*\s*(.+)/);
    const oneThing = grab(/\*\*🎯 YOUR ONE THING THIS WEEK:\*\*\s*(.+)/);

    // TO-DO section: everything between "## ✅ TO-DO" and the next "---"
    const todos: { done: boolean; text: string }[] = [];
    const section = md.split(/## ✅ TO-DO/)[1]?.split(/\n---/)[0] ?? "";
    const todoRe = /^- \[( |x)\]\s*(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = todoRe.exec(section)) !== null && todos.length < 10) {
      todos.push({
        done: m[1] === "x",
        text: clean(m[2]).slice(0, 160),
      });
    }

    return Response.json({ ok: true, lastUpdated, phase, spear, oneThing, todos });
  } catch {
    return Response.json(
      { ok: false, error: "Champion Log not found at " + LOG_PATH },
      { status: 200 } // soft failure — the card renders the message, no 500 noise
    );
  }
}

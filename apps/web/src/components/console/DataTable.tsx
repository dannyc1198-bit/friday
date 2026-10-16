"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { StateBlock } from "./States";

export interface Column<T> {
  key: string;
  header: string;
  sortValue: (row: T) => string | number;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchText,
  loading,
  error,
  emptyTitle,
  emptyDetail,
  onRow,
}: {
  rows: T[];
  columns: Column<T>[];
  searchText: (row: T) => string;
  loading: boolean;
  error: string;
  emptyTitle: string;
  emptyDetail: string;
  onRow: (row: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(columns[0]?.key || "");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? rows.filter((row) => searchText(row).toLowerCase().includes(needle)) : rows.slice();
    const column = columns.find((item) => item.key === sortKey) || columns[0];
    if (!column) return filtered;
    filtered.sort((a, b) => {
      const av = column.sortValue(a);
      const bv = column.sortValue(b);
      const order = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? order : -order;
    });
    return filtered;
  }, [columns, dir, query, rows, searchText, sortKey]);

  if (loading) return <StateBlock kind="loading" title="Loading" detail="Reading the latest records." />;
  if (error) return <StateBlock kind="error" title="Could not load" detail={error} />;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search className="h-4 w-4 text-faint" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter"
          aria-label="Filter rows"
          className="h-8 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
        {query && (
          <button type="button" aria-label="Clear filter" onClick={() => setQuery("")} className="rounded p-1 text-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <StateBlock kind="empty" title={query ? "No matches" : emptyTitle} detail={query ? "Try a different filter." : emptyDetail} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                {columns.map((column) => {
                  const active = column.key === sortKey;
                  return (
                    <th key={column.key} className={`px-3 py-2 font-medium ${column.className || ""}`}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink"
                        onClick={() => {
                          if (active) setDir(dir === "asc" ? "desc" : "asc");
                          else {
                            setSortKey(column.key);
                            setDir("asc");
                          }
                        }}
                      >
                        {column.header}
                        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-raised"
                  onClick={() => onRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRow(row);
                    }
                  }}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`px-3 py-3 text-ink ${column.className || ""}`}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-14 items-center justify-between border-b border-line px-4">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close details" className="rounded p-1 text-muted hover:bg-raised hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

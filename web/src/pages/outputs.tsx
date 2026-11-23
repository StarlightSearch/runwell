import { useCallback, useEffect, useState } from "react";
import type { SkillListItem } from "../../../src/server/skills";
import { Empty } from "../components/empty";
import { FilterChips } from "../components/filter-chips";
import { OutputTile, type TileItem } from "../components/output-tile";
import { PageHeader } from "../components/page-header";
import { api } from "../lib/api";
import { useResource } from "../lib/use-resource";
import "../components/tabs.css";
import "./skills.css";
import "./lists.css";

const PAGE = 60;
const KINDS = [
  { id: "", label: "All" },
  { id: "video", label: "Video" },
  { id: "image", label: "Image" },
  { id: "pdf", label: "PDF" },
  { id: "html", label: "HTML" },
  { id: "text", label: "Text" },
];

export function OutputsPage() {
  const skills = useResource<{ skills: SkillListItem[] }>("/api/skills");
  const [skill, setSkill] = useState("");
  const [kind, setKind] = useState("");
  const [items, setItems] = useState<TileItem[] | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (before?: number) => {
      const q = new URLSearchParams({ limit: String(PAGE) });
      if (skill) q.set("skill", skill);
      if (kind) q.set("kind", kind);
      if (before) q.set("before", String(before));
      const r = await api<{ items: TileItem[] }>(`/api/outputs?${q}`);
      setItems((prev) => (before && prev ? [...prev, ...r.items] : r.items));
      setMore(r.items.length === PAGE);
    },
    [skill, kind],
  );
  useEffect(() => {
    setItems(null);
    void load().catch(() => setItems([]));
  }, [load]);

  return (
    <>
      <PageHeader>
        <span className="crumb">
          <b>Outputs</b>
        </span>
      </PageHeader>
      <div className="page">
        <FilterChips
          chips={KINDS}
          value={kind}
          onChange={setKind}
          extra={
            <select aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="">All skills</option>
              {(skills.data?.skills ?? []).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          }
        />
        {items === null ? null : !items.length ? (
          <Empty title="Nothing yet.">Files your runs produce show up here.</Empty>
        ) : (
          <>
            <div className="grid" data-testid="outputs-grid">
              {items.map((it) => (
                <OutputTile key={`${it.runId}/${it.path}`} item={it} />
              ))}
            </div>
            {more ? (
              <button className="btn ghost" type="button" style={{ marginTop: 16 }} onClick={() => void load(items[items.length - 1]!.runCreatedAt)}>
                Load more
              </button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

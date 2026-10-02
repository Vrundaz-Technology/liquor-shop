"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Check, Info, Lock, TriangleAlert } from "lucide-react";
import { AccessDenied } from "@/components/dashboard/AccessDenied";
import { SearchInput } from "@/components/ui/SearchInput";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { useUserStore } from "@/store/user";
import { hasPermission, PERMISSION_META } from "@/lib/auth/permissions";
import { dashboardPath, DASHBOARD_SECTION_META } from "@/lib/dashboard/routes";
import {
  DOC_GROUPS,
  DOC_TOPICS,
  DOCS_LAST_REVIEWED,
  findDocTopic,
  searchDocTopics,
  type DocBlock,
  type DocTopic,
} from "@/lib/docs/system-docs";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function headingId(topicId: string, index: number) {
  return `doc-${topicId}-${index}`;
}

function BlockView({ block, id }: { block: DocBlock; id: string }) {
  return (
    <section aria-labelledby={id} className="scroll-mt-28">
      <h3 id={id} className="font-display text-xl text-cream sm:text-2xl">
        {block.heading}
      </h3>
      {block.body ? (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{block.body}</p>
      ) : null}
      {block.list?.length ? (
        <ul className="mt-3 max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-cream/90 marker:text-gold">
          {block.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {block.steps?.length ? (
        <ol className="mt-3 max-w-3xl space-y-2 text-sm leading-relaxed text-cream/90">
          {block.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-(--gold)/40 text-[11px] text-gold"
                aria-hidden
              >
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {block.table ? (
        <div className="mt-3 overflow-x-auto rounded-sm border border-white/10">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <caption className="sr-only">{block.heading}</caption>
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {block.table.columns.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-gold"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.table.rows.map((row) => (
                <tr key={row.join("|")} className="border-b border-white/5 last:border-b-0">
                  {row.map((cell, index) => (
                    <td
                      key={`${index}-${cell}`}
                      className={cn(
                        "px-3 py-2 align-top leading-relaxed",
                        index === 0 ? "whitespace-nowrap font-mono text-xs text-cream" : "text-muted",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {block.note ? (
        <p
          className={cn(
            "mt-3 flex max-w-3xl gap-2 rounded-sm border px-3 py-2.5 text-sm leading-relaxed",
            block.note.tone === "warning"
              ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-100"
              : "border-(--gold)/25 bg-(--gold)/[0.05] text-cream/90",
          )}
        >
          {block.note.tone === "warning" ? (
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
          ) : (
            <Info size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          )}
          <span>
            <span className="sr-only">{block.note.tone === "warning" ? "Warning: " : "Note: "}</span>
            {block.note.text}
          </span>
        </p>
      ) : null}
    </section>
  );
}

function TopicArticle({ topic }: { topic: DocTopic }) {
  const profile = useUserStore((s) => s.profile);
  const sectionMeta = topic.section
    ? DASHBOARD_SECTION_META.find((meta) => meta.id === topic.section)
    : undefined;
  const canOpenSection = sectionMeta ? hasPermission(profile, sectionMeta.permission) : false;
  const relatedTopics = (topic.related ?? [])
    .map((id) => findDocTopic(id))
    .filter((t): t is DocTopic => Boolean(t));

  return (
    <article aria-labelledby={`doc-title-${topic.id}`} className="min-w-0">
      <header className="border-b border-white/10 pb-5">
        <p className="text-[10px] uppercase tracking-[0.22em] text-gold">
          {DOC_GROUPS.find((group) => group.id === topic.group)?.label}
        </p>
        <h2
          id={`doc-title-${topic.id}`}
          tabIndex={-1}
          className="mt-2 font-display text-3xl leading-tight text-cream outline-none sm:text-4xl"
        >
          {topic.title}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          {topic.summary}
        </p>
        {topic.audience ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-cream/90">
            <span className="text-[10px] uppercase tracking-[0.18em] text-gold">Who uses this · </span>
            {topic.audience}
          </p>
        ) : null}
        {sectionMeta && canOpenSection && topic.section ? (
          <Link
            href={dashboardPath(topic.section)}
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-(--gold)/40 px-3 text-xs uppercase tracking-[0.14em] text-gold transition hover:bg-(--gold)/10"
          >
            Open {sectionMeta.label}
            <ArrowUpRight size={14} aria-hidden />
          </Link>
        ) : null}
      </header>

      {topic.permissions?.length ? (
        <section aria-labelledby={`doc-perms-${topic.id}`} className="mt-6">
          <h3
            id={`doc-perms-${topic.id}`}
            className="text-[10px] uppercase tracking-[0.2em] text-gold"
          >
            Permissions used here
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {topic.permissions.map((permission) => {
              const granted = hasPermission(profile, permission);
              return (
                <li
                  key={permission}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs",
                    granted
                      ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-100"
                      : "border-white/10 bg-white/[0.02] text-muted",
                  )}
                >
                  {granted ? <Check size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
                  <span className="font-mono">{permission}</span>
                  <span className="hidden text-muted sm:inline">· {PERMISSION_META[permission].label}</span>
                  <span className="sr-only">{granted ? "(you have this)" : "(not granted to you)"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {topic.blocks.length > 2 ? (
        <nav aria-label="On this page" className="mt-6 rounded-sm border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">On this page</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {topic.blocks.map((block, index) => (
              <li key={block.heading}>
                <a
                  href={`#${headingId(topic.id, index)}`}
                  className="text-muted underline-offset-4 transition hover:text-cream hover:underline"
                >
                  {block.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mt-8 space-y-10">
        {topic.blocks.map((block, index) => (
          <BlockView key={block.heading} block={block} id={headingId(topic.id, index)} />
        ))}
      </div>

      {relatedTopics.length ? (
        <nav aria-label="Related topics" className="mt-12 border-t border-white/10 pt-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Related topics</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {relatedTopics.map((related) => (
              <li key={related.id}>
                <Link
                  href={dashboardPath("docs", { docsTopic: related.id })}
                  scroll={false}
                  className="inline-flex min-h-10 items-center rounded-sm border border-white/10 px-3 text-sm text-muted transition hover:border-(--gold)/40 hover:text-cream"
                >
                  {related.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </article>
  );
}

export function DocumentationPanel({ topic }: { topic: string | null }) {
  const profile = useUserStore((s) => s.profile);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const active = findDocTopic(topic) ?? DOC_TOPICS[0]!;
  const results = useMemo(() => searchDocTopics(query), [query]);
  const articleRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new article heading on topic change so keyboard and
  // screen reader users land on the content they just picked.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    articleRef.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [active.id]);

  if (!hasPermission(profile, "docs.view")) {
    return (
      <AccessDenied message="Documentation is available to owners and admins. Ask an owner to grant View documentation." />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-10">
      <div className="space-y-3 lg:sticky lg:top-[7rem] lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search documentation…"
          aria-label="Search documentation"
          inputClassName="h-10"
        />

        {/* Compact picker for phones; the full list is below on larger screens. */}
        <label className="block lg:hidden">
          <span className="sr-only">Choose a documentation topic</span>
          <NativeSelect
            value={active.id}
            onChange={(event) =>
              router.push(dashboardPath("docs", { docsTopic: event.target.value }), {
                scroll: false,
              })
            }
          >
            {DOC_GROUPS.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {DOC_TOPICS.filter((t) => t.group === group.id).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </label>

        <nav
          aria-label="Documentation topics"
          className={cn(query.trim() ? "block" : "hidden lg:block")}
        >
          {query.trim() ? (
            <p className="mb-2 px-1 text-xs text-muted" role="status">
              {results.length} {results.length === 1 ? "topic matches" : "topics match"}
            </p>
          ) : null}
          <div className="space-y-4">
            {DOC_GROUPS.map((group) => {
              const items = results.filter((t) => t.group === group.id);
              if (!items.length) return null;
              return (
                <div key={group.id}>
                  <p className="mb-1 px-2 text-[10px] uppercase tracking-[0.2em] text-gold/80">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((t) => {
                      const current = t.id === active.id;
                      return (
                        <li key={t.id}>
                          <Link
                            href={dashboardPath("docs", { docsTopic: t.id })}
                            scroll={false}
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              "flex min-h-10 items-center rounded-sm px-2.5 text-sm transition",
                              current
                                ? "bg-(--gold)/12 text-cream shadow-[inset_3px_0_0_0_var(--gold)]"
                                : "text-muted hover:bg-white/[0.04] hover:text-cream",
                            )}
                          >
                            {t.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
      </div>

      <div ref={articleRef} className="min-w-0">
        <TopicArticle topic={active} />
        <footer className="mt-12 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4 text-xs text-muted">
          <BookOpen size={14} className="text-gold" aria-hidden />
          Last reviewed against the code on {DOCS_LAST_REVIEWED}. Permissions shown are checked live
          against your account.
        </footer>
      </div>
    </div>
  );
}

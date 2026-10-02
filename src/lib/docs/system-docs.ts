import type { Permission } from "@/lib/auth/permissions";
import type { DashboardSection } from "@/lib/dashboard/routes";
import { TOPICS } from "@/lib/docs/topics";

export type DocBlock = {
  heading: string;
  body?: string;
  list?: string[];
  steps?: string[];
  table?: { columns: string[]; rows: string[][] };
  note?: { tone: "info" | "warning"; text: string };
};

export type DocGroupId = "start" | "operations" | "manage" | "platform";

export type DocTopic = {
  id: string;
  title: string;
  group: DocGroupId;
  summary: string;
  /** Plain-language "who uses this and when". */
  audience?: string;
  /** Dashboard section this topic documents, for the "Open …" shortcut. */
  section?: DashboardSection;
  permissions?: Permission[];
  blocks: DocBlock[];
  /** Topic ids shown as "Related topics" at the end. */
  related?: string[];
};

/** Bump when the documentation is reviewed against the code. */
export const DOCS_LAST_REVIEWED = "October 2, 2026";

export const DOC_GROUPS: { id: DocGroupId; label: string }[] = [
  { id: "start", label: "Getting started" },
  { id: "operations", label: "Operations" },
  { id: "manage", label: "Manage" },
  { id: "platform", label: "Platform & architecture" },
];

export const DOC_TOPICS: DocTopic[] = TOPICS;

export function findDocTopic(id: string | null | undefined) {
  if (!id) return undefined;
  return DOC_TOPICS.find((topic) => topic.id === id);
}

function topicText(topic: DocTopic) {
  return [
    topic.title,
    topic.summary,
    topic.audience ?? "",
    ...(topic.permissions ?? []),
    ...topic.blocks.flatMap((block) => [
      block.heading,
      block.body ?? "",
      ...(block.list ?? []),
      ...(block.steps ?? []),
      ...(block.table?.rows.flat() ?? []),
      block.note?.text ?? "",
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

/** Every whitespace-separated term must appear somewhere in the topic. */
export function searchDocTopics(query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return DOC_TOPICS;
  return DOC_TOPICS.filter((topic) => {
    const text = topicText(topic);
    return terms.every((term) => text.includes(term));
  });
}

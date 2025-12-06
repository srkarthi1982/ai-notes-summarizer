import { column, defineTable, NOW } from "astro:db";

/**
 * A long note or document provided by the user.
 * Example: meeting notes, lecture notes, article, etc.
 */
export const NotesDocuments = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    // Owner from parent Users.id
    ownerId: column.text(),

    title: column.text(),
    // Full raw text of the note / document
    content: column.text(),

    // Where this came from
    sourceType: column.text({
      enum: ["manual", "upload", "web", "other"],
      default: "manual",
    }),

    // Metadata: file name, URL, mime type, etc.
    sourceMeta: column.json({ optional: true }),

    // Optional tags to group/filter notes
    tags: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

/**
 * Summaries generated for a given note/document.
 */
export const NoteSummaries = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    documentId: column.number({ references: () => NotesDocuments.columns.id }),

    // Owner (duplicate for faster filtering if needed)
    ownerId: column.text(),

    // What kind of summary this is
    summaryType: column.text({
      enum: ["short", "detailed", "bullet_points", "key_points", "action_items"],
      default: "short",
    }),

    // Plain text summary (or markdown)
    content: column.text(),

    // Optional stats
    originalLength: column.number({ optional: true }), // characters or tokens
    summaryLength: column.number({ optional: true }),

    // Optional extra structured data (e.g., JSON of bullets/actions)
    meta: column.json({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

/**
 * AI job log for transparency / history.
 * Each row = one “generate summary” operation.
 */
export const SummaryJobs = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    documentId: column.number({
      references: () => NotesDocuments.columns.id,
      optional: true,
    }),

    ownerId: column.text(),

    // What was requested
    jobType: column.text({
      enum: ["summary", "key_points", "action_items", "rewrite", "other"],
      default: "summary",
    }),

    // Input: prompt + settings, stored as JSON
    input: column.json({ optional: true }),

    // Output: model raw response or parsed version
    output: column.json({ optional: true }),

    status: column.text({
      enum: ["pending", "completed", "failed"],
      default: "completed",
    }),

    createdAt: column.date({ default: NOW }),
  },
});

export const aiNotesSummarizerTables = {
  NotesDocuments,
  NoteSummaries,
  SummaryJobs,
} as const;

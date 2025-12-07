import type { ActionAPIContext } from "astro:actions";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import {
  db,
  eq,
  and,
  NotesDocuments,
  NoteSummaries,
  SummaryJobs,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

export const server = {
  createDocument: defineAction({
    input: z.object({
      title: z.string().min(1, "Title is required"),
      content: z.string().min(1, "Content is required"),
      sourceType: z.enum(["manual", "upload", "web", "other"]).optional(),
      sourceMeta: z.any().optional(),
      tags: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [document] = await db
        .insert(NotesDocuments)
        .values({
          ownerId: user.id,
          title: input.title,
          content: input.content,
          sourceType: input.sourceType ?? "manual",
          sourceMeta: input.sourceMeta,
          tags: input.tags,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return { document };
    },
  }),

  updateDocument: defineAction({
    input: z.object({
      id: z.number().int(),
      title: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      sourceType: z.enum(["manual", "upload", "web", "other"]).optional(),
      sourceMeta: z.any().optional(),
      tags: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const { id, ...rest } = input;

      const [existing] = await db
        .select()
        .from(NotesDocuments)
        .where(and(eq(NotesDocuments.id, id), eq(NotesDocuments.ownerId, user.id)))
        .limit(1);

      if (!existing) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }

      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (typeof value !== "undefined") {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return { document: existing };
      }

      const [document] = await db
        .update(NotesDocuments)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(eq(NotesDocuments.id, id), eq(NotesDocuments.ownerId, user.id)))
        .returning();

      return { document };
    },
  }),

  deleteDocument: defineAction({
    input: z.object({
      id: z.number().int(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [deleted] = await db
        .delete(NotesDocuments)
        .where(and(eq(NotesDocuments.id, input.id), eq(NotesDocuments.ownerId, user.id)))
        .returning();

      if (!deleted) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }

      return { document: deleted };
    },
  }),

  listDocuments: defineAction({
    input: z.object({}).optional(),
    handler: async (_, context) => {
      const user = requireUser(context);

      const documents = await db
        .select()
        .from(NotesDocuments)
        .where(eq(NotesDocuments.ownerId, user.id));

      return { documents };
    },
  }),

  getDocumentWithSummaries: defineAction({
    input: z.object({
      id: z.number().int(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [document] = await db
        .select()
        .from(NotesDocuments)
        .where(and(eq(NotesDocuments.id, input.id), eq(NotesDocuments.ownerId, user.id)))
        .limit(1);

      if (!document) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }

      const summaries = await db
        .select()
        .from(NoteSummaries)
        .where(eq(NoteSummaries.documentId, input.id));

      return { document, summaries };
    },
  }),

  createSummary: defineAction({
    input: z.object({
      documentId: z.number().int(),
      summaryType: z
        .enum(["short", "detailed", "bullet_points", "key_points", "action_items"])
        .optional(),
      content: z.string().min(1, "Summary content is required"),
      originalLength: z.number().int().nonnegative().optional(),
      summaryLength: z.number().int().nonnegative().optional(),
      meta: z.any().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [document] = await db
        .select()
        .from(NotesDocuments)
        .where(
          and(eq(NotesDocuments.id, input.documentId), eq(NotesDocuments.ownerId, user.id))
        )
        .limit(1);

      if (!document) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Document not found.",
        });
      }

      const [summary] = await db
        .insert(NoteSummaries)
        .values({
          documentId: input.documentId,
          ownerId: user.id,
          summaryType: input.summaryType ?? "short",
          content: input.content,
          originalLength: input.originalLength,
          summaryLength: input.summaryLength,
          meta: input.meta,
          createdAt: new Date(),
        })
        .returning();

      return { summary };
    },
  }),

  listSummaries: defineAction({
    input: z
      .object({
        documentId: z.number().int().optional(),
      })
      .optional(),
    handler: async (input, context) => {
      const user = requireUser(context);

      let documents = await db
        .select()
        .from(NotesDocuments)
        .where(eq(NotesDocuments.ownerId, user.id));

      if (input?.documentId) {
        documents = documents.filter((doc) => doc.id === input.documentId);
        if (documents.length === 0) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Document not found.",
          });
        }
      }

      const docIds = documents.map((doc) => doc.id);

      const summaries = await db
        .select()
        .from(NoteSummaries)
        .where(eq(NoteSummaries.ownerId, user.id));

      const filtered = summaries.filter((summary) => docIds.includes(summary.documentId));

      return { summaries: filtered };
    },
  }),

  createJob: defineAction({
    input: z.object({
      documentId: z.number().int().optional(),
      jobType: z.enum(["summary", "key_points", "action_items", "rewrite", "other"]).optional(),
      input: z.any().optional(),
      output: z.any().optional(),
      status: z.enum(["pending", "completed", "failed"]).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.documentId) {
        const [document] = await db
          .select()
          .from(NotesDocuments)
          .where(
            and(eq(NotesDocuments.id, input.documentId), eq(NotesDocuments.ownerId, user.id))
          )
          .limit(1);

        if (!document) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Document not found.",
          });
        }
      }

      const [job] = await db
        .insert(SummaryJobs)
        .values({
          documentId: input.documentId,
          ownerId: user.id,
          jobType: input.jobType ?? "summary",
          input: input.input,
          output: input.output,
          status: input.status ?? "pending",
          createdAt: new Date(),
        })
        .returning();

      return { job };
    },
  }),

  updateJob: defineAction({
    input: z.object({
      id: z.number().int(),
      output: z.any().optional(),
      status: z.enum(["pending", "completed", "failed"]).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [existing] = await db
        .select()
        .from(SummaryJobs)
        .where(and(eq(SummaryJobs.id, input.id), eq(SummaryJobs.ownerId, user.id)))
        .limit(1);

      if (!existing) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Job not found.",
        });
      }

      const updateData: Record<string, unknown> = {};
      if (typeof input.output !== "undefined") updateData.output = input.output;
      if (typeof input.status !== "undefined") updateData.status = input.status;

      if (Object.keys(updateData).length === 0) {
        return { job: existing };
      }

      const [job] = await db
        .update(SummaryJobs)
        .set(updateData)
        .where(eq(SummaryJobs.id, input.id))
        .returning();

      return { job };
    },
  }),

  listJobs: defineAction({
    input: z
      .object({
        documentId: z.number().int().optional(),
        status: z.enum(["pending", "completed", "failed"]).optional(),
      })
      .optional(),
    handler: async (input, context) => {
      const user = requireUser(context);

      let documents = await db
        .select()
        .from(NotesDocuments)
        .where(eq(NotesDocuments.ownerId, user.id));

      if (input?.documentId) {
        documents = documents.filter((doc) => doc.id === input.documentId);
        if (documents.length === 0) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Document not found.",
          });
        }
      }

      const allowedDocIds = new Set(documents.map((doc) => doc.id));

      const jobs = await db
        .select()
        .from(SummaryJobs)
        .where(eq(SummaryJobs.ownerId, user.id));

      const filtered = jobs.filter((job) => {
        const matchesDoc = job.documentId ? allowedDocIds.has(job.documentId) : true;
        const matchesStatus = input?.status ? job.status === input.status : true;
        return matchesDoc && matchesStatus;
      });

      return { jobs: filtered };
    },
  }),
};

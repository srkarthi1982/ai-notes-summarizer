import { defineDb } from "astro:db";
import { NotesDocuments, NoteSummaries, SummaryJobs } from "./tables";

// https://astro.build/db/config
export default defineDb({
  tables: {
    NotesDocuments,
    NoteSummaries,
    SummaryJobs,
  },
});

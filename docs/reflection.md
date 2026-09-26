# Reflection: Field Manual 21-76 Survival Assistant

**Live:** field-manual-rag-neon.vercel.app · **Repo:** github.com/metromark/field-manual-rag

**Corpus and why.** I chose the U.S. Army's 1992 survival manual, FM 21-76. It is easy to understand which means it is easier to test and validate the RAG system. Since it is also a well-known domain for many, others will be able to test this easily as well. It is public domain, strongly structured (chapters, ALL-CAPS sections, bulleted procedures), and wrong answers are easy to spot. Most archive.org copies are retyped reprints, so I used the official PDF and indexed chapters 1–23. I skipped the appendices, which are mostly photo catalogues.

**Chunking decisions.** Fixed windows would split procedures in half, so I chunked on the manual's structure: chapter → section → subsection. An intro like "To make the still--" stays with its steps, CAUTION notes stay inline, short sections merge into neighbors, and every chunk is embedded with a header ("Chapter 6: Water Procurement › Still Construction"). The result is 562 chunks. Two extraction bugs mattered more than any tuning: the starter tagged every chunk as page 1, and joining PDF text with spaces broke words apart.

**What worked.** The correct passage was in the top 3 for 19 of 19 test questions (hit@1 89%). Retrieval as a tool behaved as intended: greetings skip the search, and real questions call it. The eval harness was the most useful thing I built. The final configuration scored 19/19 correct citations, 4/4 refusals and 23/23 grounded answers in one run.

**What failed and what I learned.**
- *Right passage, wrong answer.* The model listed filtering as a way to purify water, but the passage says filtering "only clears the water. You will have to purify it." I added a rule to keep qualifiers.
- *A filter caused a hallucination.* For "signs of hypothermia" the model filtered to the medicine chapter, which only defines the condition, and invented symptoms. The real list is in the cold-weather chapter. Now the filter narrows results but never excludes the best overall hits.
- *Figures are invisible.* The Universal Edibility Test exists only as an image (Figure 9-5). gpt-4o-mini recited the steps from memory in every run, even with explicit warnings; gpt-4.1-mini pointed to the figure, so I switched. The model mattered more for grounding than I expected.
- *More isn't better.* Raising topK from 5 to 8 lowered groundedness, and similarity scores couldn't separate out-of-scope questions (0.74) from correct hits (0.73), so refusing has to come from the model. My first LLM judge was inconsistent too, until I made it evaluate claim by claim.

✅ My bot is deployed publicly on Vercel. It has a link and accessible via the internet.
✅ My app streams answers using the Vercel AI SDK. It is able to show the results in a streaming fasion.
✅ My RAG flow is implemented as a tool call. RAG is triggered via tool call.
✅ Sources are visible and readable under answers. The UI shows the sources as it answers.
✅ My corpus is non-trivial and well chosen. It is a well known domain and understandable by others.
✅ My repo includes a README and correct setup info. Documentation is visible when viewing the github page.
✅ My reflection is specific and honest. I showed my progress including what failed and what I could not do.
✅ My secrets are not exposed in the client bundle. I ran checks as well to make sure it is sanitized.

**Weaknesses.** Content inside figures is lost. Multi-chunk answers like the SURVIVAL acronym can come back incomplete (the bot says what's missing). Citations use PDF pages because this edition has no printed page labels. The eval is small: 23 judged questions, one run each.

**Next steps.** Transcribe figure pages with a vision model, retrieve neighboring chunks for multi-part answers, grow the eval and repeat runs to measure variance, and add per-IP rate limiting.

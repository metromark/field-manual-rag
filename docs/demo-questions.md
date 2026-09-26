# Demo questions

Try these at https://field-manual-rag-neon.vercel.app. They cover strong answers, tool skipping, refusals, and the known weak spots. The expected behavior below was checked against the live deployment.

## Strong answers

1. **How do I build a belowground still?**
   Returns the full 12-step procedure from Chapter 6 (pp. 76–78) in the manual's order, with measurements (1 m across, 60 cm deep, cone 40 cm below ground). It adds the polluted-water trough variant and notes that the manual points to Figures 6-7 and 6-8. This shows why procedures are kept in one chunk: the lead-in "To construct the still--" and all its bullets arrive together.

2. **What are the signs of hypothermia?**
   Gives the manual's temperature-staged symptoms from Chapter 15, p. 193 (shivering at 35.5°C, sluggish thinking and a false feeling of warmth at 35–32°C, and so on). During development the model filtered this search to "Basic Survival Medicine", which only defines hypothermia, and then invented a generic symptom list. The chapter filter now always merges in the best unfiltered hits, which fixed it.

3. **How do I purify water without tablets?**
   Boiling times from Chapter 6, p. 78 (1 minute at sea level plus 1 minute per 300 m, or 10 minutes anywhere). A good test of qualifiers: the manual says settling and filtering "only clear the water… You will have to purify it", and the answer should keep that distinction.

4. **How do I find north without a compass?**
   Several methods from Chapter 18: an improvised magnetized-needle compass, the watch method (with the daylight-saving adjustment), and the North Star via Cassiopeia. Each is cited to its own page.

## Tool use and refusals

5. **Hi, what can you do?**
   A short answer with example topics. **No tool call**, so no source cards appear.

6. **How do I pair a Garmin GPS with my phone?**
   Says FM 21-76 doesn't cover it and suggests the device manual. It doesn't make up instructions.

7. **What dose of epinephrine auto-injector should I use for anaphylaxis?**
   Searches, finds only general bites-and-stings material, says the manual doesn't specify epinephrine dosing, and refers the user to current medical guidance. The retrieved passages are similar enough (score ~0.65) that a score threshold alone wouldn't have refused this; the model has to.

## Weak spots (on purpose)

8. **How do I test whether an unknown plant is safe to eat?**
   The Universal Edibility Test steps exist only in **Figure 9-5, an image**, so they aren't in the text. The bot gives what the text does contain (test only abundant plants, each part takes 24+ hours, the list of warning signs) and sends the reader to Figure 9-5 on p. 130. An earlier model (`gpt-4o-mini`) recited the steps from memory every time, which is why the app uses `gpt-4.1-mini`.

9. **What does each letter of SURVIVAL stand for?**
   The acronym is explained across pages 4–7, split over several chunks. Top-5 retrieval usually returns S, U and L but not the middle letters. The bot says which letters weren't in the retrieved text; it doesn't fill them in. The answer is honest but incomplete; a fix would be neighbor-chunk expansion or retrieving a whole section.

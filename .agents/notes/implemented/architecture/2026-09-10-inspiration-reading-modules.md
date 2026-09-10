# Inspiration report reading modules

Report rendering derives headings only from explicit opening colon labels and the summary's consecutive numbered labels. Quoted colons, parenthesized dates, times and URLs cannot create a heading. Each displayed title and its paragraphs concatenate to the saved text, including whitespace and punctuation. This keeps layout independent of the integrity-checked Markdown report and clipboard serialization.

Summary, findings, disagreements, creative angles and sources remain expanded in separate sections. Navigation includes only rendered sections and moves focus to their headings without changing the URL or report selection. Citations retain their source identities and use the source array order for display numbers.

The detail uses the available pane width. At 960 px of detail content, each module's entries form two columns in row order; narrower containers retain one column. This avoids unused space from nested fixed reading widths while keeping individual passages readable. CSS grid placement preserves DOM order and keeps each entry with its citations. The summary introduction and single-item lists span the row.

Focused parser and DOM tests cover text preservation, source numbering, empty results and keyboard chapter navigation. The component preview uses existing report data with the built-in appearance; Desktop rendering remains a separate acceptance check.

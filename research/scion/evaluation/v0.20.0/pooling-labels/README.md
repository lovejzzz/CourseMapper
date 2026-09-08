# Repeated-label pooling trial

Four new packets, one fixed pass, 48 real local calls. Two complete inputs and two missing-premise inputs. Candidate hashes and references were recorded before inference; references were not sent to the model. No case was rerun with revised prompts.

Identical group labels repeated within one record now cite the first occurrence explicitly, preserving all matching occurrence indices. Cross-record labels and repeated count evidence remain ambiguous. The pooling candidate excludes the teaching objective from its literal reading questions, preventing instructions such as “compare two groups” from being copied as source labels.

Both positive cases locate group names and four counts correctly. Neither is a complete semantic success: unit/outcome excerpts remain ambiguous, and Chinese countingUnit incorrectly names the first group. The negative cases also expose reused count occurrences and an uncertainty statement selected as disjointness evidence. All answers and failures are retained in first-run-raw.json; no output was silently completed or promoted.

The next experiment changes information flow: unit/outcome questions read the containing sentence of a verified count instead of rereading the full source packet. See ../pooling-context/. This is not evidence that the broader model task or v0.20.0 release is complete.

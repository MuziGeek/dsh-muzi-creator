# Workbench card deletion

Inspiration and content deletion removes visibility without destroying source files. Inspiration owners and runs persist a `deleted` marker; hidden runs are excluded from details and history. Removing the last visible run also hides its owner. Content manifests retain their project directory and drafts with `deleted: true`. Revisions and the manifest lock protect concurrent edits. Queued and running research must stop before deletion.

Card actions are separate keyboard controls, with explicit confirmation describing retained files. A post-mutation refresh waits for older reads to finish so an in-flight read cannot restore deleted cards. Report actions remain directly visible.

Validation: inspiration and content service tests cover persistence, revisions and retained source files; DOM tests cover confirmation, failures, selection and duplicate clicks.

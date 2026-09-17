# Agent Note: GitHub content and knowledge sources

Status: implemented

## Problem

The workbench could read the legacy library, Creator Studio content, Atlas knowledge, and Trellis projects from local directories, but only Trellis projects had a GitHub source. Content and knowledge stored in a GitHub repository could not be viewed through the existing workbench readers.

## Decision

Creator Studio content and Muzi Atlas knowledge support independent local or GitHub source modes in the plugin settings. GitHub sources resolve a branch to one commit, read the repository tree and regular files through the bounded GitHub transport, and atomically materialize a private cache under the plugin data directory. The persisted source file stores only repository identifiers, branch, commit metadata, and stale provenance; GitHub credentials remain in the DSH credential service.

The existing Creator Studio and Atlas readers receive an active-root provider, so their local parsing and preview behavior remains shared across both source modes. A GitHub source is read-only: Creator Studio mutations fail at the service entry point while the last complete snapshot remains available after a refresh failure. Repository scripts and symbolic links are never executed or materialized.

## Alternatives considered

**Clone repositories with Git.** Rejected because a source connection should not execute repository-controlled hooks or depend on a local Git installation, and a clone would make working-tree state part of the read result.

**Expose virtual GitHub paths directly to every reader.** Rejected because existing readers require regular filesystem access for Markdown, YAML, images, previews, and pending-material hashes; a complete bounded cache keeps those semantics consistent and makes stale reads explicit.

**Use one global source selection for content and knowledge.** Rejected because Creator Studio and Atlas commonly live in different repositories and need independent refresh, read-only state, and fallback directories.

## Consequences

The settings card now exposes separate Creator Studio content and knowledge source selectors, with local directory drafts and immediate GitHub actions. Public repositories work without authorization; private repositories reuse the existing GitHub Device flow and credential reference. Snapshot size, file count, and per-file limits are configurable through the plugin configuration. Cache files are local derived data and can be rebuilt by removing the source connection or refreshing it.

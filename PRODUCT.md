# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Muzi is the primary user. The workbench is used locally to move between agent conversations, external signals, content production, personal knowledge, and active Git plus Trellis projects.

## Product Purpose

Muzi Creator keeps the information needed for personal knowledge work and content production in one local-first workspace. Success means each feature has a useful central overview and detail path while active Agent work continues safely in the background.

## Positioning

The workbench connects read-only personal knowledge, repository-backed project progress, creator artifacts, external signals and bounded inspiration research while preserving the authority and provenance of each source.

## Operating Context

The plugin runs inside the DSH web client. It reads Creator Studio data, Muzi Atlas, configured Git and Trellis projects, and the public AIHOT feed. Sessions restore the complete official Agent surface; Hot, Inspiration, Content, Knowledge and Projects share one central workbench root with independent selections restored on page refresh; activating a feature entry opens its overview. Inspiration research uses visible dedicated Agent sessions and writes only structured, source-linked reports to the configured Creator Studio inbox.

## Capabilities and Constraints

- External hotspots are read-only inputs grouped for attention and review.
- A hotspot never creates content, tasks, Agent prompts, or publication actions automatically.
- Inspiration offers manual topic search and optional-topic trend search with a selected date range; its dedicated Agent uses public web and read-only knowledge tools and submits a validated structured report.
- Inspiration reports are immutable, source-linked Markdown records; converting one to content creates only a normal Agent proposal and never bypasses the existing content confirmation flow.
- Inspiration runs one Agent at a time, pauses legacy daily tasks before execution, cancels queued automatic work, and retains historical reports. Failed or interrupted searches require a manual retry.
- Source links and evidence remain visible so important figures, policies, and quotations can be checked against original material.
- The Agent can continue running while another feature is open; the Sessions entry reports pending or running counts and restores the official Agent surface without creating, sending, stopping or switching a session.
- Feature navigation never uses an overlay Inspector or the official details column. Missing restored objects return to their feature overview.
- Remote source failures must not block conversations, content, knowledge, or project views.

- Video production accepts local project file or directory references and MP4/MOV exports from the user's chosen recorder or editor. Screen Studio is an optional macOS adapter; project references never execute or modify project files.

## Brand Commitments

The product name is Muzi Creator. The workbench uses the existing Muzi avatar and a restrained Animal Island visual language built from warm earth tones, rounded controls, clear focus states, and compact task-oriented surfaces. Chinese and English interfaces are both supported.

## Evidence on Hand

- The incumbent interface and tokens live under `src/client/`.
- The Muzi avatar is `src/client/assets/muzi-creator-icon.webp`.
- The built-in AIHOT attention policy is implemented by the plugin's daily-hot service.

## Product Principles

- Show source facts without fabricating progress or certainty.
- Keep external signals readable, explainable, and non-automating.
- Preserve local user data and unrelated worktree changes.
- Prefer a few task-oriented surfaces over decorative modules.
- Validate real rendered behavior, not only server availability.

## Accessibility & Inclusion

Navigation and disclosure controls support keyboard operation, visible focus, semantic state, reduced motion, and narrow-screen layouts without horizontal overflow.

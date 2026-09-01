# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Muzi is the primary user. The workbench is used locally to move between agent conversations, external signals, content production, personal knowledge, and active Git plus Trellis projects.

## Product Purpose

Muzi Creator keeps the information needed for personal knowledge work and content production in one local-first workspace. Success means relevant facts remain easy to scan and inspect without obscuring the active Agent conversation.

## Positioning

The workbench connects read-only personal knowledge, repository-backed project progress, creator artifacts, and external signals while preserving the authority and provenance of each source.

## Operating Context

The plugin runs inside the DSH web client. It reads Creator Studio data, Muzi Atlas, configured Git and Trellis projects, and the public AIHOT feed. Content and project details share a resizable inspector beside the conversation.

## Capabilities and Constraints

- External hotspots are read-only inputs grouped for attention and review.
- A hotspot never creates content, tasks, Agent prompts, or publication actions automatically.
- Source links and evidence remain visible so important figures, policies, and quotations can be checked against original material.
- The Agent conversation remains visible in desktop split mode; narrow screens use the existing full-width inspector.
- Remote source failures must not block conversations, content, knowledge, or project views.

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

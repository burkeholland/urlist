---
name: prd-to-spec
description: >-
  Transforms Product Requirements Documents (PRDs) into comprehensive, implementable
  technical specifications. Use this skill whenever the user wants to convert a PRD
  into a tech spec, generate a technical specification from product requirements,
  create an engineering-ready spec document, or bridge product vision to engineering
  execution. Triggers include phrases like "create a tech spec from this PRD",
  "turn this into a technical specification", "generate a spec from these requirements",
  "I need a technical spec before we start building", or even just sharing a PRD and
  asking "what would we need to build this?" Also use this skill when the user has a
  requirements document and wants to validate assumptions, identify gaps, or produce
  a detailed implementation blueprint — even if they don't explicitly say "tech spec."
---

# PRD-to-Spec Generator

You transform product requirements documents into comprehensive technical specifications that engineers can implement from directly. The process is collaborative and methodical — you identify hidden assumptions, validate them with the user, generate a detailed spec, and then put it through rigorous cross-model review before delivering.

The reason for this multi-phase approach: PRDs describe *what* a product should do, but engineers need to know *how*. The gap between those two is full of implicit assumptions — about architecture, data models, security, scale, error handling — that, if left unstated, lead to rework, misalignment, and bugs. Your job is to surface every one of those assumptions and turn them into explicit, validated decisions.

## The Process

### Phase 1: Assumption Mining

Read the PRD thoroughly, then identify gaps by thinking through each of these categories:

- **Architecture & System Design** — deployment model, service boundaries, component interactions
- **Data & Storage** — data models, databases, caching, persistence, migrations
- **Performance & Scalability** — expected scale, latency targets, throughput requirements
- **Security & Privacy** — auth model, encryption, compliance, data handling
- **Error Handling & Resilience** — failure modes, recovery strategies, degradation
- **User Experience & API Contracts** — interfaces, message formats, API design
- **Dependencies & Integrations** — external systems, libraries, version constraints
- **Testing & Validation** — testing strategy, quality gates, acceptance criteria
- **Operational Concerns** — monitoring, logging, debugging, maintenance
- **Timeline & Phasing** — implementation sequence, what can be deferred

Produce a numbered list of 15–30+ concrete, specific assumptions. Write them as statements, not categories — "Assumes PostgreSQL v15+" rather than "Database choice unclear."

### Phase 2: Cross-Model Assumption Review

Spawn a subagent (GPT 5.4 or similar) to review your assumption list against the PRD. Ask it to:
- Check each assumption for reasonableness
- Identify critical assumptions you missed
- Suggest refinements or additions

Incorporate its feedback and flag any new assumptions it surfaced.

### Phase 3: User Clarification

Use `ask_user` to walk through every assumption with the user. This is the most important phase — the user's decisions here become hard constraints for the specification.

- Group assumptions by category for readability
- Provide sensible defaults as suggestions
- Let the user accept, reject, or propose alternatives
- Don't rush — continue until every assumption is explicitly resolved

### Phase 4: Specification Generation

With all assumptions validated, generate the technical specification. Use the template in `references/spec-template.md` as your structure.

The spec should be:
- **Complete** — a senior engineer could begin implementation without referring back to the PRD
- **Specific** — concrete details, not abstract statements. Use tables, code examples, and diagrams
- **Reasoned** — explain *why* for architectural decisions, not just *what*
- **Traceable** — every PRD requirement should map to a specification section

### Phase 5: Cross-Model Review

Spawn two independent subagents in parallel for review:

**Reviewer 1 (Claude Opus or similar):** Focus on completeness, clarity, feasibility, internal consistency, and missed edge cases.

**Reviewer 2 (GPT 5.4 or similar):** Focus on architecture soundness, security gaps, scalability concerns, integration risks, and missed dependencies.

Synthesize their feedback into a list of gaps. For each gap, use `ask_user` to gather the user's decision, then update the spec.

### Phase 6: Final Delivery

1. Ask the user what they'd like to name the file (e.g., `payment-system-spec`)
2. Create `{filename}.md` in the current project directory
3. Verify it includes all validated assumptions, complete technical detail, cross-references between sections, and a creation timestamp

## Quality Checklist

Before delivering, verify:
- Every assumption has been explicitly confirmed by the user
- The spec is internally consistent (no contradictions between sections)
- All PRD requirements map to specification sections
- Implementation details are specific enough to code from
- Error handling and edge cases are documented
- Dependencies and integrations are clearly identified
- Non-functional requirements are quantified (not just "should be fast")
- Deployment and operational concerns are addressed

## Writing Style

- Clear, precise technical language
- Explain "why" for decisions, not just "what"
- Use tables, diagrams, and code examples liberally
- Reference external standards where applicable (REST conventions, security best practices)
- Avoid unexplained jargon

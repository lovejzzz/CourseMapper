# EDUTOOL v0.18.4 — The Free Product Promise

## Goal

Present EDUTOOL as the product it is intended to remain: one free course-building
workspace, without a paid tier, subscription, concierge offer, or promotional
upsell.

## Product decision

The paid concierge pilot is retired completely. It is not enough to hide the
landing-page banner while leaving its sample, inquiry form, legal language, or
search metadata reachable elsewhere.

EDUTOOL now states the promise directly:

> Course Mapper is free—and will stay free. There is no paid tier,
> subscription, or concierge upsell.

## Removed surfaces

- landing-page pilot offer and actions;
- paid-pilot contact action;
- pilot-specific privacy and terms sections;
- public pilot sample and pilot inquiry template;
- pilot README promotion;
- pilot sitemap entry and paid social/search metadata; and
- the paid pilot social-card asset.

## Discovery boundary

Canonical, robots, sitemap, WebSite, and WebApplication discovery remain. Their
copy now describes the free local-first browser workspace, and the structured
application offer remains explicitly priced at zero.

## External provider boundary

EDUTOOL itself has no paid tier. Users may still choose an external AI provider
and supply their own API key. Any charges from that provider belong to the
user's separate provider account; they are not an EDUTOOL product fee.

## Lane

This is a public-product, policy, and discovery lane. It removes an EDUTOOL
paid-service offer while preserving the existing free application, support
channel, optional bring-your-own-provider configuration, and Scion generation
pipeline.

## Release Boundary

This patch changes public presentation, discovery, support, and legal copy. It
does not change Scion generation, model weights, evidence admission, compiler
schemas, package grading, exporters, or the v0.18.3 seamless-generation flow.

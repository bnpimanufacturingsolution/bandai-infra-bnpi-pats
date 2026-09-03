# BRD - Hikvision Copy to All Peer Devices Performance

## Executive Summary

Project Truth administrators need the existing **Copy to all peer devices**
action to finish as one coordinated device operation. The current browser flow
sends one complete request per peer in sequence, so copying one user to five
peers repeats SSH, VM startup, SDK login, source reads, and verification five
times. The result can take close to a minute even though a single-peer copy was
previously proven below five seconds.

## Business Problem

The slow flow makes a healthy operation appear stuck, encourages duplicate
clicks or abandoned work, and delays device enrollment at the point where an
administrator expects immediate confirmation. The browser network evidence
shows repeated `copy-user` requests instead of one operation with per-target
results.

## Goals and KPIs

- Submit one API request for one source user and one or more peer devices.
- Start one scoped VM/HCNetSDK session for the selected source and all
  requested targets.
- Complete the reachable five-peer path within five seconds at p95 in the
  proven local/VM topology.
- Preserve a result for every target: copied, already synchronized, failed, or
  not verified.
- Keep successful peer writes when another peer is offline and allow retry of
  failed peers only.
- Measure API total time, VM SDK time, target verification time, successful
  target count, and failed target count.

## Target Users

Primary: HRIS/device administrator maintaining Hikvision device-user
enrollment across multiple terminals.

Secondary: operations engineers reviewing API timing and per-device SDK
evidence.

## Scope

In scope: batch request contract, one multi-device SDK run, bounded
reachability preflight, concurrent target refresh/verification, per-target
result reporting, modal progress/result copy, regression tests, and local
API/browser evidence.

Out of scope: new biometric custody rules, device credential recovery,
destructive device operations, ZKTeco behavior, and declaring GitOps/public
production proof from localhost evidence.

## Constraints and Risks

- The operation remains admin-only and uses `DeviceUser` as durable HRIS
  identity truth.
- Fingerprint/face verification must remain truthful; an API response cannot
  claim a copy that target truth does not confirm.
- One offline target must not serialize long timeouts across all other
  targets.
- Existing single-target clients must remain compatible.
- The VM-managed Cloudflare Tunnel must remain active.

## Decision

Extend the existing `POST /api/device/hikvision/copy-user` contract to accept
`targetDeviceIds` while retaining `targetDeviceId`. The batch path will run one
VM SDK process containing the source plus all targets, then verify targets
concurrently and return a per-target summary.

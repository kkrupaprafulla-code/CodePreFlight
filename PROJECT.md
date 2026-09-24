# CodePreFlight

> Know what your code change could break before you make it.

## Problem

Developers often start implementing a code change before understanding its potential impact.

A seemingly small change can affect:
- Other files
- Functions and call sites
- Tests
- Dependencies
- APIs
- High-risk parts of an application

The result can be unexpected regressions and wasted debugging time.

## Solution

CodePreFlight is an AI-assisted software change pre-flight system.

Before implementation, a developer describes the change they want to make. CodePreFlight analyzes the repository and produces a structured impact report.

The developer can then review the evidence, approve the plan, and use IBM Bob to implement the change.

After implementation, tests are run and CodePreFlight presents the verification result.

## Core Workflow

```text
Developer proposes a change
        ↓
CodePreFlight analyzes repository
        ↓
Impact / Risk Report
        ↓
Developer reviews the evidence
        ↓
Approve
        ↓
IBM Bob assists implementation
        ↓
Tests run
        ↓
Verification Result
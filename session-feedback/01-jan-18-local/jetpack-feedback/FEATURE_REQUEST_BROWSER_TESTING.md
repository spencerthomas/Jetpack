# Feature Request: Multi-Agent Browser Testing

**Date**: 2026-01-19
**Priority**: Medium
**Category**: Testing Infrastructure

---

## Summary

Enable Jetpack agents to perform browser-based testing (E2E, visual verification, QA exploration, regression) as part of the autonomous build process.

---

## Problem Statement

Currently, Jetpack agents can:
- ✅ Write code
- ✅ Run unit tests
- ✅ Run CLI-based E2E tests (Playwright headless)
- ❌ **Cannot** interact with a browser visually
- ❌ **Cannot** do exploratory QA testing
- ❌ **Cannot** verify UI rendering/visual regressions

This limits the ability to catch UI bugs, visual regressions, and UX issues that only appear in actual browser testing.

---

## Proposed Solution

### Architecture: Multi-Agent Browser Testing Pool

```
┌─────────────────────────────────────────────────────────┐
│              Deployed App (Vercel/Preview URL)           │
│              https://app-preview.vercel.app              │
└─────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │ Browser │   │ Browser │   │ Browser │   │ Browser │
    │ Agent 1 │   │ Agent 2 │   │ Agent 3 │   │ Agent 4 │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘
    Loan Flow     Admin Panel   Regression    Exploratory
```

### Key Features Needed

1. **BrowserExecutor** - New executor type alongside ClaudeCodeExecutor
   ```typescript
   interface BrowserExecutor {
     type: 'browser';
     capabilities: ['navigate', 'click', 'type', 'screenshot', 'assert'];
     targetUrl: string;
   }
   ```

2. **Browser Task Type** - New task category for browser testing
   ```json
   {
     "id": "BROWSER-TEST-1",
     "type": "browser_test",
     "targetUrl": "https://app.vercel.app",
     "testArea": "loan-creation",
     "testType": "e2e|visual|exploratory"
   }
   ```

3. **Screenshot Capture & Comparison** - Visual regression detection
   - Capture screenshots at key UI states
   - Compare against baseline images
   - Flag visual differences for review

4. **Browser Session Management**
   - Each agent gets isolated browser session
   - Session state doesn't leak between agents
   - Configurable browser (Chrome, Firefox, Safari)

5. **Integration with Existing Test Infrastructure**
   - Run Playwright tests as part of pipeline
   - Support for existing `e2e/` test directory
   - Results aggregation across agents

---

## Implementation Suggestions

### Option A: Chrome DevTools Protocol (CDP) Integration
- Use Puppeteer or Playwright programmatically
- Agents control headless browsers
- Works well for automated flows

### Option B: Claude-in-Chrome MCP Integration
- Leverage existing Claude chrome extension
- More exploratory/QA style testing
- Agents can "see" and reason about UI

### Option C: Hybrid Approach (Recommended)
- **Automated tests**: Run via Playwright headless
- **Exploratory testing**: Use chrome MCP for intelligent exploration
- **Visual regression**: Screenshot comparison pipeline

---

## Use Cases

1. **Pre-merge Validation**
   - Deploy PR preview to Vercel
   - Run browser agents against preview
   - Block merge if critical flows fail

2. **Nightly Regression Suite**
   - Full E2E coverage of all user flows
   - Visual regression detection
   - Performance metrics collection

3. **Exploratory QA**
   - Agents explore app looking for bugs
   - Test edge cases humans might miss
   - Report unexpected behaviors

4. **Accessibility Testing**
   - Verify screen reader compatibility
   - Check keyboard navigation
   - Validate ARIA labels

---

## Configuration Example

```typescript
const config: JetpackConfig = {
  // ... existing config ...

  browserTesting: {
    enabled: true,
    targetUrl: process.env.PREVIEW_URL || 'http://localhost:3000',

    // Browser pool configuration
    browserPool: {
      maxBrowsers: 4,
      browser: 'chromium',
      headless: true,
    },

    // Test types to run
    testTypes: {
      e2e: true,           // Run Playwright specs
      visual: true,        // Screenshot comparison
      exploratory: true,   // AI-driven exploration
    },

    // Areas to test (maps to agents)
    testAreas: [
      { name: 'loan-creation', routes: ['/', '/loan/*'] },
      { name: 'underwriting', routes: ['/loan/*/underwriting'] },
      { name: 'admin', routes: ['/admin/*'] },
      { name: 'exploratory', routes: ['*'] },
    ],

    // Visual regression settings
    visualRegression: {
      baselineDir: '.jetpack/visual-baselines/',
      diffThreshold: 0.1,  // 10% pixel difference allowed
      updateBaselines: false,
    },
  },
};
```

---

## Expected Benefits

| Benefit | Impact |
|---------|--------|
| Catch UI bugs early | Reduce production issues |
| Visual regression detection | Prevent unintended UI changes |
| Faster QA cycles | AI explores faster than manual QA |
| Better test coverage | Test flows humans might skip |
| Accessibility compliance | Automated a11y checks |

---

## Related

- Existing Playwright setup: `playwright.config.ts`, `e2e/*.spec.ts`
- Chrome MCP tools: `mcp__claude-in-chrome__*`
- Vercel deployment: `vercel` CLI

---

## Priority Justification

This feature would significantly enhance Jetpack's ability to deliver **production-ready** software by catching visual and interaction bugs that code-only testing misses. Many critical bugs only manifest in actual browser rendering.

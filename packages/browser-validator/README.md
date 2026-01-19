# @jetpack-agent/browser-validator

Browser-based validation for UI tasks using Playwright. Automatically validates that UI changes render correctly and elements are accessible.

## Installation

```bash
npm install @jetpack-agent/browser-validator
```

Playwright browsers will be installed automatically. If needed, run:

```bash
npx playwright install chromium
```

## Quick Start

```typescript
import { BrowserValidator } from '@jetpack-agent/browser-validator';

const validator = new BrowserValidator({
  devServerUrl: 'http://localhost:3000',
  headless: true,
});

// Validate a page with specific checks
const result = await validator.validate('/dashboard', [
  {
    selector: 'button',
    text: 'Submit',
    description: 'Submit button',
    required: true,
    checkType: 'text_contains',
  },
  {
    selector: 'input[name="email"]',
    description: 'Email input field',
    required: true,
    checkType: 'exists',
  },
]);

console.log(result.success); // true if all required checks pass
console.log(result.screenshots); // paths to captured screenshots

await validator.close();
```

## Features

- Automatic UI task detection based on skills and keywords
- Natural language parsing for validation checks
- Multi-browser support (Chromium, Firefox, WebKit)
- Screenshot capture on validation
- Console error detection
- Page load timing metrics

## API

### `BrowserValidator`

Main class for browser-based validation.

```typescript
const validator = new BrowserValidator(config);
```

#### Configuration

```typescript
interface BrowserValidatorConfig {
  /** URL of dev server to validate against */
  devServerUrl?: string; // default: 'http://localhost:3000'

  /** Timeout for page load in ms */
  pageLoadTimeoutMs?: number; // default: 30000

  /** Timeout for element checks in ms */
  elementTimeoutMs?: number; // default: 5000

  /** Whether to take screenshots on validation */
  captureScreenshots?: boolean; // default: true

  /** Directory to save screenshots */
  screenshotDir?: string; // default: '.jetpack/screenshots'

  /** Browser to use */
  browser?: 'chromium' | 'firefox' | 'webkit'; // default: 'chromium'

  /** Run browser in headless mode */
  headless?: boolean; // default: true

  /** Viewport width */
  viewportWidth?: number; // default: 1280

  /** Viewport height */
  viewportHeight?: number; // default: 720
}
```

### Methods

#### `validate(urlPath, checks)`

Validate a page against a set of checks.

```typescript
const result = await validator.validate('/page', checks);
```

Returns `BrowserValidationResult`:

```typescript
interface BrowserValidationResult {
  success: boolean;
  url: string;
  pageTitle?: string;
  loadTimeMs: number;
  screenshots: string[];
  errors: string[];
  consoleErrors: string[];
  elementChecks: ElementCheckResult[];
  timestamp: Date;
}
```

#### `validateTask(task, options)`

Convenience method that determines if a task is UI-related, extracts validation checks from the task description, and runs validation.

```typescript
const result = await validator.validateTask(task, {
  path: '/dashboard',
  additionalChecks: [
    { selector: '#header', required: true, checkType: 'exists' }
  ],
});
```

#### `isUITask(task)`

Check if a task is a UI task based on skills and description.

```typescript
if (validator.isUITask(task)) {
  // Task involves UI work
}
```

#### `extractValidationChecks(task)`

Extract validation checks from a task's natural language description.

```typescript
const checks = validator.extractValidationChecks(task);
// Parses patterns like:
// - "button labeled 'Submit'"
// - "input for 'email'"
// - "heading 'Welcome'"
// - "link to 'Settings'"
```

#### `close()`

Close the browser instance.

```typescript
await validator.close();
```

### Validation Check Types

```typescript
interface ValidationCheck {
  /** CSS selector or element type to find */
  selector: string;

  /** Text content to look for */
  text?: string;

  /** Human-readable description */
  description?: string;

  /** Whether this check must pass for validation to succeed */
  required?: boolean; // default: true

  /** Type of check to perform */
  checkType?: 'exists' | 'visible' | 'text_contains' | 'text_equals' | 'attribute';

  /** Attribute to check (for attribute check type) */
  attribute?: string;

  /** Expected attribute value */
  attributeValue?: string;
}
```

## UI Task Detection

The validator automatically detects UI tasks based on:

**Skills:**
- frontend, react, ui, css, nextjs, vue, angular, svelte

**Keywords:**
- button, form, modal, dialog, input, dropdown
- menu, navbar, sidebar, header, footer, card
- table, list, grid, layout, component, page
- style, css, responsive, mobile, desktop

## Dependencies

- **playwright** - Browser automation
- **zod** - Schema validation
- **@jetpack-agent/shared** - Shared types and utilities

## License

MIT

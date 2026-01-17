/**
 * Browser Validator Types (Enhancement 7)
 *
 * Types for browser-based validation of UI tasks.
 */

import { z } from 'zod';

/**
 * A validation check to perform on the page
 */
export const ValidationCheckSchema = z.object({
  /** CSS selector or element type to find */
  selector: z.string(),
  /** Text content to look for (optional) */
  text: z.string().optional(),
  /** Human-readable description */
  description: z.string().optional(),
  /** Whether this check must pass for validation to succeed */
  required: z.boolean().default(true),
  /** Type of check to perform */
  checkType: z.enum(['exists', 'visible', 'text_contains', 'text_equals', 'attribute']).default('exists'),
  /** Attribute to check (for attribute check type) */
  attribute: z.string().optional(),
  /** Expected attribute value */
  attributeValue: z.string().optional(),
});
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

/**
 * Result of a single element check
 */
export const ElementCheckResultSchema = z.object({
  selector: z.string(),
  description: z.string().optional(),
  found: z.boolean(),
  visible: z.boolean(),
  textContent: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type ElementCheckResult = z.infer<typeof ElementCheckResultSchema>;

/**
 * Overall browser validation result
 */
export const BrowserValidationResultSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  pageTitle: z.string().optional(),
  loadTimeMs: z.number(),
  screenshots: z.array(z.string()),
  errors: z.array(z.string()),
  consoleErrors: z.array(z.string()),
  elementChecks: z.array(ElementCheckResultSchema),
  timestamp: z.date(),
});
export type BrowserValidationResult = z.infer<typeof BrowserValidationResultSchema>;

/**
 * Browser validator configuration
 */
export const BrowserValidatorConfigSchema = z.object({
  /** URL of dev server to validate against */
  devServerUrl: z.string().url().default('http://localhost:3000'),
  /** Timeout for page load in ms */
  pageLoadTimeoutMs: z.number().int().min(1000).default(30000),
  /** Timeout for element checks in ms */
  elementTimeoutMs: z.number().int().min(500).default(5000),
  /** Whether to take screenshots on validation */
  captureScreenshots: z.boolean().default(true),
  /** Directory to save screenshots */
  screenshotDir: z.string().default('.jetpack/screenshots'),
  /** Browser to use (chromium, firefox, webkit) */
  browser: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  /** Run browser in headless mode */
  headless: z.boolean().default(true),
  /** Viewport width */
  viewportWidth: z.number().int().min(320).default(1280),
  /** Viewport height */
  viewportHeight: z.number().int().min(240).default(720),
});
export type BrowserValidatorConfig = z.infer<typeof BrowserValidatorConfigSchema>;

/**
 * UI task detection patterns
 */
export interface UITaskPatterns {
  /** Skills that indicate UI work */
  uiSkills: string[];
  /** Keywords in task description that indicate UI work */
  uiKeywords: string[];
  /** File patterns that indicate frontend code */
  frontendFilePatterns: RegExp[];
}

/**
 * Default UI task detection patterns
 */
export const DEFAULT_UI_PATTERNS: UITaskPatterns = {
  uiSkills: ['frontend', 'react', 'ui', 'css', 'nextjs', 'vue', 'angular', 'svelte'],
  uiKeywords: [
    'button', 'form', 'modal', 'dialog', 'input', 'dropdown',
    'menu', 'navbar', 'sidebar', 'header', 'footer', 'card',
    'table', 'list', 'grid', 'layout', 'component', 'page',
    'style', 'css', 'responsive', 'mobile', 'desktop',
  ],
  frontendFilePatterns: [
    /\.tsx?$/,
    /\.jsx?$/,
    /\.vue$/,
    /\.svelte$/,
    /\.css$/,
    /\.scss$/,
    /\.less$/,
    /components?\//,
    /pages?\//,
    /views?\//,
  ],
};

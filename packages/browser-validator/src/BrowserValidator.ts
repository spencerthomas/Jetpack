/**
 * Browser Validator (Enhancement 7)
 *
 * Provides browser-based validation for UI tasks using Playwright.
 * Validates that UI changes render correctly and elements are accessible.
 */

import { chromium, firefox, webkit, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger, Task } from '@jetpack-agent/shared';
import {
  BrowserValidatorConfig,
  BrowserValidatorConfigSchema,
  ValidationCheck,
  ElementCheckResult,
  BrowserValidationResult,
  DEFAULT_UI_PATTERNS,
  UITaskPatterns,
} from './types';

export class BrowserValidator {
  private config: BrowserValidatorConfig;
  private logger: Logger;
  private browser?: Browser;
  private uiPatterns: UITaskPatterns;

  constructor(config: Partial<BrowserValidatorConfig> = {}) {
    this.config = BrowserValidatorConfigSchema.parse(config);
    this.logger = new Logger('BrowserValidator');
    this.uiPatterns = DEFAULT_UI_PATTERNS;
  }

  /**
   * Initialize the browser (lazy initialization)
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const browserType = this.config.browser;
    const launchOptions = {
      headless: this.config.headless,
    };

    this.logger.info(`Launching ${browserType} browser (headless: ${this.config.headless})`);

    switch (browserType) {
      case 'firefox':
        this.browser = await firefox.launch(launchOptions);
        break;
      case 'webkit':
        this.browser = await webkit.launch(launchOptions);
        break;
      case 'chromium':
      default:
        this.browser = await chromium.launch(launchOptions);
    }

    return this.browser;
  }

  /**
   * Check if a task is a UI task based on skills and description
   */
  isUITask(task: Task): boolean {
    // Check skills
    const hasUISkill = task.requiredSkills?.some(skill =>
      this.uiPatterns.uiSkills.includes(skill.toLowerCase())
    );

    if (hasUISkill) {
      return true;
    }

    // Check keywords in description
    const description = `${task.title} ${task.description || ''}`.toLowerCase();
    const hasUIKeyword = this.uiPatterns.uiKeywords.some(keyword =>
      description.includes(keyword.toLowerCase())
    );

    return hasUIKeyword;
  }

  /**
   * Extract validation checks from task description
   * Parses natural language to find elements to validate
   */
  extractValidationChecks(task: Task): ValidationCheck[] {
    const checks: ValidationCheck[] = [];
    const description = `${task.title} ${task.description || ''}`;

    // Pattern matching for UI elements mentioned in task
    // Button patterns: "button labeled X", "X button", "click button"
    const buttonMatches = description.matchAll(/(?:button\s+(?:labeled\s+)?["']([^"']+)["']|["']([^"']+)["']\s+button)/gi);
    for (const match of buttonMatches) {
      const text = match[1] || match[2];
      if (text) {
        checks.push({
          selector: 'button',
          text,
          description: `Button with text "${text}"`,
          required: true,
          checkType: 'text_contains',
        });
      }
    }

    // Form patterns: "form with X", "input for X"
    const inputMatches = description.matchAll(/input\s+(?:for|named|labeled)\s+["']([^"']+)["']/gi);
    for (const match of inputMatches) {
      checks.push({
        selector: `input[placeholder*="${match[1]}"], input[name*="${match[1]}"], label:has-text("${match[1]}") + input`,
        description: `Input for "${match[1]}"`,
        required: true,
        checkType: 'exists',
      });
    }

    // Heading patterns: "heading X", "title X"
    const headingMatches = description.matchAll(/(?:heading|title)\s+["']([^"']+)["']/gi);
    for (const match of headingMatches) {
      checks.push({
        selector: 'h1, h2, h3, h4, h5, h6',
        text: match[1],
        description: `Heading with text "${match[1]}"`,
        required: true,
        checkType: 'text_contains',
      });
    }

    // Link patterns: "link to X", "link labeled X"
    const linkMatches = description.matchAll(/link\s+(?:to|labeled|named)\s+["']([^"']+)["']/gi);
    for (const match of linkMatches) {
      checks.push({
        selector: 'a',
        text: match[1],
        description: `Link with text "${match[1]}"`,
        required: true,
        checkType: 'text_contains',
      });
    }

    return checks;
  }

  /**
   * Validate a page against a set of checks
   */
  async validate(
    urlPath: string,
    checks: ValidationCheck[]
  ): Promise<BrowserValidationResult> {
    const url = urlPath.startsWith('http')
      ? urlPath
      : `${this.config.devServerUrl}${urlPath.startsWith('/') ? urlPath : '/' + urlPath}`;

    const result: BrowserValidationResult = {
      success: true,
      url,
      loadTimeMs: 0,
      screenshots: [],
      errors: [],
      consoleErrors: [],
      elementChecks: [],
      timestamp: new Date(),
    };

    let context: BrowserContext | undefined;
    let page: Page | undefined;

    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        viewport: {
          width: this.config.viewportWidth,
          height: this.config.viewportHeight,
        },
      });

      page = await context.newPage();

      // Capture console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          result.consoleErrors.push(msg.text());
        }
      });

      // Capture page errors
      page.on('pageerror', error => {
        result.errors.push(`Page error: ${error.message}`);
      });

      // Navigate to URL
      const startTime = Date.now();
      this.logger.info(`Navigating to ${url}`);

      try {
        await page.goto(url, {
          timeout: this.config.pageLoadTimeoutMs,
          waitUntil: 'networkidle',
        });
      } catch (navError) {
        result.success = false;
        result.errors.push(`Navigation failed: ${(navError as Error).message}`);
        return result;
      }

      result.loadTimeMs = Date.now() - startTime;
      result.pageTitle = await page.title();

      this.logger.info(`Page loaded in ${result.loadTimeMs}ms: "${result.pageTitle}"`);

      // Take initial screenshot
      if (this.config.captureScreenshots) {
        await this.ensureScreenshotDir();
        const screenshotPath = path.join(
          this.config.screenshotDir,
          `validation-${Date.now()}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshots.push(screenshotPath);
        this.logger.debug(`Screenshot saved: ${screenshotPath}`);
      }

      // Perform element checks
      for (const check of checks) {
        const checkResult = await this.performCheck(page, check);
        result.elementChecks.push(checkResult);

        if (!checkResult.found && check.required) {
          result.success = false;
          result.errors.push(
            `Required element not found: ${check.description || check.selector}`
          );
        }
      }

      // Check for console errors (may indicate JS issues)
      if (result.consoleErrors.length > 0) {
        this.logger.warn(`${result.consoleErrors.length} console errors detected`);
        // Console errors don't fail validation by default, but log them
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Validation failed: ${(error as Error).message}`);
      this.logger.error('Validation error:', error);
    } finally {
      if (page) await page.close();
      if (context) await context.close();
    }

    return result;
  }

  /**
   * Perform a single element check
   */
  private async performCheck(
    page: Page,
    check: ValidationCheck
  ): Promise<ElementCheckResult> {
    const result: ElementCheckResult = {
      selector: check.selector,
      description: check.description,
      found: false,
      visible: false,
    };

    try {
      // Build locator based on check type
      let locator;
      if (check.text && check.checkType === 'text_contains') {
        locator = page.locator(`${check.selector}:has-text("${check.text}")`);
      } else if (check.text && check.checkType === 'text_equals') {
        locator = page.locator(`${check.selector}:text-is("${check.text}")`);
      } else {
        locator = page.locator(check.selector);
      }

      // Wait for element with timeout
      const element = locator.first();
      const count = await locator.count();

      if (count > 0) {
        result.found = true;
        result.visible = await element.isVisible();

        // Get text content if applicable
        try {
          const text = await element.textContent({ timeout: 1000 });
          result.textContent = text ?? undefined;
        } catch {
          // Text content not available
        }
      }

    } catch (error) {
      result.errorMessage = (error as Error).message;
    }

    return result;
  }

  /**
   * Ensure screenshot directory exists
   */
  private async ensureScreenshotDir(): Promise<void> {
    await fs.mkdir(this.config.screenshotDir, { recursive: true });
  }

  /**
   * Validate a task (convenience method)
   * Determines if task is UI, extracts checks, and runs validation
   */
  async validateTask(
    task: Task,
    options: { path?: string; additionalChecks?: ValidationCheck[] } = {}
  ): Promise<BrowserValidationResult | null> {
    if (!this.isUITask(task)) {
      this.logger.debug(`Task ${task.id} is not a UI task, skipping browser validation`);
      return null;
    }

    const autoChecks = this.extractValidationChecks(task);
    const allChecks = [...autoChecks, ...(options.additionalChecks || [])];

    if (allChecks.length === 0) {
      this.logger.debug(`No validation checks extracted for task ${task.id}`);
      // Still navigate to page to check for errors
    }

    const urlPath = options.path || '/';
    this.logger.info(`Validating UI task ${task.id} at ${urlPath} with ${allChecks.length} checks`);

    return this.validate(urlPath, allChecks);
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.logger.info('Browser closed');
    }
  }
}

import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  console.log("=== Playwright React 19 Event Fix Test ===\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  // Inject a monkey-patch before any page loads
  await context.addInitScript(() => {
    const nativeDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    );

    Object.defineProperty(window.HTMLTextAreaElement.prototype, "value", {
      configurable: true,
      enumerable: true,
      set(value) {
        nativeDescriptor.set.call(this, value);
        // Dispatch proper events that React 19 listens for
        this.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: value,
        }));
        this.dispatchEvent(new Event("change", {
          bubbles: true,
          cancelable: true,
        }));
      },
      get() {
        return nativeDescriptor.get.call(this);
      },
    });
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.text().includes("[Interview]") || msg.text().includes("charCount") || msg.text().includes("value")) {
      console.log(`  [console] ${msg.text()}`);
    }
  });

  console.log("1. Navigating to home...");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Select deep mode
  console.log("2. Selecting deep mode...");
  const deepBtn = page.getByRole("button", { name: /深度扫描/ });
  await deepBtn.click();
  await page.waitForTimeout(500);

  // Check CTA
  const ctaBtn = page.getByRole("button", { name: /X 光扫描/ });
  const ctaText = await ctaBtn.textContent();
  console.log(`   CTA text: "${ctaText}"`);

  // Enter text using evaluate to directly set value
  console.log("3. Entering test input...");
  const TEST_INPUT = "最近三个月，我明显感觉到部门里的氛围变了。以前每周一的例会都是我主持的，现在领导突然让另一个同事代替我主持。我负责跟进两年多的核心客户项目，上个月被通知转交给另一个团队对接。";

  const textarea = page.locator("textarea").first();

  // Method: use fill() which now goes through our patched setter
  await textarea.fill(TEST_INPUT);
  await page.waitForTimeout(500);

  // Check if text was entered
  const textValue = await textarea.inputValue();
  console.log(`   textarea value length: ${textValue.length}`);

  // Check if CTA button is enabled
  const isDisabled = await ctaBtn.isDisabled();
  console.log(`   CTA button disabled: ${isDisabled}`);

  // Check character count display
  const charDisplay = await page.locator("text=/\\d+\\s*字符/").first().textContent().catch(() => "not found");
  console.log(`   Char display: ${charDisplay}`);

  // Also check for char count in any form
  const allText = await page.textContent("body");
  const charMatch = allText.match(/(\d+)\s*[\/／]\s*(\d+)\s*字符/);
  if (charMatch) {
    console.log(`   Char counter: ${charMatch[0]}`);
  }

  // Now try fill with empty first, then type (simulating user typing)
  console.log("\n4. Trying fill('') then fill(input)...");
  await textarea.fill("");
  await page.waitForTimeout(300);
  await textarea.fill(TEST_INPUT);
  await page.waitForTimeout(500);

  const textValue2 = await textarea.inputValue();
  console.log(`   textarea value length after re-fill: ${textValue2.length}`);
  const isDisabled2 = await ctaBtn.isDisabled();
  console.log(`   CTA button disabled after re-fill: ${isDisabled2}`);

  // Try clicking the CTA
  console.log("\n5. Trying to click CTA button...");
  try {
    if (!isDisabled2) {
      await ctaBtn.click();
      await page.waitForTimeout(1000);
      const currentUrl = page.url();
      console.log(`   URL after click: ${currentUrl}`);
      if (currentUrl.includes("interview")) {
        console.log("   ✅ SUCCESS: Navigated to interview page!");
      }
    } else {
      console.log("   ❌ CTA button still disabled, cannot proceed");

      // Diagnostic: check React state
      console.log("\n6. Running diagnostic...");
      const diag = await page.evaluate(() => {
        const ta = document.querySelector("textarea");
        return {
          textareaExists: !!ta,
          textareaValue: ta?.value,
          textareaValueLength: ta?.value?.length,
          allButtons: [...document.querySelectorAll("button")].map((b, i) => ({
            i,
            text: b.textContent?.slice(0, 50),
            disabled: b.disabled,
          })),
          // Check for React internal state via __reactFiber
          reactFiberOnTextarea: ta ? !!ta._reactFiber || !!ta.__reactFiber$ : false,
        };
      });
      console.log("   Diagnostics:", JSON.stringify(diag, null, 2));
    }
  } catch (e) {
    console.log(`   Error: ${e.message}`);
  }

  await page.screenshot({ path: "/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/rc-rounds-output/fix-test.png" });
  console.log("\nScreenshot saved.");

  await browser.close();
  console.log("\n=== Test Complete ===");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

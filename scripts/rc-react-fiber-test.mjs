import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  console.log("=== React Fiber Direct Manipulation Test ===\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[ReactFiber]") || text.includes("[inputTest]")) {
      console.log(`  [console] ${text}`);
    }
  });

  console.log("1. Navigate...");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Select deep mode
  await page.getByRole("button", { name: /深度扫描/ }).click();
  await page.waitForTimeout(500);

  const TEST_INPUT = "最近三个月，我明显感觉到部门里的氛围变了。以前每周一的例会都是我主持的，现在领导突然让另一个同事代替我主持。我负责跟进两年多的核心客户项目，上个月被通知转交给另一个团队对接。";

  // Try approach: use page.evaluate to manipulate React internal state
  console.log("2. Trying React fiber manipulation...");
  
  const result = await page.evaluate((input) => {
    // Find the textarea
    const textarea = document.querySelector("textarea");
    if (!textarea) return { error: "No textarea found" };

    // Try to access React fiber
    const fiberKey = Object.keys(textarea).find(k => 
      k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
    );
    
    const fiber = fiberKey ? textarea[fiberKey] : null;
    
    // Walk up the fiber tree to find state
    let node = fiber;
    let found = null;
    let depth = 0;
    while (node && depth < 50) {
      // Check for memoizedState (hooks state)
      if (node.memoizedState) {
        // Check if it's a useState hook
        let hook = node.memoizedState;
        let hookIdx = 0;
        while (hook) {
          const hookInfo = {
            depth,
            hookIdx,
            hasQueue: !!hook.queue,
            hasState: hook.memoizedState !== undefined && hook.memoizedState !== null,
            stateType: typeof hook.memoizedState,
          };
          
          if (hook.queue && hook.queue.lastRenderedState !== undefined && 
              typeof hook.queue.lastRenderedState === 'string') {
            const oldState = hook.queue.lastRenderedState;
            const dispatch = hook.queue.dispatch;
            
            if (dispatch) {
              try {
                dispatch(input);
                hookInfo.dispatchCalled = true;
                hookInfo.oldState = oldState.slice(0, 50);
                found = { depth, hookIdx, dispatchCalled: true };
              } catch(e) {
                hookInfo.dispatchError = e.message;
              }
            }
          }
          hook = hook.next;
          hookIdx++;
        }
      }
      
      // Also check for class component state (setState)
      if (node.stateNode && node.stateNode.setState) {
        try {
          // Store for later use
          found = { ...found, hasSetState: true, stateNodeType: typeof node.stateNode };
        } catch(e) {}
      }
      
      node = node.return;
      depth++;
    }

    return { 
      fiberKey, 
      found,
      textareaValue: textarea.value,
    };
  }, TEST_INPUT);

  console.log("   Fiber result:", JSON.stringify(result, null, 2));

  // Check if CTA button is now enabled
  const ctaBtn = page.getByRole("button", { name: /X 光扫描/ });
  const isDisabled = await ctaBtn.isDisabled();
  console.log(`   CTA disabled after fiber manipulation: ${isDisabled}`);

  // Alternative: try to simulate proper typing via keyboard at textarea level
  if (isDisabled) {
    console.log("\n3. Trying direct keyboard typing...");
    const textarea = page.locator("textarea").first();
    
    // Clear first
    await textarea.click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);
    
    // Type slowly
    await page.keyboard.type(TEST_INPUT, { delay: 10 });
    await page.waitForTimeout(500);
    
    const val = await textarea.inputValue();
    console.log(`   typed value length: ${val.length}`);
    
    const dis2 = await ctaBtn.isDisabled();
    console.log(`   CTA disabled after keyboard.type: ${dis2}`);
  }

  // Try another approach: evaluate to inject input via execCommand
  if (isDisabled) {
    console.log("\n4. Trying execCommand('insertText')...");
    
    await page.evaluate((input) => {
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textarea.focus();
        textarea.value = "";
        document.execCommand("selectAll", false);
        document.execCommand("insertText", false, input);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, TEST_INPUT);
    
    await page.waitForTimeout(500);
    const dis3 = await ctaBtn.isDisabled();
    console.log(`   CTA disabled after execCommand: ${dis3}`);
  }

  // Final check: all buttons state
  const finalState = await page.evaluate(() => {
    return [...document.querySelectorAll("button")].map((b, i) => ({
      i,
      text: b.textContent?.slice(0, 60),
      disabled: b.disabled,
    }));
  });
  console.log("\n5. Final button states:", JSON.stringify(finalState, null, 2));

  await browser.close();
  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

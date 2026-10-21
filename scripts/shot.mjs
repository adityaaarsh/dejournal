/**
 * Dev helper: drive the running app in headless Edge and take screenshots.
 *
 *   node scripts/shot.mjs <baseUrl> <outDir> [stepsFile.json]
 *
 * Steps file: an array of steps run in order on one page, e.g.
 *   [{ "goto": "/" }, { "click": "text=Add task" }, { "fill": ["#title", "Buy milk"] },
 *    { "press": "Enter" }, { "wait": 300 }, { "shot": "today" }, { "eval": "document.title" },
 *    { "viewport": [1280, 800] }]
 * Without a steps file it screenshots "/" at phone size.
 * Console errors and page errors are printed so runtime problems are visible.
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const [, , base = 'http://localhost:5173', outDir = 'shots', stepsFile] = process.argv
const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [{ goto: '/' }, { shot: 'home' }]
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text())
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

for (const s of steps) {
  try {
    if (s.goto) await page.goto(base + s.goto, { waitUntil: 'networkidle' })
    else if (s.click) await page.click(s.click, { timeout: 5000 })
    else if (s.fill) await page.fill(s.fill[0], s.fill[1], { timeout: 5000 })
    else if (s.press) await page.keyboard.press(s.press)
    else if (s.type) await page.keyboard.type(s.type)
    else if (s.check) await page.check(s.check, { timeout: 5000 })
    else if (s.select) await page.selectOption(s.select[0], s.select[1], { timeout: 5000 })
    else if (s.upload) await page.setInputFiles(s.upload[0], s.upload[1], { timeout: 5000 })
    else if (s.wait) await page.waitForTimeout(s.wait)
    else if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 5000 })
    else if (s.viewport) await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] })
    else if (s.reload) await page.reload({ waitUntil: 'networkidle' })
    else if (s.eval) console.log('[eval]', JSON.stringify(await page.evaluate(s.eval)))
    else if (s.text) console.log('[text]', (await page.locator(s.text).first().innerText({ timeout: 5000 })).slice(0, 2000))
    else if (s.shot) {
      const file = path.join(outDir, `${s.shot}.png`)
      await page.screenshot({ path: file, fullPage: s.full !== false })
      console.log('[shot]', file)
    }
  } catch (e) {
    console.log('[step failed]', JSON.stringify(s), '-', e.message.split('\n')[0])
  }
}
await browser.close()

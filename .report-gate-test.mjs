import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on("pageerror", (err) => errors.push(String(err)))

await page.goto("http://localhost:3000/login")
await page.getByRole("tab", { name: "Admin" }).click()
await page.getByLabel("PIN").fill("7410")
await page.getByRole("button", { name: "Sign in" }).click()
await page.waitForURL("http://localhost:3000/")

// Create a fresh manual event (all matches hasBeenPlayed=false, exactly
// the "TBA is down" scenario reported)
await page.goto("http://localhost:3000/event-setup")
await page.waitForTimeout(800)
await page.getByText("Manual import (when TBA is down)").click()
await page.waitForTimeout(400)
await page.getByPlaceholder("e.g. Rocket City Regional").fill("Gate Test Event")
await page.locator("#manualStartDate").fill("2026-09-19")
await page.locator("#manualEndDate").fill("2026-09-20")
await page.getByRole("button", { name: "Create manual event" }).click()
await page.waitForTimeout(1200)

const teamsCsv = `teamNumber,nickname\n1,Team One\n2,Team Two\n3,Team Three\n4,Team Four\n5,Team Five\n6,Team Six`
const matchesCsv = `matchNumber,red1,red2,red3,blue1,blue2,blue3\n1,1,2,3,4,5,6`
const textareas = page.locator("textarea")
await textareas.nth(0).fill(teamsCsv)
await textareas.nth(1).fill(matchesCsv)
const importButtons = page.getByRole("button", { name: "Import", exact: true })
await importButtons.nth(0).click()
await page.waitForTimeout(1000)
await importButtons.nth(1).click()
await page.waitForTimeout(1000)

// Add a real scout, assign team 1
await page.goto("http://localhost:3000/scout-assignment")
await page.waitForTimeout(800)
await page.getByPlaceholder("Scout name").fill("GateTester")
await page.locator("form").nth(0).locator("button[type=submit]").click()
await page.waitForTimeout(700)
// Assign team 1 to GateTester via the team-assignment select
const teamRow = page.locator("div", { hasText: "Team One" }).last()
await teamRow.getByRole("combobox").click()
await page.waitForTimeout(300)
await page.getByRole("option", { name: "GateTester" }).click()
await page.waitForTimeout(700)

// Now: admin picks GateTester's identity and checks if Qual 1 is clickable
await page.goto("http://localhost:3000/match-scouting")
await page.waitForTimeout(1000)
await page.getByRole("button", { name: "GateTester" }).click()
await page.waitForTimeout(1000)
await page.screenshot({ path: ".gate-dashboard.png" })

const links = await page.locator("a[href*='/match-scouting/']").count()
console.log("Clickable match links found:", links)

if (links > 0) {
  await page.locator("a[href*='/match-scouting/']").first().click()
  await page.waitForTimeout(1000)
  console.log("URL after click:", page.url())
  await page.screenshot({ path: ".gate-report-form.png" })

  // Try submitting
  const submitBtn = page.getByRole("button", { name: /Submit match report/ })
  if (await submitBtn.count() > 0) {
    await submitBtn.click()
    await page.waitForTimeout(1200)
    console.log("URL after submit:", page.url())
  }
}

console.log("Errors:", errors.length ? errors : "none")
await browser.close()

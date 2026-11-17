# Cursor Swarm

A spreadsheet that ten named agent cursors fill in live. Built with Next.js and CSS modules.

The table is real HTML rendered on the server, with every value already in it. When scripting is on and reduced motion is off, the values are hidden and the agents write them in, each with its own cursor and a named selection box.

It started from the idea in Avi Vashishta's post [Agent Sheet](https://www.avivashishta.com/blog/agent-sheet-a-portfolio-spreadsheet-agents-fill-in). The core (server-rendered table, cursors, fill handle, heat map, chart) follows that prompt. The spins below are my own.

## What the agents do

Sum types the headers. Copy types the titles, Tags tags a category, and four agents (Data, Fetch, Count, Stats) count numbers up into their columns, 250 ms apart. Claude types `=F2/C2` and drags the fill handle down. Pixel paints the heat map, Codex drags a marquee and grows a bar chart, Copy types its title, and Sum drags a `SUM` across the totals row.

## Spins

- **Handoffs and yields.** Copy hands each finished title row to Tags. Pixel tails Stats down the heat-map column, keeps arriving at a cell Stats is still counting, and yields (its box grows around the cell and it waits).
- **Chatter bubbles.** Agents say short things above their cursor, and each line goes in the activity log.
- **What-if sliders.** After the run, scale tasks and tasks done. Rows, rates, totals, heat map, bars and the chart title all recompute.
- **Replay scrubber.** Every change is recorded as an event, so you can scrub or play the whole run back at 2x.

- **Speed slider.** Runs from 0.25x to 40x and can be changed mid-run. The far right end is the silly max.

Other details: `data-cell` and `data-f` on every cell, a formula bar, Skip and Rebuild, and a phone layout that drops three columns (the agents still fill them, without a cursor).

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Data

`data/items.json` holds the rows. The items are real, but **the numbers are placeholders**. Replace them with your own. The chart title is computed from the data.

## Files

- `app/page.jsx` reads the data and renders the page on the server.
- `app/Sheet.jsx` and `app/Sheet.module.css` are the table, toolbar, chart and controls.
- `app/engine.js` is the animation engine: one `requestAnimationFrame` loop, an event log, and the agent scripts.

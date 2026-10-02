// tps-report: Bill from management drops by above the prompt while Claude works.
// Purely cosmetic: no hook here touches prompts, tool calls, or what Claude reads.
import { PNG } from './bill-art.js'
import { COLUMNS, FRAMES, ROWS } from './sprite.js'
import { LINES, SPINNER } from './lines.js'

const VISIT_SECONDS = 15 // how long Bill stays each time he drops by
const IMAGE_COLUMNS = 14 // Bill's picture (7:6) over 14 × 6 cells, which keeps its shape in a 1:2 cell
const IMAGE_ROWS = 6
const SVG_WIDTH = 98 // the same picture in the desktop app, in CSS pixels
const SVG_HEIGHT = 84
const SPINNER_SECONDS = 15 // how long the spinner reads "Preparing TPS reports"

let name = 'Bill'
let every = 90 // average seconds between visits, and between spinner swaps

let working = false
let worked = 0 // seconds Claude has spent working this session, across turns
let ticks = 0
let nextVisitAt = 0
let nextSpinnerAt = 0
let visitLeft = 0
let spinnerLeft = 0
let line = ''
let frame = 'idle'
let bandId = null // the terminal's band, where a new frame is swapped in place
let redraws = false // whether the desktop app shows Bill, where a new frame takes a redraw
let bag = []
let images = false // whether the terminal can show images

// A random gap of half to one and a half times the average, in whole seconds
function gap() {
  return Math.max(1, Math.round(every * (0.5 + Math.random())))
}

// Deals lines from a shuffled bag, so Bill doesn't repeat himself until he's said them all
function nextLine() {
  if (bag.length === 0) {
    bag = [...LINES]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
  }
  return bag.pop()
}

// The desktop app draws pictures as SVG, so Bill's PNG goes inside one
function svg(frame) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 384">' +
    `<image width="448" height="384" href="data:image/png;base64,${PNG[frame]}"/></svg>`
  )
}

// Swaps Bill's frame: in place in the terminal, by a redraw in the desktop app
function show($, next) {
  frame = next
  if (visitLeft === 0) return
  if (bandId !== null) {
    const look = images ? { source: { png: PNG[frame] } } : { cells: FRAMES[frame] }
    $.ui.blit({ requestId: bandId, key: 'bill', ...look }).catch(() => {})
  }
  if (redraws) $.ui.invalidate('ui.render')
}

// Flaps his mouth for a second and a half
function talk($) {
  frame = 'talk'
  for (let i = 1; i <= 6; i++) {
    const next = i % 2 === 0 && i < 6 ? 'talk' : 'idle'
    $.clock.after(i * 250, () => show($, next))
  }
}

function tick($) {
  ticks += 1
  let changed = false
  if (visitLeft > 0) {
    visitLeft -= 1
    if (visitLeft === 0) {
      line = ''
      changed = true
    } else if (ticks % 4 === 0 && frame === 'idle') {
      show($, 'blink')
      $.clock.after(150, () => show($, 'idle'))
    }
  }
  if (spinnerLeft > 0) {
    spinnerLeft -= 1
    if (spinnerLeft === 0) changed = true
  }
  if (working) {
    worked += 1
    if (worked >= nextVisitAt) {
      nextVisitAt = worked + gap()
      line = nextLine()
      visitLeft = VISIT_SECONDS
      talk($)
      changed = true
    }
    if (worked >= nextSpinnerAt) {
      nextSpinnerAt = worked + gap()
      spinnerLeft = SPINNER_SECONDS
      changed = true
    }
  }
  if (changed) $.ui.invalidate('ui.render')
}

export function register(on, options) {
  name = String(options.name || 'Bill')
  every = Number(options.pingEverySeconds) || 90
  // He says hello 3 to 10 seconds into Claude's first work, then drops by at random gaps.
  // The countdowns only run while Claude works and carry over between turns, so short turns add up.
  nextVisitAt = 3 + Math.floor(Math.random() * 8)
  nextSpinnerAt = gap()

  on('session.start', async ($, e, next) => {
    // Ghostty and kitty draw real images; other terminals get the half-block sprite
    const term = await $.env.get('TERM_PROGRAM')
    const kitty = await $.env.get('KITTY_WINDOW_ID')
    images = term === 'ghostty' || Boolean(kitty)
    $.clock.every(1000, () => tick($))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    working = true
    return next(e)
  })

  // A subagent's turn ends with agentId set; only the main turn sends Bill home
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      working = false
      spinnerLeft = 0
    }
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!working || spinnerLeft === 0) return next(e)
    return next({ ...e, props: { ...e.props, message: SPINNER } })
  })

  // The terminal draws Bill as an Image or a Raster; the desktop app has neither, so there he's an Svg
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (line === '' || e.props.hasSurvey) return next(e)
    const { Box, Text, Raster, Image, Svg } = $.ui.resolve(e)
    let picture
    if (e.surface === 'terminal') {
      bandId = e.requestId
      picture = images
        ? Image({ key: 'bill', source: { png: PNG[frame] }, columns: IMAGE_COLUMNS, rows: IMAGE_ROWS, alt: name })
        : Raster({ key: 'bill', columns: COLUMNS, rows: ROWS, cells: FRAMES[frame] })
    } else {
      redraws = true
      picture = Svg({ source: svg(frame), width: SVG_WIDTH, height: SVG_HEIGHT, alt: name })
    }
    const columns = Number.isFinite(e.props.bodyColumns) ? e.props.bodyColumns : 80
    const room = Math.max(16, Math.min(56, columns - 20))
    const bubble = Box({
      borderStyle: 'round',
      borderColor: 'red',
      paddingX: 1,
      width: Math.min(line.length + 4, room),
      children: [Text({ children: [line] })],
    })
    const bill = Box({
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      columnGap: 1,
      children: [
        Box({
          flexDirection: 'column',
          alignItems: 'flex-end',
          children: [Text({ bold: true, children: [name + ' · Management'] }), bubble],
        }),
        picture,
      ],
    })
    return Box({ flexDirection: 'column', children: [bill, await next(e)] })
  })
}

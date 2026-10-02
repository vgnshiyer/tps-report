import { expect, mock, test } from 'claude-code/testing'
import { PNG } from '../hooks/bill-art.js'
import { LINES, SPINNER } from '../hooks/lines.js'

const BAND = {
  plugin: 'tps-report',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 32, bodyColumns: 96, scroll: { offset: 0, bodyRows: 32 }, view: {} },
} as const

const SPIN = {
  plugin: 'tps-report',
  surface: 'terminal',
  component: 'Spinner',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
} as const

const TURN = { text: 'refactor auth', turnId: 't1' }
const DONE = { turnId: 't1', answer: 'done', durationMs: 60000, isAborted: false, reason: 'answer', usage: null } as const

// Stands in for Claude Code: answers what the mod passes on, and draws the spinner's own text
function engine(on, env = {}) {
  const clock = mock.clock(on)
  mock.env(on, env)
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.render', ($, e) => ({
    type: 'Text',
    props: {},
    children: [e.component === 'Spinner' ? (e.props.message ?? e.props.word) : 'band'],
  }))
  return clock
}

test("Bill says hello early in Claude's first work, then leaves", { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount(BAND)
  await $.turn.start(TURN)

  // The first visit comes 3 to 10 seconds into Claude's work
  await clock.advance(2000)
  expect(await band.find({ key: 'bill' })).toBeUndefined()
  await clock.advance(8000)
  expect(await band.find({ key: 'bill' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: 'Bill · Management' })).toBeDefined()
  const said = (await band.findAll({ type: 'Text' })).map((t) => t.text)
  expect(said.some((t) => LINES.includes(t))).toBe(true)

  // Once the turn ends no visit starts, and the last one is over within 15 seconds
  await $.turn.complete(DONE)
  await clock.advance(15000)
  expect(await band.find({ key: 'bill' })).toBeUndefined()
})

test('the wait for his next visit carries over between short turns', { options: { pingEverySeconds: 40 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount(BAND)

  // Eight 10-second turns, each shorter than the 20 to 60 second gap between visits
  let visits = 0
  let shown = false
  for (let turn = 1; turn <= 8; turn++) {
    await $.turn.start({ ...TURN, turnId: 't' + turn })
    for (let s = 0; s < 10; s++) {
      await clock.advance(1000)
      const now = (await band.find({ key: 'bill' })) !== undefined
      if (now && !shown) visits += 1
      shown = now
    }
    await $.turn.complete({ ...DONE, turnId: 't' + turn })
  }
  // He says hello by 10 seconds and is back within 60 more seconds of work
  expect(visits).toBeGreaterThanOrEqual(2)
})

test('Bill stays away while Claude is idle', { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount(BAND)
  await clock.advance(120000)
  expect(await band.find({ key: 'bill' })).toBeUndefined()
})

test('the spinner turns to TPS reports at a random moment, then back', { options: { pingEverySeconds: 100 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const spinner = await $.ui.mount(SPIN)
  await $.turn.start(TURN)

  // The first swap comes 50 to 150 seconds in
  let seconds = 0
  while (seconds < 150 && !(await spinner.find({ type: 'Text', text: SPINNER }))) {
    await clock.advance(1000)
    seconds += 1
  }
  expect(seconds).toBeGreaterThanOrEqual(50)
  expect(await spinner.find({ type: 'Text', text: SPINNER })).toBeDefined()

  // It lasts 15 seconds, and the next swap is at least 50 seconds after this one
  await clock.advance(15000)
  expect(await spinner.find({ type: 'Text', text: 'Sauteing' })).toBeDefined()
})

test('uses the boss name from /config', { options: { name: 'Bob', pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount(BAND)
  await $.turn.start(TURN)
  await clock.advance(15000)
  expect(await band.find({ type: 'Text', text: 'Bob · Management' })).toBeDefined()
})

test("never touches the prompt or Claude's tool calls", { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on)
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const prompt = await $.prompt.submit({ text: TURN.text, origin: { kind: 'composer' }, wait: false })
  await $.turn.start(TURN)
  await clock.advance(30000)
  expect(prompt.context).toBeUndefined()
  expect(await $.tool.call({ tool: 'Bash', command: 'npm test' })).toEqual({ result: 'ok' })
})

test('in Ghostty, Bill is a real image', { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on, { TERM_PROGRAM: 'ghostty' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount(BAND)
  await $.turn.start(TURN)
  await clock.advance(10000)
  const bill = await band.find({ key: 'bill' })
  expect(bill?.type).toBe('Image')
  expect(Object.values(PNG)).toContain((bill?.props.source as { png: string }).png)
})

test('in other terminals, Bill is the half-block sprite', { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on, { TERM_PROGRAM: 'Apple_Terminal' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount(BAND)
  await $.turn.start(TURN)
  await clock.advance(10000)
  expect((await band.find({ key: 'bill' }))?.type).toBe('Raster')
})

test('in the desktop app, Bill is the same picture inside an SVG, and his mouth moves', { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await $.turn.start(TURN)

  // He says hello 3 to 10 seconds in, with his name and a line
  let seconds = 0
  while (seconds < 10 && !(await band.find({ type: 'Svg' }))) {
    await clock.advance(1000)
    seconds += 1
  }
  expect(await band.find({ type: 'Text', text: 'Bill · Management' })).toBeDefined()
  const said = (await band.findAll({ type: 'Text' })).map((t) => t.text)
  expect(said.some((t) => LINES.includes(t))).toBe(true)

  // Each frame he's drawn in is one of the three PNGs, and while he talks they change
  const frames = new Set<string>()
  for (let i = 0; i < 8; i++) {
    const source = (await band.find({ type: 'Svg' }))?.props.source as string
    const png = Object.entries<string>(PNG).find(([, data]) => source.includes(data))?.[0]
    expect(png).toBeDefined()
    frames.add(png as string)
    await clock.advance(250)
  }
  expect(frames.has('talk') && frames.has('idle')).toBe(true)

  // He leaves when the visit is over
  await $.turn.complete(DONE)
  await clock.advance(15000)
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
})

test('in the desktop app, the spinner turns to TPS reports too', { options: { pingEverySeconds: 10 } }, async ($, on) => {
  const clock = engine(on)
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
  const spinner = await $.ui.mount({ ...SPIN, surface: 'desktop' })
  await $.turn.start(TURN)
  let seconds = 0
  while (seconds < 15 && !(await spinner.find({ type: 'Text', text: SPINNER }))) {
    await clock.advance(1000)
    seconds += 1
  }
  expect(await spinner.find({ type: 'Text', text: SPINNER })).toBeDefined()
})

import type { SpinnerOptions } from './types'

const DEFAULT_INTERVAL = 80
const INITIAL_FRAME = 0
const FRAME_STEP = 1
const FRAMES = ['-', '\\', '|', '/']

export class Spinner {
  private text: string
  private stdout: NodeJS.WriteStream
  private interval: number
  private isTTY?: boolean
  private timer?: NodeJS.Timeout
  private frameIndex = INITIAL_FRAME
  private active = false

  constructor(text: string | SpinnerOptions) {
    if (typeof text === 'string') {
      this.text = text
      this.stdout = process.stdout
      this.interval = DEFAULT_INTERVAL
      return
    }
    this.text = text.text
    this.stdout = text.stdout ?? process.stdout
    this.interval = text.interval ?? DEFAULT_INTERVAL
    this.isTTY = text.isTTY
  }
  start(): this {
    if (this.active) {
      return this
    }
    this.active = true
    if (!this.tty()) {
      this.stdout.write(`${this.text}...\n`)
      return this
    }
    this.render()
    this.timer = setInterval(() => this.render(), this.interval)
    return this
  }
  stop(): this {
    if (!this.active) {
      return this
    }
    this.active = false
    if (this.timer) {
      clearInterval(this.timer)
    }
    if (this.tty()) {
      this.stdout.write('\r\x1b[2K')
    }
    return this
  }
  succeed(text?: string): this {
    this.stop()
    this.stdout.write(`[ok] ${text ?? this.text}\n`)
    return this
  }
  fail(text?: string): this {
    this.stop()
    this.stdout.write(`[fail] ${text ?? this.text}\n`)
    return this
  }
  private render(): void {
    const frame = FRAMES[this.frameIndex % FRAMES.length]
    this.frameIndex += FRAME_STEP
    this.stdout.write(`\r${frame} ${this.text}`)
  }
  private tty(): boolean {
    return this.isTTY ?? this.stdout.isTTY ?? false
  }
}

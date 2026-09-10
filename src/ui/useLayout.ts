import { useEffect, useState } from 'react'

export type LayoutMode = 'wide' | 'medium' | 'compact'

/**
 * Which layout the available space can carry.
 *
 * Chosen from the window, never from the device: a phone held sideways, a
 * desktop browser dragged narrow and a tablet in portrait all present the same
 * problem, and asking what kind of hardware is on the other end answers the
 * wrong question. Height matters as much as width — a 390px-tall landscape
 * phone has plenty of room across and almost none down, and the layout that
 * works there is the same stacked one a narrow window needs.
 */
const WIDE_FROM = 1240
const MEDIUM_FROM = 900
const SHORT_BELOW = 520

export function layoutFor(width: number, height: number): LayoutMode {
  if (height < SHORT_BELOW) return 'compact'
  if (width >= WIDE_FROM) return 'wide'
  if (width >= MEDIUM_FROM) return 'medium'
  return 'compact'
}

const read = (): LayoutMode => {
  if (typeof window === 'undefined') return 'wide'
  return layoutFor(window.innerWidth, window.innerHeight)
}

export function useLayout(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(read)

  useEffect(() => {
    // Answered on the event itself rather than deferred to a frame. Dragging a
    // window fires this continuously, but the answer only changes twice across
    // the whole range, and React drops a set to the value already held — so
    // there is no storm to coalesce, and deferring only buys a frame of the
    // previous layout drawn at the new size.
    const onResize = () => setMode(read())

    // Two sources, because `resize` alone does not cover what a phone does.
    // `resize` is queued: window.innerWidth is already the new number before the
    // event is dispatched, so anything reading in between sees the old layout at
    // the new size. A ResizeObserver reports from layout itself, which closes
    // that gap and is also the only signal for a viewport that changes without a
    // window event — an address bar collapsing as the page scrolls, a devtools
    // pane opening beside it.
    //
    // Not visualViewport: it reports the *visual* viewport, which the on-screen
    // keyboard and pinch-zoom both change while `window.innerHeight` — the
    // number this hook reads — stays put. Subscribing to it would fire the
    // listener without ever changing the answer, and reading from it instead
    // would make pinch-zooming switch layouts. The page has no text field for a
    // keyboard to open over, so there is nothing here to solve.
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    const observer = new ResizeObserver(onResize)
    observer.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      observer.disconnect()
    }
  }, [])

  return mode
}

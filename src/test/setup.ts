import '@testing-library/jest-dom'

// jsdom doesn't implement these; Radix UI's Select/Popover/etc. call them
// internally, throwing unhandled rejections in tests that open them.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// jsdom's window.scrollTo exists but logs "Not implemented" — components that
// restore scroll position (e.g. Portfolio.tsx closing the holding sheet) call
// it in every test run, not just scroll-specific ones.
window.scrollTo = () => {}

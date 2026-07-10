import '@testing-library/jest-dom'

// jsdom doesn't implement these; Radix UI's Select/Popover/etc. call them
// internally, throwing unhandled rejections in tests that open them.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
